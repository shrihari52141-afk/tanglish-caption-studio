/**
 * videoExporter.ts
 * Fixes: wrong fps, quality loss, frozen/truncated export
 * Caption rendering (drawSubtitlesOnCanvas) is NOT touched here.
 */

// ─── 1. FPS DETECTION ────────────────────────────────────────────────────────

const STANDARD_RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

function snapToStandard(fps: number): number {
  return STANDARD_RATES.reduce((a, b) =>
    Math.abs(b - fps) < Math.abs(a - fps) ? b : a
  );
}

/**
 * Detect the source video's native frame rate.
 * Uses requestVideoFrameCallback (Chrome 83+, Safari 15.1+) for accuracy.
 * Falls back to 30 fps if the API is unavailable.
 *
 * The video must already be loaded (readyState >= HAVE_METADATA).
 * It will briefly play to collect samples then pause at its current position.
 */
export function detectVideoFPS(
  video: HTMLVideoElement
): Promise<number> {
  return new Promise((resolve) => {
    // Fallback: API not available
    if (typeof video.requestVideoFrameCallback !== 'function') {
      resolve(30);
      return;
    }

    const SAMPLE_COUNT = 12;
    const samples: number[] = [];
    let lastMediaTime = -1;
    const savedTime = video.currentTime;

    const onFrame = (
      _now: DOMHighResTimeStamp,
      meta: { mediaTime: number }
    ) => {
      if (lastMediaTime >= 0) {
        const delta = meta.mediaTime - lastMediaTime;
        if (delta > 0 && delta < 0.5) samples.push(delta); // ignore stalls
      }
      lastMediaTime = meta.mediaTime;

      if (samples.length < SAMPLE_COUNT) {
        video.requestVideoFrameCallback(onFrame as VideoFrameRequestCallback);
      } else {
        // Restore state
        video.pause();
        video.currentTime = savedTime;

        const avgDelta =
          samples.reduce((a, b) => a + b, 0) / samples.length;
        const rawFps = 1 / avgDelta;
        resolve(snapToStandard(rawFps));
      }
    };

    video.requestVideoFrameCallback(onFrame as VideoFrameRequestCallback);

    // Must be playing to fire rVFC
    if (video.paused) {
      video.play().catch(() => resolve(30));
    }
  });
}

// ─── 2. BEST RECORDER OPTIONS ────────────────────────────────────────────────

export interface RecorderOptions extends MediaRecorderOptions {
  /** Resolved MIME type actually used */
  resolvedMime: string;
  /** Whether the output is MP4 (Safari) or WebM (Chrome) */
  containerFormat: 'mp4' | 'webm';
}

/**
 * Selects the highest-quality codec+container supported by the current browser
 * and returns MediaRecorder options with maximised bitrate.
 *
 * Priority:
 *  iOS Safari  → video/mp4;codecs=avc1,mp4a.40.2  (only option)
 *  Chrome/Android → vp9 > h264 > vp8 in webm
 */
export function getBestRecorderOptions(
  sourceFileSizeBytes: number,
  durationSeconds: number
): RecorderOptions {
  // Estimate source bitrate; clamp between 4 Mbps and 25 Mbps
  const estimatedSourceBitrate =
    durationSeconds > 0
      ? Math.max(4_000_000, Math.min(25_000_000, (sourceFileSizeBytes * 8) / durationSeconds))
      : 8_000_000;

  const isSafari =
    typeof navigator !== 'undefined' &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  const candidates: string[] = isSafari
    ? ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4']
    : [
        'video/webm;codecs="vp9,opus"',
        'video/webm;codecs="h264,opus"',
        'video/webm;codecs="vp8,opus"',
        'video/webm',
      ];

  const mimeType =
    candidates.find((m) => {
      try {
        return MediaRecorder.isTypeSupported(m);
      } catch {
        return false;
      }
    }) ?? '';

  const isMP4 = mimeType.includes('mp4');

  return {
    mimeType,
    resolvedMime: mimeType || 'video/webm',
    containerFormat: isMP4 ? 'mp4' : 'webm',
    videoBitsPerSecond: Math.round(estimatedSourceBitrate),
    audioBitsPerSecond: 192_000,
  };
}

// ─── 3. FRAME-LOCKED CANVAS LOOP ─────────────────────────────────────────────

/**
 * Drives canvas rendering in sync with the video's actual decoded frames
 * using requestVideoFrameCallback.
 *
 * Returns a `stop()` function. Call it when the video ends or export cancels.
 *
 * @param video   Source video element
 * @param canvas  Export canvas (already sized to video dimensions)
 * @param drawFn  Your caption compositing function — called every frame.
 *                Receives the canvas 2D context and the current media time.
 */
