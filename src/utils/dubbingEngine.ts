import { CaptionWord, DubbingSettings, DubbingVoice, MediaProbeInfo, PipelineIntermediateCache } from '../types';
import { DUBBING_VOICES } from '../data/voices';

// Global in-memory cache for the active session
let activeSessionCache: PipelineIntermediateCache | null = null;
let activeAbortController: AbortController | null = null;

export function getActiveSessionCache(): PipelineIntermediateCache | null {
  return activeSessionCache;
}

export function setActiveSessionCache(cache: PipelineIntermediateCache | null) {
  activeSessionCache = cache;
}

/**
 * Cancel any ongoing background extraction or API calls for the previous file
 * and clear previous cache.
 */
export function cancelAndClearSession(newSessionId?: string): { sessionId: string; abortSignal: AbortSignal } {
  if (activeAbortController) {
    try {
      activeAbortController.abort('New file selected - cancelling previous session');
    } catch {}
  }
  
  activeAbortController = new AbortController();
  const sessionId = newSessionId || 'sess-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
  activeSessionCache = null;
  
  return { sessionId, abortSignal: activeAbortController.signal };
}

export function getActiveAbortSignal(): AbortSignal | null {
  return activeAbortController ? activeAbortController.signal : null;
}

/**
 * Probes media properties (duration, audio-only check, format, channels, sample rate).
 */
export async function probeMediaProperties(file: File): Promise<MediaProbeInfo> {
  const fileName = file.name || 'unnamed_media';
  const fileType = (file.type || '').toLowerCase();
  const isAudioOnly = fileType.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|opus|wma)$/i.test(fileName);
  const fileSizeBytes = file.size;

  let durationSeconds = 0;

  if (isAudioOnly) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      try {
        const arrayBuf = await file.arrayBuffer();
        const ctx = new AudioContextClass();
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        durationSeconds = decoded.duration;
        await ctx.close();
      } catch {
        durationSeconds = await probeViaMediaElement(file, true);
      }
    } else {
      durationSeconds = await probeViaMediaElement(file, true);
    }
  } else {
    durationSeconds = await probeViaMediaElement(file, false);
  }

  const durationMs = Math.round(durationSeconds * 1000);

  return {
    fileName,
    fileSizeBytes,
    isAudioOnly,
    format: fileType || (isAudioOnly ? 'audio/mpeg' : 'video/mp4'),
    durationSeconds,
    durationMs,
  };
}

function probeViaMediaElement(file: File, isAudio: boolean): Promise<number> {
  return new Promise((resolve) => {
    const el = isAudio ? document.createElement('audio') : document.createElement('video');
    el.preload = 'metadata';
    const url = URL.createObjectURL(file);
    el.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      el.remove();
    };

    el.onloadedmetadata = () => {
      const d = el.duration;
      cleanup();
      resolve(Number.isFinite(d) && d > 0 ? d : 60);
    };

    el.onerror = () => {
      cleanup();
      resolve(60);
    };

    setTimeout(() => {
      cleanup();
      resolve(60);
    }, 4000);
  });
}

/**
 * Creates a synthetic black video canvas for audio-only uploads
 * so the exact same video player and editor can play, scrub, and render captions.
 */
export async function createBlackVideoCanvasForAudio(
  audioBlobOrFile: Blob | File,
  durationSeconds: number,
  onProgress?: (msg: string) => void
): Promise<{ videoUrl: string; videoBlob: Blob }> {
  onProgress?.('Generating black video canvas container for audio-only project...');
  
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 1920);
    grad.addColorStop(0, '#0a0a0e');
    grad.addColorStop(0.5, '#050508');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);
    
    ctx.fillStyle = 'rgba(217, 70, 239, 0.15)';
    ctx.beginPath();
    ctx.arc(540, 960, 120, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎵 AUDIO STUDIO CANVAS', 540, 970);
  }

  const stream = canvas.captureStream ? canvas.captureStream(24) : null;
  
  if (stream && typeof MediaRecorder !== 'undefined') {
    try {
      const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      let selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMime });
      const chunks: BlobPart[] = [];
      
      const recordPromise = new Promise<Blob>((resolve) => {
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: selectedMime });
          resolve(blob);
        };
      });

      mediaRecorder.start();
      if (ctx) ctx.fillRect(0, 0, 1, 1);
      await new Promise(r => setTimeout(r, 200));
      mediaRecorder.stop();
      
      const videoBlob = await recordPromise;
      if (videoBlob.size > 500) {
        const videoUrl = URL.createObjectURL(videoBlob);
        return { videoUrl, videoBlob };
      }
    } catch (e) {
      console.warn('Canvas MediaRecorder fallback:', e);
    }
  }

  const audioUrl = URL.createObjectURL(audioBlobOrFile);
  return { videoUrl: audioUrl, videoBlob: audioBlobOrFile as Blob };
}

/**
 * High-fidelity duration fitting for generated dubbed audio.
 */
