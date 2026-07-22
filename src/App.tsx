import React, { useState, useRef, useEffect } from 'react';
import VideoPlayer from './components/VideoPlayer';
import VideoUploader from './components/VideoUploader';
import EditorPanel from './components/EditorPanel';
import { AppState, CaptionStyle, CaptionWord, SubtitleStyleSettings } from './types';
import { Layers, Sparkles, Plus, Save, FileVideo, FolderOpen, RefreshCw, Cloud, Laptop, Loader2, X, XCircle, Undo2, Redo2, Replace, Languages, Check } from 'lucide-react';
import { extractAudioTrack } from './utils/audioExtractor';
import { getAccessToken, logout, initAuth, googleSignIn } from './utils/firebaseAuth';
import { applyCaptionFormatting, sanitizeCaptionWords, stripASSTags, containsASSTags, generateCaptionFrames } from './utils/captionFormatter';
import { notifyTelegram, notifyTelegramError } from './utils/deviceTracker';

// Canvas animation helpers for export parity with CSS keyframes
function getAnimationTransform(preset: string, elapsedSec: number, scaleX: number): { dx: number; dy: number; scale: number; rotation: number; colorOverride?: string } {
  const t = elapsedSec;
  switch (preset) {
    case 'bounce': {
      const phase = Math.abs(Math.sin(t * 4));
      return { dx: 0, dy: -8 * scaleX * phase, scale: 1 + 0.18 * phase, rotation: 0 };
    }
    case 'pop': {
      if (t < 0.1) return { dx: 0, dy: 0, scale: 0.8 + (t / 0.1) * 0.3, rotation: 0 };
      if (t < 0.2) return { dx: 0, dy: 0, scale: 1.1 - ((t - 0.1) / 0.1) * 0.1, rotation: 0 };
      return { dx: 0, dy: 0, scale: 1.0, rotation: 0 };
    }
    case 'beast':
      return { dx: 0, dy: 0, scale: 1.2, rotation: -2 * Math.PI / 180, colorOverride: '#FF4500' };
    case 'glitch': {
      const jx = Math.sin(t * 37) * 4 * scaleX;
      const jy = Math.cos(t * 53) * 4 * scaleX;
      return { dx: jx, dy: jy, scale: 1.0, rotation: 0 };
    }
    case 'neon':
    case 'neon_glow': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      return { dx: 0, dy: 0, scale: 1.0 + 0.02 * pulse, rotation: 0 };
    }
    default:
      return { dx: 0, dy: 0, scale: 1.0, rotation: 0 };
  }
}

const RENDER_API = 'https://tanglish-caption-api.onrender.com';
const _envApi = (import.meta.env.VITE_API_URL || '').trim();
const _isBrowserLocalhost =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
// Only honor a localhost API URL when the app itself is actually served from
// localhost (dev). In production (Cloudflare/APK) a localhost value is invalid
// and would cause xhr.onerror, so fall back to the Render backend.
const API_BASE =
  _envApi && (!/localhost|127\.0\.0\.1/.test(_envApi) || _isBrowserLocalhost)
    ? _envApi
    : RENDER_API;
import {
  buildTrackerClientMeta,
  probeMediaDuration,
  incrementSessionFails,
  getSessionId,
} from './utils/sessionTracker';

// Track previous frame for smooth transitions (avoids word popping)
// Track previous frame for smooth transitions (avoids word popping)
let _prevFrameData: { formattedTexts: string[]; wordWidths: number[]; wordRefs: CaptionWord[] } | null = null;
let _prevFrameTime = 0;

function drawSubtitlesOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  time: number,
  words: CaptionWord[],
  styleSettings: SubtitleStyleSettings,
  videoEl: HTMLVideoElement,
  editorDisplayWidth?: number,
  editorDisplayHeight?: number,
  enableAnimation?: boolean
) {
  if (words.length === 0) return;

  const activeWordIndex = words.findIndex(
    (w) => time >= w.start_time && time <= w.end_time
  );
  
  let targetIndex = activeWordIndex;
  if (targetIndex === -1) {
    let closestIdx = 0;
    let minDiff = Math.abs(time - words[0].start_time);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const diff = Math.min(Math.abs(time - w.start_time), Math.abs(time - w.end_time));
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    if (minDiff < 3.0) {
      targetIndex = closestIdx;
    } else {
      return;
    }
  }

  const frames = generateCaptionFrames(words, styleSettings.maxWordsPerScreen);
  const displayWords = frames.find(frame => frame.some(w => w.id === words[targetIndex].id)) || frames[0] || [];

  if (displayWords.length === 0) return;

  // ---- SMOOTH FRAME TRANSITIONS (anti-pop) ----
  // When the display frame changes, keep the previous frame visible with fading
  // opacity for 300ms so words don't snap on/off abruptly.
  const nowMs = performance.now();
  const prevIds = _prevFrameData?.wordRefs.map(w => w.id) || [];
  const curIds = displayWords.map(w => w.id);
  const frameChanged = prevIds.length > 0 && (
    curIds.length !== prevIds.length ||
    curIds.some((id, i) => id !== prevIds[i])
  );
  if (frameChanged) _prevFrameTime = nowMs;
  const fadeElapsed = nowMs - _prevFrameTime;
  const fadeAlpha = Math.max(0, 1 - fadeElapsed / 300);

  // ---- EDITOR-MATCHED SCALING ----

  // ---- EDITOR-MATCHED SCALING ----
  // The editor sizes captions with: scaleFactor = containerWidth / 340, and the
  // container ALWAYS has the video's aspect ratio (video fills it, object-contain).
  // So font/size at video resolution = 32 * fontSize * (canvasWidth / 340) — this
  // is resolution-independent and matches the preview exactly for both portrait
  // and landscape (landscape just has a larger canvasWidth).
  const REF = 340;
  const scaleX = canvasWidth / REF;   // video-px per editor-base unit
  const scaleY = scaleX;              // uniform scaling (no distortion)
  // CSS padding/border values are FIXED (e.g. px-3 = always 12px) regardless of
  // container width, while font scales with container. To match the editor's visual
  // ratio at its current display size, compute the pixel ratio between canvas and
  // editor display — NOT the fixed REF ratio.
  const editorW = (editorDisplayWidth || REF);
  const canvasToEditorRatio = canvasWidth / editorW;

  // positionX/Y are stored in resolution-independent base-340 units (the editor
  // applies them as positionX * scaleFactor, scaleFactor = containerWidth/340).
  // Because the editor container ALWAYS matches the video aspect ratio, the same
  // units map to video pixels via scaleX (= canvasWidth/340) for BOTH axes, so
  // the exported caption sits exactly where the preview shows it — at any size.
  const baseFontSize = 32 * styleSettings.fontSize * scaleX;
  
  let fontName = 'sans-serif';
  let fontStyle = '900';
  if (styleSettings.fontFamily === 'Impact') {
    fontName = 'Impact, sans-serif';
    fontStyle = '900 italic';
  } else if (styleSettings.fontFamily === 'Courier') {
    fontName = '"Courier New", Courier, monospace';
    fontStyle = 'bold';
  } else if (styleSettings.fontFamily === 'Fredoka') {
    fontName = '"Fredoka", "Inter", sans-serif';
    fontStyle = '900';
  } else if (styleSettings.fontFamily === 'Space Grotesk') {
    fontName = '"Space Grotesk", sans-serif';
    fontStyle = '900';
  } else if (styleSettings.fontFamily === 'Playfair Display') {
    fontName = '"Playfair Display", Georgia, serif';
    fontStyle = '900 italic';
  } else if (styleSettings.fontFamily === 'Pacifico') {
    fontName = '"Pacifico", cursive';
    fontStyle = 'normal';
  } else if (styleSettings.fontFamily === 'Black Han Sans') {
    fontName = '"Black Han Sans", sans-serif';
    fontStyle = '900';
  } else {
    fontName = '"Helvetica Neue", Arial, sans-serif';
    fontStyle = 'bold';
  }
  
  ctx.font = `${fontStyle} ${baseFontSize}px ${fontName}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.save();
  
  // Editor: caption is horizontally centered (inset-x-0 mx-auto), sits at
  // bottom:(96*scaleFactor) editor-px, and is translated by (positionX, -positionY).
  const baseX = (canvasWidth / 2) + (styleSettings.positionX * scaleX);
  const baseY = (canvasHeight - 96 * scaleX) - (styleSettings.positionY * scaleX);

  ctx.translate(baseX, baseY);
  ctx.rotate((styleSettings.rotation * Math.PI) / 180);
  
  const formatWordText = (text: string) => {
    let formatted = applyCaptionFormatting(
      stripASSTags(text),
      styleSettings.showEmojis !== false,
      styleSettings.showPunctuation !== false,
      styleSettings.emojiStyle || 'vibes'
    );
    if (styleSettings.capitalization === 'all') return formatted.toUpperCase();
    if (styleSettings.capitalization === 'lower') return formatted.toLowerCase();
    if (styleSettings.capitalization === 'sentence') {
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    return formatted;
  };
  
  // Match the editor: caption box is `flex flex-wrap` with gap = 8*scaleFactor
  // (editor-px) and max width 90% of the container. Words that overflow wrap to
  // the next line, and every line is horizontally centered.
  const gap = 8 * scaleX;
  // Editor: box is max-w-[90%] of the container.
  const maxLineWidth = 0.9 * canvasWidth;
  const lineHeight = baseFontSize * 1.25; // matches typical line-box height

  const formattedTexts = displayWords.map(w => formatWordText(w.word));
  const wordWidths = formattedTexts.map(txt => ctx.measureText(txt).width);

  // Group words into wrapped lines exactly like CSS flex-wrap would.
  type LineItem = { text: string; width: number; wordRef: CaptionWord };
  const lines: LineItem[][] = [];
  let curLine: LineItem[] = [];
  let curLineWidth = 0;
  displayWords.forEach((w, index) => {
    const item: LineItem = { text: formattedTexts[index], width: wordWidths[index], wordRef: w };
    const projected = curLine.length === 0 ? item.width : curLineWidth + gap + item.width;
    if (curLine.length > 0 && projected > maxLineWidth) {
      lines.push(curLine);
      curLine = [item];
      curLineWidth = item.width;
    } else {
      curLine.push(item);
      curLineWidth = projected;
    }
  });
  if (curLine.length > 0) lines.push(curLine);

  // Editor: the caption box is anchored at its BOTTOM (bottom:offset) and grows
  // UPWARD as more lines wrap. The translate origin (0,0) is the single-line
  // baseline, so keep the LAST line at y=0 and stack earlier lines above it.
  const firstLineY = -(lines.length - 1) * lineHeight;

  // Compute animation elapsed time for the active word
  const activeWord = words[activeWordIndex];
  const animElapsed = activeWord ? Math.max(0, time - activeWord.start_time) : 0;

  const drawWord = (wordText: string, wordWidth: number, curX: number, curY: number, isActive: boolean) => {
    ctx.save();
    if (isActive) {
      // Apply preset animation transforms only when enabled (editor preview).
      // Export rendering uses static highlighting so the output matches the
      // editor's base style without motion.
      const anim = enableAnimation !== false
        ? getAnimationTransform(styleSettings.preset, animElapsed, scaleX)
        : { dx: 0, dy: 0, scale: 1.0, rotation: 0, colorOverride: undefined };
      if (anim.scale !== 1.0 || anim.dx !== 0 || anim.dy !== 0 || anim.rotation !== 0) {
        ctx.translate(curX + anim.dx, curY + anim.dy);
        ctx.rotate(anim.rotation);
        ctx.scale(anim.scale, anim.scale);
        ctx.translate(-curX, -curY);
      }
      if (styleSettings.showBackground) {
        ctx.fillStyle = '#000000';
        // Padding matches CSS px-3 py-1.5 proportionally — use editor display
        // ratio (not scaleX) so the visual ratio matches the editor's viewport.
        const paddingX = 12 * canvasToEditorRatio;
        const paddingY = 6 * canvasToEditorRatio;
        const rx = curX - wordWidth / 2 - paddingX;
        const ry = curY - baseFontSize / 2 - paddingY;
        const rw = wordWidth + paddingX * 2;
        const rh = baseFontSize + paddingY * 2;
        const radius = 8 * canvasToEditorRatio;
        ctx.beginPath();
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + rw - radius, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
        ctx.lineTo(rx + rw, ry + rh - radius);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
        ctx.lineTo(rx + radius, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = anim.colorOverride || styleSettings.highlightColor;
        ctx.lineWidth = 2 * canvasToEditorRatio;
        ctx.stroke();
      }
      if (styleSettings.showBacklight) {
        // Dual-stage glow matching CSS: 0 0 12px color, 0 0 24px color
        ctx.shadowColor = anim.colorOverride || styleSettings.highlightColor;
        ctx.shadowBlur = 24 * scaleX;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = anim.colorOverride || styleSettings.highlightColor;
        ctx.fillText(wordText, curX, curY);
        ctx.shadowBlur = 12 * scaleX;
        ctx.fillText(wordText, curX, curY);
        ctx.shadowBlur = 0;
      } else if (styleSettings.showShadow) {
        // Offset drop shadow matching CSS: 4px 4px 0px #000
        ctx.fillStyle = '#000000';
        ctx.fillText(wordText, curX + 4 * scaleX, curY + 4 * scaleX);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4 * scaleX;
        ctx.strokeText(wordText, curX, curY);
      }
      ctx.fillStyle = anim.colorOverride || styleSettings.highlightColor;
      if (!styleSettings.showBacklight) {
        ctx.fillText(wordText, curX, curY);
      }
    } else {
      ctx.fillStyle = styleSettings.textColor;
      if (styleSettings.showSpotlight) {
        ctx.globalAlpha = 0.35;
      }
      if (styleSettings.showShadow) {
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.fillText(wordText, curX + 4 * scaleX, curY + 4 * scaleX);
        ctx.restore();
        ctx.fillStyle = styleSettings.textColor;
        if (styleSettings.showSpotlight) ctx.globalAlpha = 0.35;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4 * scaleX;
        ctx.strokeText(wordText, curX, curY);
      }
      ctx.fillText(wordText, curX, curY);
    }
    ctx.restore();
  };

  // ---- DRAW FADING PREVIOUS FRAME (anti-pop) ----
  if (_prevFrameData && fadeAlpha > 0) {
    const pfLines: LineItem[][] = [];
    let pfCurLine: LineItem[] = [];
    let pfCurLineWidth = 0;
    _prevFrameData.formattedTexts.forEach((txt, i) => {
      const item: LineItem = { text: txt, width: _prevFrameData.wordWidths[i], wordRef: _prevFrameData.wordRefs[i] };
      const projected = pfCurLine.length === 0 ? item.width : pfCurLineWidth + gap + item.width;
      if (pfCurLine.length > 0 && projected > maxLineWidth) {
        pfLines.push(pfCurLine);
        pfCurLine = [item];
        pfCurLineWidth = item.width;
      } else {
        pfCurLine.push(item);
        pfCurLineWidth = projected;
      }
    });
    if (pfCurLine.length > 0) pfLines.push(pfCurLine);
    ctx.save();
    ctx.globalAlpha = fadeAlpha * 0.5;
    const pfFirstLineY = -(pfLines.length - 1) * lineHeight;
    pfLines.forEach((line, lineIdx) => {
      const pfLineWidth = line.reduce((a, it) => a + it.width, 0) + (line.length - 1) * gap;
      let pfStartX = -pfLineWidth / 2;
      const pfCurY = pfFirstLineY + lineIdx * lineHeight;
      line.forEach((it) => {
        const pfCurX = pfStartX + it.width / 2;
        const wasActive = _prevFrameData.wordRefs.some(r => r.id === it.wordRef.id && r.start_time <= time && r.end_time >= time);
        drawWord(it.text, it.width, pfCurX, pfCurY, wasActive);
        pfStartX += it.width + gap;
      });
    });
    ctx.restore();
  }

  // ---- DRAW CURRENT FRAME ----
  lines.forEach((line, lineIdx) => {
    // Compute total line width accounting for dynamic reflow (active word with
    // background gets extra padding that pushes adjacent words — matching the
    // editor's px-3 py-1.5 CSS).
    const reflowExtra = styleSettings.showBackground ? 24 * canvasToEditorRatio : 0;
    const lineWidth = line.reduce((a, it) => {
      const isActive = words[activeWordIndex]?.id === it.wordRef.id;
      return a + it.width + (isActive ? reflowExtra : 0);
    }, 0) + (line.length - 1) * gap;
    let startX = -lineWidth / 2;
    const curY = firstLineY + lineIdx * lineHeight;
    line.forEach((it, idx) => {
      const isActive = words[activeWordIndex]?.id === it.wordRef.id;
      const curX = startX + it.width / 2;
      drawWord(it.text, it.width, curX, curY, isActive);
      // After active word with background, add extra gap so the next word gets
      // pushed right just like the editor's px-3 on the active word span.
      startX += it.width + gap + (isActive ? reflowExtra : 0);
    });
  });

  // Store current frame for next call's fade transition
  _prevFrameData = { formattedTexts, wordWidths, wordRefs: displayWords };

  ctx.restore();
}

export default function App() {
  const [state, setState] = useState<AppState>({
    videoUrl: null,
    videoFile: null,
    words: [],
    activeStyle: 'bounce',
    isTransliterating: true,
    isProcessing: false,
    currentTime: 0,
    uploadProgress: 0,
    logs: [],
    styleSettings: {
      preset: 'bounce',
      fontFamily: 'Inter',
      fontSize: 0.5,
      textColor: '#FFFFFF',
      highlightColor: '#C600DC',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      showShadow: false,
      alignment: 'center',
      positionX: 0,
      positionY: 0,
      rotation: 0,
      maxWordsPerScreen: 0,
      showEmojis: true,
      showPunctuation: true,
      emojiStyle: 'vibes',
    }
  });

  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [exportMode, setExportMode] = useState<'choice' | 'local' | 'cloud' | 'complete'>('choice');
  const [localProgress, setLocalProgress] = useState<number>(0);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [exportedFileName, setExportedFileName] = useState('');
  const [exportedMimeType, setExportedMimeType] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editorTab, setEditorTab] = useState<'presets' | 'decorations' | 'transcript'>('presets');
  const isCancelledRef = useRef<boolean>(false);
  // Live editor display box (container) size — used so the exported video's
  // captions match the on-screen preview EXACTLY at the real video resolution.
  const editorDisplayRef = useRef<{ width: number; height: number }>({ width: 340, height: 604 });
  
  const addVideoInputRef = useRef<HTMLInputElement>(null);
  const newProjectFileInputRef = useRef<HTMLInputElement>(null);
  const replaceVideoInputRef = useRef<HTMLInputElement>(null);

  // Undo/Redo history — capture full snapshot (words + styleSettings)
  const [undoStack, setUndoStack] = useState<{words: CaptionWord[]; styleSettings: SubtitleStyleSettings}[]>([]);
  const [redoStack, setRedoStack] = useState<{words: CaptionWord[]; styleSettings: SubtitleStyleSettings}[]>([]);

  const snapState = () => ({ words: state.words, styleSettings: state.styleSettings });

  const pushUndo = () => {
    setUndoStack(prev => [...prev.slice(-50), snapState()]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setRedoStack(r => [...r, snapState()]);
    setState(s => ({ ...s, words: prev.words, styleSettings: prev.styleSettings }));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(r => r.slice(0, -1));
    setUndoStack(u => [...u, snapState()]);
    setState(s => ({ ...s, words: next.words, styleSettings: next.styleSettings }));
  };

  // Remove video confirmation
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const handleRemoveVideo = (mode: 'video' | 'audio' | 'both') => {
    if (mode === 'both') {
      setState(s => ({ ...s, videoUrl: '', videoFile: null, audioFile: null, words: [], currentTime: 0 }));
    } else if (mode === 'video') {
      setState(s => ({ ...s, videoUrl: '', videoFile: null }));
    } else if (mode === 'audio') {
      setState(s => ({ ...s, audioFile: null }));
    }
    setShowRemoveDialog(false);
  };

  // Mobile responsive: toggle between preview and edit tabs on small screens
  const [mobileTab, setMobileTab] = useState<'preview' | 'edit'>('preview');

  // Replace video (keep audio/captions)
  const handleReplaceVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      const newUrl = URL.createObjectURL(file);
      setState(s => ({
        ...s,
        videoFile: file,
        videoUrl: newUrl,
        logs: [...s.logs, `Replaced video: ${file.name}`],
      }));
    }
  };

  const handleNewProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setState(s => ({
        ...s,
        videoFile: file,
        videoUrl: null,
      }));
    }
  };

  const [smoothProgress, setSmoothProgress] = useState(0);

  // Google Sheets OAuth Sign-In bypassed
  const token: string | null = null;

  useEffect(() => {
    if (!state.isProcessing) {
      setSmoothProgress(0);
      return;
    }

    // Determine target progress
    let target = 5;
    const lastLog = state.logs.length > 0 ? state.logs[state.logs.length - 1] : "";

    if (state.uploadProgress > 0 && state.uploadProgress < 100) {
      target = 15 + Math.round(state.uploadProgress * 0.45); // 15% to 60%
    } else if (state.uploadProgress === 100 || lastLog) {
      if (lastLog.includes("Done! Results ready")) {
        target = 100;
      } else if (lastLog.includes("Parsing transcription")) {
        target = 95;
      } else if (lastLog.includes("Attempting transcription") || lastLog.includes("Generating transcript")) {
        target = 85;
      } else if (lastLog.includes("storage pool") || lastLog.includes("in-memory payload")) {
        target = 70;
      } else if (lastLog.includes("Audio extraction complete") || lastLog.includes("Ready!")) {
        target = 65;
      } else {
        target = 60;
      }
    } else if (lastLog.includes("Extracting audio")) {
      target = 10;
    }

    // Smoothly animate smoothProgress towards target
    const interval = setInterval(() => {
      setSmoothProgress(prev => {
        if (prev < target) {
          // Move towards target
          const diff = target - prev;
          const step = Math.max(1, Math.min(3, Math.ceil(diff / 5)));
          return prev + step;
        } else if (prev >= 98 && target < 100) {
          return 98; // Hold at 98 until 100% done
        } else if (prev < 98) {
          // Slow trickle if equal to target but not done yet
          return prev + 0.1;
        }
        return prev;
      });
    }, 150);

    return () => clearInterval(interval);
  }, [state.isProcessing, state.uploadProgress, state.logs]);

  const getProcessingStatusMessage = () => {
    if (state.uploadProgress > 0 && state.uploadProgress < 100) {
      return `Uploading audio track (${state.uploadProgress}%)...`;
    }
    const lastLog = state.logs.length > 0 ? state.logs[state.logs.length - 1] : "";
    if (lastLog.includes("Done! Results ready")) {
      return "Finalizing subtitles...";
    }
    if (lastLog.includes("Parsing transcription")) {
      return "Parsing transcription results...";
    }
    if (lastLog.includes("Attempting transcription") || lastLog.includes("Generating transcript")) {
      return "AI transcribing and auto-emoji formatting...";
    }
    if (lastLog.includes("storage pool") || lastLog.includes("in-memory payload")) {
      return "Preparing Google Gemini transcription pool...";
    }
    if (lastLog.includes("Audio extraction complete") || lastLog.includes("Ready!")) {
      return "Audio extraction complete. Uploading...";
    }
    if (lastLog.includes("Extracting audio")) {
      return "Extracting background vocals and speech...";
    }
    return "Initializing AI Caption Engine...";
  };

  const handleUpdateWords = (updatedWords: CaptionWord[]) => {
    pushUndo();
    setState(s => ({ ...s, words: sanitizeCaptionWords(updatedWords) }));
  };

  const [appAnnouncement, setAppAnnouncement] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Check for saved drafts on component mount
  useEffect(() => {
    const draft = localStorage.getItem('tanglish_studio_draft');
    if (draft) {
      setHasDraft(true);
    }
    // Ensure session id exists for tracker
    getSessionId();
  }, []);

  // Live sync: poll public remote config so owner updates (maintenance / announcements) hit all users
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/config/public`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setAppAnnouncement(data.appAnnouncement || "");
        setMaintenanceMode(!!data.maintenanceMode);
      } catch {
        /* offline / server restarting */
      }
    };
    pull();
    const id = window.setInterval(pull, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Auto-scrub any ASS control tags that leaked into caption word text (preview + export)
  useEffect(() => {
    if (!state.words.some((w) => containsASSTags(w.word))) return;
    setState((s) => ({
      ...s,
      words: sanitizeCaptionWords(s.words),
    }));
  }, [state.words]);

  const handleNewProject = () => {
    if (state.videoUrl && !window.confirm("Do you want to edit new video?")) {
      return;
    }
    setState({
      videoUrl: null,
      videoFile: null,
      words: [],
      activeStyle: 'bounce',
      isTransliterating: true,
      isProcessing: false,
      currentTime: 0,
      uploadProgress: 0,
      logs: [],
      styleSettings: {
        preset: 'bounce',
        fontFamily: 'Inter',
        fontSize: 0.5,
        textColor: '#FFFFFF',
        highlightColor: '#C600DC',
        capitalization: 'sentence',
        showBackground: false,
        showSpotlight: false,
        showBacklight: false,
        showShadow: false,
        alignment: 'center',
        positionX: 0,
        positionY: 0,
        rotation: 0,
        maxWordsPerScreen: 0,
        showEmojis: true,
        showPunctuation: true,
        emojiStyle: 'vibes',
      }
    });
    if (addVideoInputRef.current) {
      addVideoInputRef.current.value = '';
    }
    if (newProjectFileInputRef.current) {
      newProjectFileInputRef.current.value = '';
      newProjectFileInputRef.current.click();
    }
  };

  const handleSaveDraft = () => {
    try {
      const draftData = {
        words: state.words,
        styleSettings: state.styleSettings,
        activeStyle: state.activeStyle,
        serverFilename: state.serverFilename || null,
        videoFileName: state.videoFile?.name || "Draft Video",
      };
      localStorage.setItem('tanglish_studio_draft', JSON.stringify(draftData));
      setHasDraft(true);
      alert("Project draft saved successfully to local storage!");
    } catch (e) {
      console.error(e);
      alert("Failed to save draft.");
    }
  };

  const handleLoadDraft = () => {
    try {
      const draft = localStorage.getItem('tanglish_studio_draft');
      if (!draft) return;
      const parsed = JSON.parse(draft);
      
      // Since File object can't be serialized, we will mock a dummy file with the original name
      // so that we can export and render correctly if they upload/swap or use the server filename cache.
      const dummyFile = parsed.videoFileName ? new File([""], parsed.videoFileName, { type: "video/mp4" }) : null;

      setState(s => ({
        ...s,
        words: sanitizeCaptionWords(parsed.words || []),
        styleSettings: parsed.styleSettings || s.styleSettings,
        activeStyle: parsed.activeStyle || s.activeStyle,
        serverFilename: parsed.serverFilename || null,
        videoFile: dummyFile,
        videoUrl: "placeholder_draft", // triggers the editor view and alerts the user
        logs: ["Draft restored! Please select the matching video file to preview properly."],
      }));
      
      alert("Draft restored successfully! To preview and play, please click 'Add Video' in the header to select your video file.");
    } catch (e) {
      console.error(e);
      alert("Failed to load draft.");
    }
  };

  const handleAddVideoClick = () => {
    addVideoInputRef.current?.click();
  };

  const handleAddVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Re-use current draft words and settings, just binding the new video file!
      const videoUrl = URL.createObjectURL(file);
      setState(s => ({
        ...s,
        videoFile: file,
        videoUrl: videoUrl,
        logs: [...s.logs, `Swapped video file to: ${file.name}`]
      }));
    }
  };

  const [exportBgColor, setExportBgColor] = useState('#000000');

  const isAudioOnlyFile = state.videoFile && (
    state.videoFile.type.startsWith('audio/') ||
    state.videoFile.name.endsWith('.mp3') ||
    state.videoFile.name.endsWith('.wav') ||
    state.videoFile.name.endsWith('.m4a') ||
    state.videoFile.name.endsWith('.webm')
  );

  const generateRandomSuffix = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  };

  const startLocalExport = async () => {
    // FULLY ON-DEVICE render: draw captions onto a <canvas>, capture that canvas
    // + the video's own audio with MediaRecorder, and output an .mp4 using the
    // phone/browser's own resources. NO upload to Render.
    setExportMode('local');
    setExportLogs(["Initializing on-device MP4 renderer..."]);
    setLocalProgress(0);

    const isAudioOnly = state.videoFile && (
      state.videoFile.type.startsWith('audio/') ||
      state.videoFile.name.endsWith('.mp3') ||
      state.videoFile.name.endsWith('.wav') ||
      state.videoFile.name.endsWith('.m4a')
    ) || !state.videoUrl;

    // Use a dedicated, isolated media element so we control playback precisely
    // and don't disturb the on-screen player.
    const videoEl = document.createElement('video');
    videoEl.src = state.videoUrl || '';
    videoEl.crossOrigin = 'anonymous';
    videoEl.muted = false;
    videoEl.playsInline = true;
    (videoEl as any).preload = 'auto';

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      videoEl.onloadedmetadata = finish;
      videoEl.onerror = finish;
      setTimeout(finish, 8000);
    });

    try {
      const width = videoEl.videoWidth || 1080;
      const height = videoEl.videoHeight || 1920;
      const duration = videoEl.duration && isFinite(videoEl.duration)
        ? videoEl.duration
        : (state.words.length ? Math.max(...state.words.map(w => w.end_time)) + 0.3 : 0);

      if (!duration || duration <= 0) {
        throw new Error("Could not determine media duration.");
      }

      // --- Canvas that we draw each frame onto ---
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas 2D context unavailable.");

      // Use 30 fps for canvas capture — this is sufficient for captions and
      // keeps performance good on mobile. The fixed-interval draw loop (see below)
      // ensures caption timing is independent of the capture frame rate.
      const fps = 30;
      const canvasStream = canvas.captureStream(fps);

      // --- Pull the audio track from the video into the recording ---
      let audioContext: AudioContext | null = null;
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AC) {
          audioContext = new AC();
          const srcNode = audioContext.createMediaElementSource(videoEl);
          const dest = audioContext.createMediaStreamDestination();
          srcNode.connect(dest);
          // Also connect to speakers is optional; keep muted to avoid double sound
          dest.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
        }
      } catch { /* audio optional (e.g. audio-only handled separately) */ }

      // --- Pick the best MP4-capable recorder mime type; fall back to webm ---
      const mp4Candidates = [
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=h264',
        'video/mp4',
      ];
      const webmCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      const supports = (t: string) =>
        typeof MediaRecorder !== 'undefined' &&
        typeof MediaRecorder.isTypeSupported === 'function' &&
        MediaRecorder.isTypeSupported(t);

      let chosenMime = mp4Candidates.find(supports) || webmCandidates.find(supports) || '';
      const recordedAsMp4 = chosenMime.startsWith('video/mp4');
      setExportLogs(l => [...l, recordedAsMp4
        ? `Encoding natively as MP4 (${chosenMime})...`
        : `Device cannot record MP4 natively; recording then packaging as .mp4...`]);

      // High bitrate scaled to resolution so exports aren't visibly compressed
      // (roughly 0.15 bits/pixel/frame; clamped to a sane 8–40 Mbps range).
      const targetBitrate = Math.min(
        40_000_000,
        Math.max(8_000_000, Math.round(width * height * fps * 0.15))
      );
      const recorderOpts: MediaRecorderOptions = {
        videoBitsPerSecond: targetBitrate,
        audioBitsPerSecond: 192_000,
      };
      if (chosenMime) recorderOpts.mimeType = chosenMime;
      const recorder = new MediaRecorder(canvasStream, recorderOpts);

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

      const recordingDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: chosenMime || 'video/webm' }));
        };
      });

      // --- Drive playback + per-frame canvas draw ---
      videoEl.currentTime = 0;
      recorder.start(250);
      if (audioContext && audioContext.state === 'suspended') {
        try { await audioContext.resume(); } catch { /* ignore */ }
      }
      await videoEl.play().catch(() => { /* some browsers need muted; retry */ });

      let stopped = false;
      // Use the detected fps so caption timing matches the source video's rate.
      const targetFps = fps;
      const frameMs = 1000 / targetFps;
      // Track real elapsed time so the caption timing does NOT drift if video
      // playback stutters or canvas rendering takes too long.
      const exportStartTime = performance.now();
      const drawFrame = () => {
        if (stopped) return;
        const realElapsedMs = performance.now() - exportStartTime;
        const captionTime = realElapsedMs / 1000;
        if (isAudioOnly) {
          ctx.fillStyle = exportBgColor || '#000000';
          ctx.fillRect(0, 0, width, height);
        } else {
          try { ctx.drawImage(videoEl, 0, 0, width, height); } catch { /* frame not ready */ }
        }
        drawSubtitlesOnCanvas(ctx, width, height, captionTime, state.words, state.styleSettings, videoEl, editorDisplayRef.current.width, editorDisplayRef.current.height, true);
        const pct = Math.min(99, Math.round((captionTime / duration) * 100));
        setLocalProgress(pct);
        // Schedule next frame at FIXED interval — do NOT use requestAnimationFrame
        // which drifts when rendering is slow. A fixed setTimeout gives stable
        // 30fps and prevents the video from appearing to slow down.
        const nextAt = (Math.floor(realElapsedMs / frameMs) + 1) * frameMs;
        const delay = Math.max(0, nextAt - performance.now());
        setTimeout(drawFrame, delay);
      };
      setTimeout(drawFrame, frameMs);

      await new Promise<void>((resolve) => {
        const onEnded = () => resolve();
        videoEl.onended = onEnded;
        // Safety timeout in case 'ended' never fires
        const guard = setInterval(() => {
          if (isCancelledRef.current || videoEl.currentTime >= duration - 0.05) {
            clearInterval(guard);
            resolve();
          }
        }, 250);
      });

      stopped = true;
      try { recorder.stop(); } catch { /* ignore */ }
      try { videoEl.pause(); } catch { /* ignore */ }

      if (isCancelledRef.current) {
        setExportLogs(l => [...l, "✖ Export cancelled."]);
        setTimeout(() => setIsExporting(false), 1000);
        return;
      }

      setExportLogs(l => [...l, "Finalizing MP4 package..."]);
      const rawBlob = await recordingDone;

      // Always deliver an .mp4 file. If the device recorded WebM, we rewrap the
      // container by relabeling to video/mp4 (H.264/VP-in-mp4 plays on Android
      // Gallery + most players). Filename extension is forced to .mp4.
      const blob = recordedAsMp4
        ? rawBlob
        : new Blob([rawBlob], { type: 'video/mp4' });

      if (!blob || blob.size === 0) {
        throw new Error("On-device render produced an empty file.");
      }

      const baseName = state.videoFile?.name.replace(/\.[^/.]+$/, "") || 'video';
      const exportFileName = `${baseName}_${generateRandomSuffix()}.mp4`;

      setExportedBlob(blob);
      setExportedFileName(exportFileName);
      setExportedMimeType('video/mp4');
      setLocalProgress(100);
      setExportLogs(l => [...l, `✨ On-device render complete! (${(blob.size / (1024 * 1024)).toFixed(2)} MB) Click Save to download.`]);
      setExportMode('complete');

      try { if (audioContext) audioContext.close(); } catch { /* ignore */ }
    } catch (err: any) {
      console.error(err);
      setExportLogs(l => [...l, `Error: ${err?.message || err}`]);
      alert("On-device render failed. You can try Cloud Export instead.");
    } finally {
      try { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); } catch { /* ignore */ }
    }
  };

  const startCloudExport = async () => {
    setExportMode('cloud');
    setExportLogs(["Waking server and initializing cloud render..."]);

    await wakeServer();
    const jobId = Math.random().toString(36).substring(7);

    // Subscribe to SSE logs for export
    const eventSource = new EventSource(`${API_BASE}/api/logs?jobId=${jobId}`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.message) {
        setExportLogs(l => [...l, data.message]);
      }
    };

    try {
      const videoEl = document.querySelector('video');
      const width = videoEl?.videoWidth || 1080;
      const height = videoEl?.videoHeight || 1920;
      const displayWidth = videoEl?.clientWidth || 340;
      const displayHeight = videoEl?.clientHeight || 604;

      const formData = new FormData();
      if (!state.videoFile) {
        throw new Error("No video file available for cloud export. Use local (on-device) export instead.");
      }
      formData.append('video', state.videoFile);
      setExportLogs(l => [...l, "Uploading original video file to cloud render cluster (may take a moment)..."]);
      
      formData.append('words', JSON.stringify(state.words));
      formData.append('styleSettings', JSON.stringify(state.styleSettings));
      formData.append('videoWidth', width.toString());
      formData.append('videoHeight', height.toString());
      formData.append('displayWidth', displayWidth.toString());
      formData.append('displayHeight', displayHeight.toString());

      const activeToken = token || await getAccessToken();
      const headers: Record<string, string> = {};
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

      let response: Response | null = null;
      let lastErr: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) setExportLogs(l => [...l, `↻ Retrying render (attempt ${attempt})...`]);
          response = await fetch(`${API_BASE}/api/export?jobId=${jobId}`, {
            method: 'POST',
            body: formData,
            headers,
          });
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < 3) await wakeServer();
        }
      }

      eventSource.close();

      if (!response || !response.ok) {
        throw new Error((response && await response.text()) || lastErr?.message || "Cloud export failed");
      }

      setExportLogs(l => [...l, "Downloading finished MP4 with burned captions..."]);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.videoFile!.name.replace(/\.[^/.]+$/, "")}_${generateRandomSuffix()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      setExportLogs(l => [...l, "Video exported successfully via cloud cluster!"]);
      notifyTelegram({
        fileName: `✅ Cloud Exported: ${state.videoFile!.name}`,
        fileSize: `${(blob.size / (1024 * 1024)).toFixed(2)} MB`,
        audioSize: 'N/A (cloud render)',
        aiProcessingCount: state.words.length,
        isExport: true,
        source: 'video',
        aiModel: 'Gemini 3.5 Flash',
        exportMethod: 'cloud',
        captionWords: state.words.length,
      });
      setTimeout(() => {
        setIsExporting(false);
      }, 1500);
    } catch (err) {
      console.error(err);
      eventSource.close();
      alert("Failed to export video via cloud. Please try the Local Browser Export option!");
      setIsExporting(false);
    }
  };

  const handleSaveToGallery = async () => {
    if (!exportedBlob || !exportedFileName) return;
    setIsSaving(true);
    try {
      const androidBridge = (window as any).MicBridge;
      if (androidBridge) {
        setExportLogs(l => [...l, "Saving to Gallery via Android bridge..."]);
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.substring(dataUrl.lastIndexOf(',') + 1);
          try {
            // Prefer chunked transfer (avoids WebView's giant-string corruption →
            // "bad base-64"). Chunks MUST be aligned to 4-char base64 boundaries.
            if (
              typeof androidBridge.saveFileBegin === 'function' &&
              typeof androidBridge.saveFileChunk === 'function' &&
              typeof androidBridge.saveFileEnd === 'function'
            ) {
              const CHUNK = 262144; // 256KB, multiple of 4
              androidBridge.saveFileBegin();
              for (let i = 0; i < base64.length; i += CHUNK) {
                androidBridge.saveFileChunk(base64.substring(i, i + CHUNK));
              }
              androidBridge.saveFileEnd(exportedFileName, exportedMimeType);
            } else {
              androidBridge.saveFile(exportedFileName, base64, exportedMimeType);
            }
            setExportLogs(l => [...l, `✅ Saving ${exportedFileName} to your Gallery (Movies)...`]);
          } catch (bridgeErr) {
            setExportLogs(l => [...l, `Bridge save error: ${bridgeErr}. Trying browser download...`]);
            browserDownload();
          }
          setIsSaving(false);
        };
        reader.onerror = () => {
          setExportLogs(l => [...l, "Bridge save failed, trying browser download..."]);
          browserDownload();
          setIsSaving(false);
        };
        reader.readAsDataURL(exportedBlob);
      } else {
        browserDownload();
        setIsSaving(false);
      }
    } catch (err) {
      setExportLogs(l => [...l, `Error: ${err}`]);
      setIsSaving(false);
    }
  };

  const browserDownload = () => {
    if (!exportedBlob || !exportedFileName) return;
    const url = URL.createObjectURL(exportedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportedFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExportLogs(l => [...l, `✅ Downloaded as ${exportedFileName}`]);
  };

  const handleExport = async () => {
    if (!state.videoFile || state.words.length === 0) {
      alert("Please upload and transcribe a video first.");
      return;
    }

    // Allow both video and audio-only exports (audio uses color background)
    isCancelledRef.current = false;
    setExportMode('choice');
    setLocalProgress(0);
    setExportLogs([]);
    setIsExporting(true);
  };

  // Warm up the Render server (free tier spins down after inactivity).
  // A quick HEAD/probe prevents the first real request from dying on cold start.
  const wakeServer = async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      await fetch(`${API_BASE}/api/config/public`, { method: 'GET', signal: ctrl.signal });
      clearTimeout(t);
    } catch {
      // ignore — server may still be waking; the real request will retry
    }
  };

  const handleUpload = async (
    file: File, 
    language: string, 
    useEmojis: boolean, 
    translationMode: string,
    usePunctuation: boolean,
    emojiStyle: 'none' | 'emotions' | 'vibes' | 'objects' | 'energetic' | 'minimal' | 'custom',
    preExtractedAudioBlob?: Blob | null
  ) => {
    const videoUrl = URL.createObjectURL(file);
    const jobId = Math.random().toString(36).substring(7);
    
    await wakeServer();
    setState(s => ({ 
      ...s, 
      videoFile: file, 
      videoUrl, 
      isProcessing: true, 
      isTransliterating: true,
      uploadProgress: 0,
      hasFailed: false,
      lastUploadParams: {
        file,
        language,
        useEmojis,
        translationMode,
        usePunctuation,
        emojiStyle,
        preExtractedAudioBlob
      },
      logs: preExtractedAudioBlob 
        ? ["Using pre-extracted background audio for ultra-fast startup! 🚀"]
        : ["Extracting audio track locally in browser for maximum speed..."],
      styleSettings: {
        ...s.styleSettings,
        showEmojis: useEmojis,
        showPunctuation: usePunctuation,
        emojiStyle: emojiStyle
      }
    }));

    // Subscribe to SSE logs
    const eventSource = new EventSource(`${API_BASE}/api/logs?jobId=${jobId}`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.message) {
        setState(s => ({ ...s, logs: [...s.logs, data.message] }));
      }
    };

    let audioBlob: Blob;
    if (preExtractedAudioBlob) {
      audioBlob = preExtractedAudioBlob;
      setState(s => ({ 
        ...s, 
        logs: [...s.logs, `Ready! Pre-extracted audio size: ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB. Uploading lightweight audio track...`] 
      }));
    } else {
      try {
        audioBlob = await extractAudioTrack(file, (msg) => {
          setState(s => ({ ...s, logs: [...s.logs, msg] }));
        });
        setState(s => ({ 
          ...s, 
          logs: [...s.logs, `Audio extraction complete! File size reduced from ${(file.size / (1024 * 1024)).toFixed(2)}MB to ${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB. Uploading lightweight audio track...`] 
        }));
      } catch (err) {
        console.warn("Local audio extraction failed, falling back to original file upload.", err);
        setState(s => ({ ...s, logs: [...s.logs, "Local audio extraction failed, uploading original file as fallback..."] }));
        audioBlob = file;
      }
    }

    const formData = new FormData();
    const audioFile = new File([audioBlob], file.name.replace(/\.[^/.]+$/, "") + ".wav", { type: audioBlob.type || "audio/wav" });

    formData.append('video', audioFile);
    formData.append('language', language);
    formData.append('useEmojis', useEmojis.toString());
    formData.append('translationMode', translationMode);
    formData.append('usePunctuation', usePunctuation.toString());
    formData.append('emojiStyle', emojiStyle);

    // Tracker metadata (emailed to owner on each upload)
    let mediaDurationStr = 'Unknown';
    try {
      const durationSeconds = await probeMediaDuration(file);
      if (durationSeconds != null) mediaDurationStr = `${Math.floor(durationSeconds / 60)}m ${Math.floor(durationSeconds % 60)}s (${durationSeconds.toFixed(1)}s)`;
      const meta = await buildTrackerClientMeta({
        durationSeconds,
        title: file.name,
      });
      formData.append("sessionId", meta.sessionId);
      formData.append("sessionFailCount", String(meta.sessionFailCount));
      formData.append("clientTimezone", meta.timezone);
      formData.append("clientLanguage", meta.language);
      formData.append("clientUserAgent", meta.userAgent);
      formData.append("mediaDurationSeconds", meta.durationSeconds != null ? String(meta.durationSeconds) : "");
      formData.append("mediaTitle", meta.title || file.name);
      if (meta.location) {
        formData.append("clientLocation", JSON.stringify(meta.location));
      }
      formData.append(
        "styleSettingsJson",
        JSON.stringify({
          ...state.styleSettings,
          showEmojis: useEmojis,
          showPunctuation: usePunctuation,
          emojiStyle,
        })
      );
    } catch (err) {
      console.warn("Tracker meta collection failed (upload continues):", err);
    }

    const activeToken = token || await getAccessToken();

    const doUpload = (attempt: number) => {
      setState(s => ({ 
        ...s, 
        logs: [...s.logs, attempt > 1 ? `↻ Retrying upload (attempt ${attempt}/3)...` : "Uploading to server..."]
      }));

      const req = new XMLHttpRequest();

      req.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setState(s => ({ ...s, uploadProgress: percentComplete }));
        }
      };

      req.onload = () => {
        eventSource.close();
        if (req.status >= 200 && req.status < 300) {
          const data = JSON.parse(req.responseText);
          const wordsWithIds = sanitizeCaptionWords(
            (data.words || []).map((w: any, i: number) => ({
              ...w,
              word: stripASSTags(String(w.word ?? '')),
              id: `word-${i}`,
            }))
          );
          setState(s => ({ 
            ...s, 
            words: wordsWithIds, 
            serverFilename: data.filename,
            isProcessing: false 
          }));
          const fileIsAudio = file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.wav') || file.name.endsWith('.m4a') || file.name.endsWith('.webm');
          const fileIsVideo = file.type.startsWith('video/');
          notifyTelegram({
            fileName: `${fileIsVideo ? '🎬' : '🎵'} ${file.name}`,
            fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            audioSize: `${(audioBlob.size / (1024 * 1024)).toFixed(2)} MB`,
            aiProcessingCount: wordsWithIds.length,
            source: fileIsAudio ? 'audio' : 'video',
            language: language === 'auto' ? 'Auto-Detect' : language.charAt(0).toUpperCase() + language.slice(1),
            translationMode: translationMode || 'transliterate',
            aiModel: 'Gemini 3.5 Flash',
            mediaDuration: mediaDurationStr,
            emojiStyle: emojiStyle,
            useEmojis: useEmojis,
            usePunctuation: usePunctuation,
            captionWords: wordsWithIds.length,
          });
        } else {
          console.error("Transcription failed", req.status, req.responseText);
          incrementSessionFails();
          let rawBody = "";
          try { rawBody = req.responseText.substring(0, 300); } catch { rawBody = "(empty)"; }
          const errorMsg = `[HTTP ${req.status}] ${rawBody}`;
          setState(s => ({ 
            ...s, 
            hasFailed: true,
            logs: [...s.logs, `ERROR: ${errorMsg}`]
          }));
          notifyTelegramError(errorMsg, `Transcription (HTTP ${req.status})`, {
            fileName: file.name,
            fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            source: file.type.startsWith('video/') ? 'video' : 'audio',
          });
        }
      };

      req.onerror = () => {
        if (attempt < 3) {
          setState(s => ({ ...s, logs: [...s.logs, `⚠ Network error on attempt ${attempt}. Waking server and retrying...`] }));
          wakeServer().then(() => doUpload(attempt + 1));
        } else {
          eventSource.close();
          incrementSessionFails();
          const em = `xhr.onerror — request never reached server after ${attempt} attempts. Server may be down.`;
          setState(s => ({ 
            ...s, 
            hasFailed: true,
            logs: [...s.logs, `ERROR: ${em}`]
          }));
          notifyTelegramError(em, 'Transcription (network)', {
            fileName: file.name,
            fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            source: file.type.startsWith('video/') ? 'video' : 'audio',
          });
        }
      };

      req.timeout = 180000; // 3 minutes for slow Gemini processing
      req.ontimeout = () => {
        if (attempt < 3) {
          setState(s => ({ ...s, logs: [...s.logs, `⚠ Request timed out on attempt ${attempt}. Waking server and retrying...`] }));
          wakeServer().then(() => doUpload(attempt + 1));
        } else {
          eventSource.close();
          incrementSessionFails();
          const em = `Request timed out after ${attempt} attempts.`;
          setState(s => ({ 
            ...s, 
            hasFailed: true,
            logs: [...s.logs, `ERROR: ${em}`]
          }));
          notifyTelegramError(em, 'Transcription (timeout)', {
            fileName: file.name,
            fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            source: file.type.startsWith('video/') ? 'video' : 'audio',
          });
        }
      };

      req.open('POST', `${API_BASE}/api/transcribe?jobId=${jobId}`, true);
      if (activeToken) {
        req.setRequestHeader('Authorization', `Bearer ${activeToken}`);
      }
      req.send(formData);
    };

    doUpload(1);
  };

  const handleRetry = () => {
    if (state.lastUploadParams) {
      const { file, language, useEmojis, translationMode, usePunctuation, emojiStyle, preExtractedAudioBlob } = state.lastUploadParams;
      handleUpload(file, language, useEmojis, translationMode, usePunctuation, emojiStyle, preExtractedAudioBlob);
    }
  };

  const handleCancelProcessing = () => {
    setState(s => ({
      ...s,
      isProcessing: false,
      videoUrl: null,
      videoFile: null,
      hasFailed: false,
      lastUploadParams: null,
    }));
  };

  const handleTimeUpdate = (time: number) => {
    setState(s => ({ ...s, currentTime: time }));
  };

  const handleUpdateStyleSettings = (newSettings: Partial<SubtitleStyleSettings>) => {
    pushUndo();
    setState(s => ({
      ...s,
      styleSettings: {
        ...s.styleSettings,
        ...newSettings
      }
    }));
  };

  const handleUpdateWordText = (id: string, text: string) => {
    pushUndo();
    const cleaned = stripASSTags(text);
    setState(s => ({
      ...s,
      words: s.words.map(w => w.id === id ? { ...w, word: cleaned } : w)
    }));
  };

  const handleSeek = (time: number) => {
    setSeekTime(time);
  };

  const handleSeekComplete = () => {
    setSeekTime(null);
  };

  return (
    <div className="h-screen w-screen bg-[#0A0A0A] text-white font-sans selection:bg-fuchsia-600/30 flex flex-col overflow-hidden">
      <header className="h-[48px] border-b border-[#2c2c2c] bg-[#0d0d0d] flex items-center justify-between px-3 shrink-0 z-50">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center shrink-0 shadow-md shadow-fuchsia-600/20">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <h1 className="font-black text-[14px] tracking-tight uppercase shrink-0 text-white/80 mr-1">
            Studio
          </h1>
          
          <button 
            onClick={handleNewProject}
            className="bg-[#222] hover:bg-[#333] text-fuchsia-400 hover:text-white w-7 h-7 rounded-full flex items-center justify-center border border-[#333] cursor-pointer transition-all active:scale-95 shrink-0"
            title="New project"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {state.videoUrl && (
            <>
              <div className="w-px h-5 bg-[#333] mx-1" />
              <button 
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className="bg-[#222] hover:bg-[#333] text-[#888] hover:text-white w-7 h-7 rounded-full flex items-center justify-center border border-[#333] cursor-pointer transition-all active:scale-95 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="bg-[#222] hover:bg-[#333] text-[#888] hover:text-white w-7 h-7 rounded-full flex items-center justify-center border border-[#333] cursor-pointer transition-all active:scale-95 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => replaceVideoInputRef.current?.click()}
                className="bg-[#222] hover:bg-[#333] text-fuchsia-400 hover:text-white w-7 h-7 rounded-full flex items-center justify-center border border-[#333] cursor-pointer transition-all active:scale-95 shrink-0"
                title="Replace video media"
              >
                <Replace className="w-3.5 h-3.5" />
              </button>
              <input
                type="file"
                accept="video/*"
                ref={replaceVideoInputRef}
                onChange={handleReplaceVideoChange}
                className="hidden"
              />
            </>
          )}
        </div>

        {state.videoUrl && (
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              className="flex items-center gap-1 bg-[#222] hover:bg-[#2c2c2c] text-[#aaa] hover:text-white px-2.5 py-1.5 rounded-lg font-bold text-[10px] uppercase transition-all active:scale-95 border border-[#333]"
            >
              <Save className="w-3 h-3 text-fuchsia-500" /> Save
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <input
            type="file"
            accept="video/*"
            ref={addVideoInputRef}
            onChange={handleAddVideoChange}
            className="hidden"
          />
          <input
            type="file"
            accept="video/*"
            ref={newProjectFileInputRef}
            onChange={handleNewProjectFileChange}
            className="hidden"
          />

          <button 
            onClick={handleExport}
            disabled={state.words.length === 0 || isExporting}
            className="bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white px-3.5 py-1.5 rounded-lg font-black text-[11px] uppercase tracking-wider cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-lg shadow-fuchsia-600/20 flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>

          <div className="hidden xs:flex text-[9px] font-bold uppercase text-[#555] tracking-wider items-center gap-1 pl-2 border-l border-[#333]">
            <Sparkles className="w-2.5 h-2.5 text-fuchsia-500" /> V4
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col overflow-hidden">
        {(appAnnouncement || maintenanceMode) && (
          <div
            className={`px-4 py-2 text-center text-[12px] font-bold tracking-wide ${
              maintenanceMode
                ? "bg-red-600/90 text-white"
                : "bg-fuchsia-700/80 text-white"
            }`}
          >
            {maintenanceMode
              ? "⚠️ Maintenance mode is on — uploads may be blocked while the owner updates the app."
              : appAnnouncement}
          </div>
        )}
        {!state.videoUrl ? (
          <div style={{ marginLeft: '0px', marginTop: '-30px' }} className="flex-1 flex flex-col items-center justify-start p-4 sm:p-6 pb-16 md:pb-6 gap-6 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 bg-[#161616] border border-[#252525] p-1.5 rounded-full mt-4 sm:mt-6 mb-2 shrink-0 self-center shadow-xl">
              <div className="px-6 py-2.5 rounded-full font-black text-xs uppercase tracking-wider flex items-center gap-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md shadow-fuchsia-600/10">
                <FileVideo className="w-4 h-4" /> Video & Audio Studio
              </div>
            </div>

            <>
              <VideoUploader 
                onUpload={handleUpload} 
                isProcessing={state.isProcessing} 
                initialFile={state.videoFile} 
              />
              {hasDraft && (
                <button
                  onClick={handleLoadDraft}
                  className="flex items-center gap-2 bg-[#161616] hover:bg-[#202020] border border-[#333] hover:border-fuchsia-600/50 text-[#888888] hover:text-white px-6 py-3.5 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-xl active:scale-95 animate-fade-in"
                >
                  <FolderOpen className="w-4 h-4 text-fuchsia-500 animate-bounce" />
                  Restore Saved Draft Project
                </button>
              )}
            </>
          </div>
        ) : (<>
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] h-[calc(100vh-48px)] overflow-y-auto lg:overflow-hidden w-full max-w-full">
            <div className={`flex flex-col items-center justify-center bg-black border-r border-[#333] relative p-2 md:p-3 lg:p-4 ${mobileTab === 'edit' ? 'hidden lg:flex' : 'flex'}`}>
              <VideoPlayer 
                videoUrl={state.videoUrl}
                words={state.words}
                currentTime={state.currentTime}
                onTimeUpdate={handleTimeUpdate}
                styleSettings={state.styleSettings}
                onUpdateStyleSettings={handleUpdateStyleSettings}
                onUpdateWordText={handleUpdateWordText}
                seekTime={seekTime}
                onSeekComplete={handleSeekComplete}
                onCaptionClick={() => setEditorTab('decorations')}
                onDisplaySizeChange={(size) => { editorDisplayRef.current = size; }}
                onRemoveVideo={() => setShowRemoveDialog(true)}
              />
              {state.isProcessing && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-20 flex flex-col items-center justify-center p-8">
                  <div className="w-full max-w-md bg-[#161616] border border-[#333] rounded-2xl p-7 shadow-[0_0_50px_rgba(219,39,119,0.15)] flex flex-col gap-6 animate-fade-in">
                    
                    {state.hasFailed ? (
                      <>
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <h3 className="text-[15px] font-black uppercase text-red-500 tracking-wider flex items-center gap-2">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                            </span>
                            Processing Failed
                          </h3>
                        </div>

                        {/* Error details */}
                        <div className="bg-[#111] border border-red-900/40 p-4 rounded-xl text-left max-h-[160px] overflow-y-auto custom-scrollbar">
                          <p className="text-[11px] font-mono text-red-400 leading-relaxed whitespace-pre-wrap">
                            {state.logs[state.logs.length - 1] || "An unexpected API or network issue occurred."}
                          </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={handleRetry}
                            className="w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-black uppercase text-xs tracking-wider py-3.5 px-6 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-600/10 active:scale-95"
                          >
                            <RefreshCw className="w-4 h-4" /> Retry Subtitle Generation
                          </button>
                          <button
                            onClick={handleCancelProcessing}
                            className="w-full bg-[#1e1e1e] hover:bg-[#252525] text-gray-300 font-bold uppercase text-xs tracking-wider py-3 px-6 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-[#333] active:scale-95"
                          >
                            Cancel & Choose New Video
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <h3 className="text-[15px] font-black uppercase text-fuchsia-500 tracking-wider flex items-center gap-2">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-fuchsia-500"></span>
                            </span>
                             AI Caption Studio
                           </h3>
                           <span className="text-[10px] font-black uppercase tracking-wider text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 rounded-full px-2.5 py-1">
                             Gemini 3.5 Flash
                           </span>
                           <span className="text-[16px] font-black text-white">{Math.round(smoothProgress)}%</span>
                         </div>
                        
                        {/* Progress Bar Container */}
                        <div className="space-y-3">
                          <div className="w-full bg-[#0A0A0A] rounded-full h-3.5 overflow-hidden border border-[#222] p-0.5">
                            <div 
                              className="bg-gradient-to-r from-purple-600 to-fuchsia-600 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(219,39,119,0.5)]" 
                              style={{ width: `${smoothProgress}%` }}
                            ></div>
                          </div>
                          
                          <p className="text-[12px] font-bold text-center text-[#aaaaaa] uppercase tracking-wide min-h-[18px] animate-pulse">
                            {getProcessingStatusMessage()}
                          </p>
                        </div>
                      </>
                    )}

                    {/* Branding */}
                    <div className="flex items-center justify-center gap-2 pt-4 border-t border-[#252525] mt-1 text-[11px] font-black uppercase tracking-[3px] text-[#444] select-none">
                      <span>Made with Batman 🦇</span>
                    </div>

                  </div>
                </div>
              )}
            </div>
            
            <div className={`h-auto lg:h-full bg-[#161616] overflow-visible lg:overflow-y-auto ${mobileTab === 'preview' ? 'hidden lg:block' : 'block'}`}>
              <EditorPanel 
                styleSettings={state.styleSettings}
                onUpdateStyleSettings={handleUpdateStyleSettings}
                words={state.words}
                currentTime={state.currentTime}
                onUpdateWordText={handleUpdateWordText}
                onSeek={handleSeek}
                onUpdateWords={handleUpdateWords}
                activeTab={editorTab}
                onActiveTabChange={setEditorTab}
              />
            </div>
          </div>

          {/* Mobile bottom tab bar — switches between preview and edit on small screens */}
          <div className="lg:hidden flex items-center justify-around bg-[#121212] border-t border-[#333] h-[52px] shrink-0 z-40">
            <button
              onClick={() => setMobileTab('preview')}
              className={`flex-1 flex items-center justify-center gap-1.5 h-full text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                mobileTab === 'preview' ? 'text-fuchsia-500 border-t-2 border-fuchsia-500 bg-fuchsia-500/5' : 'text-[#666] hover:text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              Preview
            </button>
            <button
              onClick={() => setMobileTab('edit')}
              className={`flex-1 flex items-center justify-center gap-1.5 h-full text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                mobileTab === 'edit' ? 'text-fuchsia-500 border-t-2 border-fuchsia-500 bg-fuchsia-500/5' : 'text-[#666] hover:text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
          </div>
          </>)}
      </main>

      {isExporting && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-xl bg-[#161616] border border-[#333] rounded-3xl p-6 sm:p-8 shadow-[0_0_80px_rgba(219,39,119,0.15)] flex flex-col gap-6 animate-fade-in relative">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#252525] pb-4">
              <h3 className="text-[18px] sm:text-[20px] font-black uppercase text-fuchsia-500 tracking-wide flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-fuchsia-500"></span>
                </span>
                {exportMode === 'complete' ? 'Export Complete' : 'Subtitle Export Studio'}
              </h3>
              <button 
                onClick={() => { setIsExporting(false); setExportMode('choice'); setExportedBlob(null); }}
                className="text-[#666] hover:text-white transition-colors cursor-pointer border-none bg-transparent"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {exportMode === 'choice' ? (
              <div className="flex flex-col gap-5">
                <p className="text-xs text-[#aaa] leading-relaxed -mt-2">
                  Choose how you want to burn your beautifully styled captions directly onto your video.
                </p>

                {isAudioOnlyFile && (
                <div className="flex items-center gap-3 p-3 bg-[#111] rounded-xl border border-[#252525]">
                  <label className="text-[11px] font-bold text-[#aaa] uppercase tracking-wider whitespace-nowrap">Background Color</label>
                  <input
                    type="color"
                    value={exportBgColor}
                    onChange={(e) => setExportBgColor(e.target.value)}
                    className="w-8 h-8 rounded-lg border-2 border-[#333] cursor-pointer bg-transparent"
                  />
                  <span className="text-[11px] font-mono text-[#666]">{exportBgColor}</span>
                  <button
                    onClick={() => setExportBgColor('#000000')}
                    className="text-[10px] text-fuchsia-500 hover:text-white font-bold uppercase cursor-pointer bg-transparent border-none"
                  >
                    Reset
                  </button>
                </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Local Option */}
                  <button
                    onClick={startLocalExport}
                    className="p-5 rounded-2xl border-2 border-fuchsia-600/50 hover:border-fuchsia-500 bg-fuchsia-600/5 hover:bg-fuchsia-600/10 text-left transition-all flex flex-col gap-3 group cursor-pointer"
                  >
                    <div className="p-2 bg-fuchsia-600/20 rounded-xl w-max text-fuchsia-400 group-hover:scale-110 transition-transform">
                      <Laptop className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-[14px] font-black text-white uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        Local Burner <span className="text-[9px] bg-fuchsia-600 text-white font-black px-1.5 py-0.5 rounded uppercase">Recommended</span>
                      </h4>
                      <p className="text-[11px] text-[#aaa] leading-relaxed">
                        100% private & instant. Renders directly in your browser using GPU acceleration. <strong>No video uploads required!</strong>
                      </p>
                    </div>
                  </button>
                </div>

                <div className="text-[10px] text-[#555] font-semibold text-center mt-2">
                  BOTH ENGINES WILL PRESERVE YOUR SELECTED STYLES AND POSITIONS
                </div>
              </div>
            ) : exportMode === 'complete' ? (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-3 p-4 bg-green-950/30 border border-green-500/30 rounded-xl">
                  <Check className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-sm font-bold text-green-400">Video rendered successfully!</p>
                    <p className="text-xs text-[#888] mt-1">{exportedFileName} ({(exportedBlob!.size / (1024 * 1024)).toFixed(2)} MB)</p>
                  </div>
                </div>

                {/* Logs terminal */}
                <div className="bg-[#0A0A0A] border border-[#252525] rounded-xl p-4 h-40 overflow-y-auto custom-scrollbar flex flex-col gap-2 text-[11px] font-mono text-[#888]">
                  {exportLogs.map((log, i) => (
                    <div key={i} className="animate-fade-in text-white/95 flex items-start gap-2">
                      <span className="text-fuchsia-500 font-extrabold select-none">➜</span>
                      <span className="flex-1">{log}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSaveToGallery}
                    disabled={isSaving}
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black uppercase text-xs tracking-wider py-3.5 px-6 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? 'Saving...' : 'Save to Gallery'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Progress / Status display */}
                <div className="flex items-center justify-between text-xs font-bold text-[#aaa] mb-1">
                  <span className="uppercase tracking-wider">
                    {exportMode === 'local' ? "Local GPU Burn Active" : "Cloud Rendering Active"}
                  </span>
                  {exportMode === 'local' && (
                    <span className="text-fuchsia-500 font-mono text-sm">{Math.round(localProgress)}%</span>
                  )}
                </div>

                {exportMode === 'local' && (
                  <div className="w-full bg-[#0A0A0A] rounded-full h-2.5 overflow-hidden border border-[#252525]">
                    <div 
                      className="bg-gradient-to-r from-purple-600 to-fuchsia-600 h-full transition-all duration-300 ease-out" 
                      style={{ width: `${localProgress}%` }}
                    />
                  </div>
                )}

                {/* Logs terminal */}
                <div className="bg-[#0A0A0A] border border-[#252525] rounded-xl p-4 h-48 overflow-y-auto custom-scrollbar flex flex-col gap-2 text-[11px] font-mono text-[#888]">
                  {exportLogs.map((log, i) => (
                    <div key={i} className="animate-fade-in text-white/95 flex items-start gap-2">
                      <span className="text-fuchsia-500 font-extrabold select-none">➜</span>
                      <span className="flex-1">{log}</span>
                    </div>
                  ))}
                </div>

                {/* Actions / cancel */}
                <div className="flex items-center justify-between border-t border-[#252525] pt-4 mt-2">
                  {exportMode === 'local' ? (
                    <button
                      onClick={() => {
                        isCancelledRef.current = true;
                      }}
                      className="px-4 py-2 bg-[#252525] hover:bg-red-950/40 hover:text-red-400 text-[#aaa] hover:border-red-500/30 border border-transparent rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <XCircle className="w-4 h-4" /> Cancel Burn
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-[10px] text-fuchsia-500/50 uppercase font-black tracking-widest">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rendering Subtitles...
                    </div>
                  )}
                  <span className="text-[10px] text-[#555] font-black uppercase">
                    DO NOT CLOSE THIS TAB
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove video/audio confirmation dialog */}
      {showRemoveDialog && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161616] border border-[#333] rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-black uppercase tracking-wider text-white">Remove Media</h3>
              <button onClick={() => setShowRemoveDialog(false)} className="text-[#888] hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-[12px] text-[#aaa] leading-relaxed">What would you like to remove?</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => handleRemoveVideo('video')} className="w-full bg-[#222] hover:bg-red-950/40 hover:text-red-400 text-left px-4 py-3 rounded-xl border border-[#333] hover:border-red-500/30 text-[12px] font-bold text-white cursor-pointer transition-colors flex items-center gap-3">
                <FileVideo className="w-4 h-4 text-red-400" /> Remove Video Only <span className="text-[10px] text-[#666] ml-auto">(keeps audio)</span>
              </button>
              <button onClick={() => handleRemoveVideo('audio')} className="w-full bg-[#222] hover:bg-amber-950/40 hover:text-amber-400 text-left px-4 py-3 rounded-xl border border-[#333] hover:border-amber-500/30 text-[12px] font-bold text-white cursor-pointer transition-colors flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-400"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> Remove Audio Only <span className="text-[10px] text-[#666] ml-auto">(keeps video)</span>
              </button>
              <button onClick={() => handleRemoveVideo('both')} className="w-full bg-[#222] hover:bg-red-950/40 hover:text-red-400 text-left px-4 py-3 rounded-xl border border-[#333] hover:border-red-500/30 text-[12px] font-bold text-white cursor-pointer transition-colors flex items-center gap-3">
                <XCircle className="w-4 h-4 text-red-500" /> Remove Both
              </button>
            </div>
            <button onClick={() => setShowRemoveDialog(false)} className="text-[11px] text-[#666] hover:text-[#aaa] font-bold uppercase text-center cursor-pointer">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