export function startFrameLockedLoop(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  drawFn: (ctx: CanvasRenderingContext2D, mediaTime: number) => void
): { stop: () => void } {
  const ctx = canvas.getContext('2d')!;
  let active = true;

  const onFrame: VideoFrameRequestCallback = (
    _now,
    meta
  ) => {
    if (!active) return;

    // Draw source video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Draw captions on top (caller-supplied)
    drawFn(ctx, meta.mediaTime);

    // Schedule next frame
    video.requestVideoFrameCallback(onFrame);
  };

  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback(onFrame);
  } else {
    // Fallback: rAF-based loop at native refresh rate
    const rafLoop = () => {
      if (!active) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      drawFn(ctx, video.currentTime);
      requestAnimationFrame(rafLoop);
    };
    requestAnimationFrame(rafLoop);
  }

  return {
    stop: () => {
      active = false;
    },
  };
}

// ─── 4. SAFE MEDIARECORDER WRAPPER ───────────────────────────────────────────

export interface ExportOptions {
  /** Canvas stream to record */
  stream: MediaStream;
  /** MediaRecorder options (from getBestRecorderOptions) */
  recorderOptions: RecorderOptions;
  /** Called with 0-100 progress as video plays */
  onProgress?: (pct: number) => void;
  /** Called with log messages */
  onLog?: (msg: string) => void;
  /** Called when export is complete */
  onComplete: (blob: Blob, mimeType: string) => void;
  /** Called if export fails */
  onError?: (err: unknown) => void;
  /** Ref to allow external cancellation */
  cancelRef?: { current: boolean };
  /** Total video duration in seconds (for progress) */
  duration: number;
  /** Video element — used to gate recorder.stop() on a real frame */
  video: HTMLVideoElement;
}

/**
 * Starts a MediaRecorder on the given stream with safe stop sequencing.
 *
 * Key fixes applied:
 *  - timeslice=1000ms → forces regular keyframes + flushes data frequently
 *  - stop() is gated behind one final requestVideoFrameCallback tick so the
 *    last frame is always included and Safari's MP4 fragment is closed cleanly
 *  - Blob is assembled only in onstop (never in a setTimeout)
 */
export function startSafeRecorder(opts: ExportOptions): {
  recorder: MediaRecorder;
  stop: () => void;
} {
  const {
    stream,
    recorderOptions,
    onProgress,
    onLog,
    onComplete,
    onError,
    cancelRef,
    duration,
    video,
  } = opts;

  const chunks: BlobPart[] = [];
  let recorder: MediaRecorder;

  try {
    recorder = new MediaRecorder(stream, {
      mimeType: recorderOptions.mimeType,
      videoBitsPerSecond: recorderOptions.videoBitsPerSecond,
      audioBitsPerSecond: recorderOptions.audioBitsPerSecond,
    });
  } catch (e) {
    // Codec not supported — retry without mimeType
    onLog?.('Codec unsupported, retrying with browser default…');
    recorder = new MediaRecorder(stream, {
      videoBitsPerSecond: recorderOptions.videoBitsPerSecond,
      audioBitsPerSecond: recorderOptions.audioBitsPerSecond,
    });
  }

  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.onstop = () => {
    if (cancelRef?.current) return;
    const mime =
      recorder.mimeType ||
      recorderOptions.resolvedMime ||
      'video/webm';
    const blob = new Blob(chunks, { type: mime });
    onLog?.(`Export complete — ${(blob.size / 1_048_576).toFixed(1)} MB (${mime})`);
    onComplete(blob, mime);
  };

  recorder.onerror = (e) => {
    onError?.(e);
  };

  // Progress ticker
  if (onProgress && duration > 0) {
    const tick = setInterval(() => {
      if (recorder.state === 'inactive') {
        clearInterval(tick);
        return;
      }
      const pct = Math.min(99, (video.currentTime / duration) * 100);
      onProgress(Math.round(pct));
    }, 500);
  }

  // Start with 1-second timeslice (forces keyframes + keeps fragments clean)
  recorder.start(1000);
  onLog?.(`Recording started — codec: ${recorder.mimeType || '(browser default)'}`);

  /** Safely stop: gate on one rVFC tick so the last frame is flushed */
  const stop = () => {
    if (recorder.state === 'inactive') return;

    const doStop = () => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };

    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(doStop);
    } else {
      // Fallback: wait one rAF
      requestAnimationFrame(doStop);
    }
  };

  return { recorder, stop };
}
