/**
 * useVideoExport.ts
 * Drop-in hook replacing the inline MediaRecorder export in App.tsx.
 *
 * ONLY the export pipeline is changed here.
 * Caption rendering (drawSubtitlesOnCanvas) is called externally via drawFn
 * and is completely untouched.
 *
 * Usage in App.tsx:
 *
 *   const { startExport, cancelExport, isExporting, progress, logs } =
 *     useVideoExport();
 *
 *   // Where you had the old "handleLocalExport" call:
 *   await startExport({
 *     video: videoRef.current!,
 *     audioStream,          // optional — pass existing audio MediaStream if you have it
 *     drawFn: (ctx, time) =>
 *       drawSubtitlesOnCanvas(ctx, canvas.width, canvas.height, time, words, styleSettings, video),
 *     onComplete: (blob, mime) => {
 *       setExportedBlob(blob);
 *       setExportedMimeType(mime);
 *       setExportMode('complete');
 *     },
 *   });
 */

import { useRef, useState, useCallback } from 'react';
import {
  detectVideoFPS,
  getBestRecorderOptions,
  startFrameLockedLoop,
  startSafeRecorder,
} from '../utils/videoExporter';

export interface StartExportParams {
  /** The source <video> element */
  video: HTMLVideoElement;
  /** Optional existing audio stream to mix in.
   *  If omitted, audio is captured from the video element's captureStream(). */
  audioStream?: MediaStream | null;
  /** Draw captions onto ctx at the given media time.
   *  Called every decoded frame during export. */
  drawFn: (ctx: CanvasRenderingContext2D, mediaTime: number) => void;
  /** Called with the final Blob when export succeeds */
  onComplete: (blob: Blob, mimeType: string) => void;
  /** Optional: called on export error */
  onError?: (err: unknown) => void;
}

export function useVideoExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const cancelRef = useRef(false);
  const stopFrameLoop = useRef<(() => void) | null>(null);
  const stopRecorder = useRef<(() => void) | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, msg]);
  }, []);

  const cancelExport = useCallback(() => {
    cancelRef.current = true;
    stopFrameLoop.current?.();
    stopRecorder.current?.();
    setIsExporting(false);
    setProgress(0);
    addLog('Export cancelled.');
  }, [addLog]);

  const startExport = useCallback(
    async (params: StartExportParams) => {
      const { video, audioStream, drawFn, onComplete, onError } = params;

      cancelRef.current = false;
      setIsExporting(true);
      setProgress(0);
      setLogs([]);

      try {
        // ── Step 1: detect native fps ─────────────────────────────────────────
        addLog('Detecting source frame rate…');
        const savedTime = video.currentTime;
        const fps = await detectVideoFPS(video);
        // Restore position after detection (detectVideoFPS briefly plays the video)
        video.currentTime = savedTime;
        addLog(`Detected ${fps} fps`);

        if (cancelRef.current) return;

        // ── Step 2: build export canvas ───────────────────────────────────────
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;

        // ── Step 3: choose best codec + bitrate ───────────────────────────────
        const fileSize =
          (video as HTMLVideoElement & { _sourceFile?: File })
            ._sourceFile?.size ?? 0;
        const duration = video.duration || 0;
        const recOpts = getBestRecorderOptions(fileSize, duration);
        addLog(
          `Codec: ${recOpts.resolvedMime} | ` +
          `bitrate: ${((recOpts.videoBitsPerSecond ?? 0) / 1_000_000).toFixed(1)} Mbps`
        );

        // ── Step 4: build MediaStream (video from canvas + audio) ─────────────
        const canvasStream = canvas.captureStream(fps);

        // Add audio tracks
        const audioSource = audioStream ?? (
          typeof (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream === 'function'
            ? (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream()
            : null
        );
        if (audioSource) {
          audioSource.getAudioTracks().forEach((track) =>
            canvasStream.addTrack(track)
          );
        }

        if (cancelRef.current) return;

        // ── Step 5: start recorder (safe stop sequencing) ─────────────────────
        const { recorder, stop } = startSafeRecorder({
          stream: canvasStream,
          recorderOptions: recOpts,
          onProgress: setProgress,
          onLog: addLog,
          onComplete,
          onError,
          cancelRef,
          duration,
          video,
        });
        stopRecorder.current = stop;

        // ── Step 6: frame-locked canvas loop ──────────────────────────────────
        const loop = startFrameLockedLoop(video, canvas, drawFn);
        stopFrameLoop.current = loop.stop;

        // ── Step 7: play video from beginning ────────────────────────────────
        video.currentTime = 0;
        await video.play();

        // ── Step 8: stop everything when video ends ───────────────────────────
        const onEnded = () => {
          loop.stop();
          stop(); // gated behind rVFC — safe for Safari MP4
          setProgress(100);
          setIsExporting(false);
          video.removeEventListener('ended', onEnded);
        };
        video.addEventListener('ended', onEnded);

        // Guard: recorder's onstop cleans up regardless
        recorder.addEventListener('stop', () => {
          setIsExporting(false);
        });
      } catch (err) {
        addLog(`Export error: ${String(err)}`);
        onError?.(err);
        setIsExporting(false);
      }
    },
    [addLog]
  );

  return { startExport, cancelExport, isExporting, progress, logs };
}