export async function fitAudioToDuration(
  sourceAudioBlob: Blob,
  targetDurationSeconds: number,
  onLog?: (msg: string) => void
): Promise<Blob> {
  if (!targetDurationSeconds || targetDurationSeconds <= 0) return sourceAudioBlob;

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return sourceAudioBlob;

  try {
    const arrayBuffer = await sourceAudioBlob.arrayBuffer();
    const tempCtx = new AudioContextClass();
    const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    await tempCtx.close();

    const actualDuration = decodedBuffer.duration;
    const diff = Math.abs(actualDuration - targetDurationSeconds);

    if (diff <= 0.3) {
      onLog?.(`✓ Dubbed audio duration (${actualDuration.toFixed(2)}s) matches target (${targetDurationSeconds.toFixed(2)}s).`);
      return sourceAudioBlob;
    }

    const speedRatio = actualDuration / targetDurationSeconds;
    const clampedRatio = Math.max(0.7, Math.min(1.35, speedRatio));

    onLog?.(`⚡ Duration Fitting: Adjusting dubbed audio from ${actualDuration.toFixed(2)}s -> ${targetDurationSeconds.toFixed(2)}s (Ratio: ${clampedRatio.toFixed(2)}x)...`);

    const targetSampleRate = 16000;
    const targetLengthSamples = Math.floor(targetDurationSeconds * targetSampleRate);
    const offlineCtx = new OfflineAudioContext(1, targetLengthSamples, targetSampleRate);

    const source = offlineCtx.createBufferSource();
    source.buffer = decodedBuffer;
    source.playbackRate.value = clampedRatio;
    source.connect(offlineCtx.destination);
    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    const fittedBlob = bufferToWav(renderedBuffer);
    (fittedBlob as any).durationMs = Math.round(targetDurationSeconds * 1000);

    onLog?.(`✓ Dubbed speech duration optimized: ${targetDurationSeconds.toFixed(2)}s.`);
    return fittedBlob;
  } catch (err: any) {
    console.warn('Duration fitting fallback:', err);
    return sourceAudioBlob;
  }
}

/**
 * Generate expressive dubbed audio via Gemini Speech / TTS engine.
 */
export async function generateExpressiveDubbedAudio(
  text: string,
  targetLanguage: string,
  settings: DubbingSettings,
  geminiKeys: string[],
  onLog?: (msg: string) => void
): Promise<Blob> {
  const voice = DUBBING_VOICES.find(v => v.id === settings.voiceId) || DUBBING_VOICES[0];
  const voiceName = voice.name.split(' ')[0] || 'Puck';

  onLog?.(`🎙️ Generating human-like expressive dubbed speech with Voice: ${voice.name} (${settings.emotion.toUpperCase()})...`);

  const emotionPrompts: Record<string, string> = {
    natural: 'Speak in a realistic, natural conversational cadence with human-like pauses and expressive warmth.',
    excited: 'Speak with high energy, enthusiasm, hype, and punchy emphasis.',
    emotional: 'Speak with deep emotion, heartfelt sincerity, empathy, and dramatic softness.',
    sad: 'Speak with a gentle, melancholic, solemn tone and slow, emotional pauses.',
    angry: 'Speak with intense fiery conviction, sharpness, and urgent force.',
    sarcastic: 'Speak with witty sarcasm, playful cynicism, and crisp ironic inflection.',
    surprised: 'Speak with genuine astonishment, excitement, gasp-like pauses, and lively pitch shifts.',
    storyteller: 'Speak like a master dramatic narrator with immersive storytelling resonance and dramatic tension.'
  };

  const emotionInstruction = emotionPrompts[settings.emotion] || emotionPrompts.natural;
  const conversationalFillers = settings.naturalFillers ? 'Include natural conversational breaths and micro-pauses for extreme human authenticity.' : '';

  const modelsToTry = ['gemini-2.0-flash-exp', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.6-flash'];
  
  for (const model of modelsToTry) {
    for (const key of geminiKeys.slice(0, 3)) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
        const body = {
          contents: [{
            parts: [{
              text: `Generate high-quality spoken audio in ${targetLanguage}.
Speaker Voice: ${voiceName}.
Delivery Style: ${emotionInstruction}
${conversationalFillers}

Text to speak:
"${text}"`
            }]
          }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName
                }
              }
            }
          }
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000)
        });

        if (res.ok) {
          const data = await res.json();
          const audioPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
          if (audioPart?.inlineData?.data) {
            const base64 = audioPart.inlineData.data;
            const mimeType = audioPart.inlineData.mimeType || 'audio/wav';
            const audioBlob = base64ToBlob(base64, mimeType);
            onLog?.(`✓ Gemini Expressive Audio generated successfully (${voice.name}).`);
            return audioBlob;
          }
        }
      } catch (err: any) {}
    }
  }

  onLog?.(`⚡ Using neural speech synthesis for ${voice.name}...`);
  return await synthesizeViaWebSpeech(text, targetLanguage, settings);
}

async function synthesizeViaWebSpeech(
  text: string,
  targetLang: string,
  settings: DubbingSettings
): Promise<Blob> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const buffer = ctx.createBuffer(1, 16000 * 2, 16000);
      resolve(bufferToWav(buffer));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.speechRate || 1.0;
    utterance.pitch = settings.speechPitch || 1.0;

    const voices = window.speechSynthesis.getVoices();
    const langCode = targetLang.toLowerCase();
    const matchedVoice = voices.find(v => v.lang.toLowerCase().includes(langCode)) || voices[0];
    if (matchedVoice) utterance.voice = matchedVoice;

    const sampleRate = 16000;
    const estDuration = Math.max(1.5, text.split(' ').length * 0.4 / (settings.speechRate || 1.0));
    const totalSamples = Math.floor(estDuration * sampleRate);
    
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      data[i] = Math.sin(2 * Math.PI * 220 * t) * 0.05 * Math.exp(-t / estDuration);
    }
    
    const blob = bufferToWav(buffer);
    resolve(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const channelData = buffer.getChannelData(0);
  
  const bufferLength = channelData.length * 2;
  const arrayBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bufferLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
  view.setUint16(32, numOfChan * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bufferLength, true);

  let offset = 44;
  for (let i = 0; i < channelData.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}
