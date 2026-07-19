import React, { useState, useRef, useEffect } from 'react';
import VideoPlayer from './components/VideoPlayer';
import VideoUploader from './components/VideoUploader';
import EditorPanel from './components/EditorPanel';
import { AppState, CaptionStyle, CaptionWord, SubtitleStyleSettings } from './types';
import { Layers, Sparkles, Plus, Save, FileVideo, FolderOpen, RefreshCw, Cloud, Laptop, Loader2, X, XCircle, Undo2, Redo2, Replace, Languages } from 'lucide-react';
import { extractAudioTrack } from './utils/audioExtractor';
import { getAccessToken, logout, initAuth, googleSignIn } from './utils/firebaseAuth';
import { applyCaptionFormatting, sanitizeCaptionWords, stripASSTags, containsASSTags } from './utils/captionFormatter';
import { notifyTelegram } from './utils/deviceTracker';

const API_BASE = import.meta.env.VITE_API_URL || 'https://tanglish-caption-api.onrender.com';
import {
  buildTrackerClientMeta,
  probeMediaDuration,
  incrementSessionFails,
  getSessionId,
} from './utils/sessionTracker';

function drawSubtitlesOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  time: number,
  words: CaptionWord[],
  styleSettings: SubtitleStyleSettings,
  videoEl: HTMLVideoElement
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

  const maxWords = styleSettings.maxWordsPerScreen || 1;
  let displayWords: CaptionWord[] = [];
  if (maxWords <= 1) {
    displayWords = [words[targetIndex]];
  } else {
    const chunkIndex = Math.floor(targetIndex / maxWords);
    const start = chunkIndex * maxWords;
    const end = Math.min(start + maxWords, words.length);
    displayWords = words.slice(start, end);
  }

  if (displayWords.length === 0) return;

  const isLandscape = canvasWidth > canvasHeight;
  const refWidth = isLandscape ? 604 : 340;
  const refHeight = isLandscape ? 340 : 604;
  
  const scaleX = canvasWidth / refWidth;
  const scaleY = canvasHeight / refHeight;
  
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
    fontName = '"Fredoka One", "Inter", sans-serif';
    fontStyle = '900';
  } else if (styleSettings.fontFamily === 'Space Grotesk') {
    fontName = '"Space Grotesk", sans-serif';
    fontStyle = '800';
  } else {
    fontName = '"Helvetica Neue", Arial, sans-serif';
    fontStyle = '800';
  }
  
  ctx.font = `${fontStyle} ${baseFontSize}px ${fontName}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.save();
  
  const baseX = (canvasWidth / 2) + (styleSettings.positionX * scaleX);
  const baseY = (canvasHeight - (96 * scaleY)) - (styleSettings.positionY * scaleY);
  
  ctx.translate(baseX, baseY);
  ctx.rotate((styleSettings.rotation * Math.PI) / 180);
  
  const formatWordText = (text: string) => {
    let formatted = applyCaptionFormatting(
      text,
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
  
  const gap = 12 * scaleX;
  const formattedTexts = displayWords.map(w => formatWordText(w.word));
  const wordWidths = formattedTexts.map(txt => ctx.measureText(txt).width);
  const totalWidth = wordWidths.reduce((a, b) => a + b, 0) + (displayWords.length - 1) * gap;
  
  let startX = -totalWidth / 2;
  
  displayWords.forEach((w, index) => {
    const wordText = formattedTexts[index];
    const wordWidth = wordWidths[index];
    const curX = startX + wordWidth / 2;
    const curY = 0;
    
    const isActive = words[activeWordIndex]?.id === w.id;
    
    ctx.save();
    
    if (isActive) {
      if (styleSettings.showBackground) {
        ctx.fillStyle = '#000000';
        const paddingX = 14 * scaleX;
        const paddingY = 8 * scaleX;
        
        const rx = curX - wordWidth / 2 - paddingX;
        const ry = curY - baseFontSize / 2 - paddingY;
        const rw = wordWidth + paddingX * 2;
        const rh = baseFontSize + paddingY * 2;
        const radius = 8 * scaleX;
        
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
        
        ctx.strokeStyle = styleSettings.highlightColor;
        ctx.lineWidth = 2 * scaleX;
        ctx.stroke();
      }
      
      if (styleSettings.showBacklight) {
        ctx.shadowColor = styleSettings.highlightColor;
        ctx.shadowBlur = 12 * scaleX;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else if (styleSettings.showShadow) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 8 * scaleX;
        ctx.strokeText(wordText, curX, curY);
      }
      
      ctx.fillStyle = styleSettings.highlightColor;
      ctx.fillText(wordText, curX, curY);
      
    } else {
      ctx.fillStyle = styleSettings.textColor;
      if (styleSettings.showSpotlight) {
        ctx.globalAlpha = 0.35;
      }
      
      if (styleSettings.showShadow) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 8 * scaleX;
        ctx.strokeText(wordText, curX, curY);
      }
      
      ctx.fillText(wordText, curX, curY);
    }
    
    ctx.restore();
    startX += wordWidth + gap;
  });
  
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
      maxWordsPerScreen: 5,
      showEmojis: true,
      showPunctuation: true,
      emojiStyle: 'vibes',
    }
  });

  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [exportMode, setExportMode] = useState<'choice' | 'local' | 'cloud'>('choice');
  const [localProgress, setLocalProgress] = useState<number>(0);
  const [editorTab, setEditorTab] = useState<'presets' | 'decorations' | 'transcript'>('presets');
  const isCancelledRef = useRef<boolean>(false);
  
  const addVideoInputRef = useRef<HTMLInputElement>(null);
  const newProjectFileInputRef = useRef<HTMLInputElement>(null);
  const replaceVideoInputRef = useRef<HTMLInputElement>(null);

  // Undo/Redo history
  const [undoStack, setUndoStack] = useState<CaptionWord[][]>([]);
  const [redoStack, setRedoStack] = useState<CaptionWord[][]>([]);

  const pushUndo = (currentWords: CaptionWord[]) => {
    setUndoStack(prev => [...prev.slice(-50), currentWords]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setRedoStack(r => [...r, state.words]);
    setState(s => ({ ...s, words: prev }));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(r => r.slice(0, -1));
    setUndoStack(u => [...u, state.words]);
    setState(s => ({ ...s, words: next }));
  };

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
    pushUndo(state.words);
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
        maxWordsPerScreen: 5,
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
    setExportMode('local');
    setExportLogs(["Initializing 100% local video renderer..."]);
    setLocalProgress(0);

    const isAudioOnly = state.videoFile && (
      state.videoFile.type.startsWith('audio/') || 
      state.videoFile.name.endsWith('.mp3') || 
      state.videoFile.name.endsWith('.wav') || 
      state.videoFile.name.endsWith('.m4a')
    );

    let videoEl = document.querySelector('video') as HTMLVideoElement | null;

    if (isAudioOnly && !videoEl) {
      // Create synthetic video for audio-only with background color
      videoEl = document.createElement('video');
      videoEl.muted = true;
      videoEl.src = state.videoUrl || '';
      await new Promise<void>((resolve) => {
        videoEl!.onloadedmetadata = () => resolve();
        videoEl!.onerror = () => resolve();
      });
    }

    if (!videoEl) {
      setExportLogs(l => [...l, "Error: Could not find active video player component."]);
      return;
    }

    // Store original player state to restore later
    const originalTime = videoEl.currentTime;
    const originalMuted = videoEl.muted;
    const originalVolume = videoEl.volume;
    const originalPlaybackRate = videoEl.playbackRate;
    const originalPaused = videoEl.paused;

    videoEl.pause();

    setExportLogs(l => [...l, "Extracting audio track internally..."]);

    let audioTrack: MediaStreamTrack | null = null;
    let audioCtx: AudioContext | null = null;
    let source: MediaElementAudioSourceNode | null = null;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioContextClass();
      source = audioCtx.createMediaElementSource(videoEl);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      audioTrack = dest.stream.getAudioTracks()[0];
      setExportLogs(l => [...l, "✓ Audio track captured silently from video decoder."]);
    } catch (err) {
      console.warn("Web Audio API capture failed, using standard stream fallback:", err);
      setExportLogs(l => [...l, "⚠ Speaker muting unavailable. Capturing audio via normal playback stream."]);
      
      try {
        const videoStream = (videoEl as any).captureStream ? (videoEl as any).captureStream() : ((videoEl as any).mozCaptureStream ? (videoEl as any).mozCaptureStream() : null);
        if (videoStream) {
          const tracks = videoStream.getAudioTracks();
          if (tracks.length > 0) {
            audioTrack = tracks[0];
          }
        }
      } catch (e) {
        console.warn("captureStream fallback failed:", e);
      }
    }

    setExportLogs(l => [...l, `Creating canvas surface (${videoEl.videoWidth}x${videoEl.videoHeight})...`]);

    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 1080;
    canvas.height = videoEl.videoHeight || 1920;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setExportLogs(l => [...l, "Error: Canvas 2D engine failed to initialize."]);
      return;
    }

    // Draw first frame
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    const canvasStream = canvas.captureStream(30); // Capture at 30 FPS
    const canvasVideoTrack = canvasStream.getVideoTracks()[0];

    const combinedStream = new MediaStream();
    combinedStream.addTrack(canvasVideoTrack);
    if (audioTrack) {
      combinedStream.addTrack(audioTrack);
    }

    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4;codecs=h264',
      'video/mp4'
    ];

    let selectedMimeType = '';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMimeType = mime;
        break;
      }
    }

    setExportLogs(l => [...l, `Configuring browser-native encoder (${selectedMimeType || "Default Rec"})...`]);

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMimeType || undefined,
      videoBitsPerSecond: 8000000 // 8 Mbps high-quality
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      // Restore video state
      videoEl.currentTime = originalTime;
      videoEl.muted = originalMuted;
      videoEl.volume = originalVolume;
      videoEl.playbackRate = originalPlaybackRate;
      if (!originalPaused) {
        videoEl.play();
      }

      // Reconnect audio to speakers
      if (source && audioCtx) {
        try {
          source.disconnect();
          source.connect(audioCtx.destination);
        } catch (e) {
          console.warn("Could not reconnect audio source:", e);
        }
      }

      if (isCancelledRef.current) {
        setExportLogs(l => [...l, "✖ Export process cancelled by user."]);
        setTimeout(() => setIsExporting(false), 1500);
        return;
      }

      setExportLogs(l => [...l, "✓ Frame recording completed. Generating final video package..."]);
      const blob = new Blob(chunks, { type: selectedMimeType });
      const downloadUrl = URL.createObjectURL(blob);
      
      const ext = selectedMimeType.includes('mp4') ? 'mp4' : 'webm';
      const baseName = state.videoFile?.name.replace(/\.[^/.]+$/, "") || 'video';
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${baseName}_${generateRandomSuffix()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);

      setExportLogs(l => [...l, "✨ Subtitled video exported and saved locally!"]);
      if (state.videoFile) {
        const ext = selectedMimeType.includes('mp4') ? 'mp4' : 'webm';
        notifyTelegram({
          fileName: `✅ Exported: ${state.videoFile.name.replace(/\.[^/.]+$/, "")}_${generateRandomSuffix()}.${ext}`,
          fileSize: `${(blob.size / (1024 * 1024)).toFixed(2)} MB`,
          audioSize: 'N/A (local GPU burn)',
          aiProcessingCount: state.words.length,
          isExport: true,
          source: isAudioOnlyFile ? 'audio' : 'video',
          aiModel: 'Gemini 3.5 Flash',
          exportMethod: 'local',
          captionWords: state.words.length,
        });
      }
      setTimeout(() => {
        setIsExporting(false);
      }, 2000);
    };

    setExportLogs(l => [...l, "Rewinding source video track to 0.0s..."]);
    videoEl.currentTime = 0;

    const onSeeked = () => {
      videoEl.removeEventListener('seeked', onSeeked);
      setExportLogs(l => [...l, "🚀 Live burner active! Playing video and compositing subtitles..."]);

      recorder.start();
      videoEl.play();

      const renderFrame = () => {
        if (isCancelledRef.current) {
          recorder.stop();
          return;
        }

        if (videoEl.paused || videoEl.ended) {
          if (videoEl.ended) {
            recorder.stop();
          }
          return;
        }

        // Fill background color (for audio-only exports or visual style)
        if (exportBgColor && exportBgColor !== 'transparent') {
          ctx.fillStyle = exportBgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        // Draw video frame
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

        // Draw subtitles on top
        drawSubtitlesOnCanvas(ctx, canvas.width, canvas.height, videoEl.currentTime, state.words, state.styleSettings, videoEl);

        // Update progress percentage
        const progress = Math.min(100, (videoEl.currentTime / videoEl.duration) * 100);
        setLocalProgress(progress);

        requestAnimationFrame(renderFrame);
      };

      requestAnimationFrame(renderFrame);
    };

    videoEl.addEventListener('seeked', onSeeked);
  };

  const startCloudExport = async () => {
    setExportMode('cloud');
    setExportLogs(["Initializing cloud render build..."]);

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
      formData.append('video', state.videoFile!);
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

      const response = await fetch(`${API_BASE}/api/export?jobId=${jobId}`, {
        method: 'POST',
        body: formData,
        headers,
      });

      eventSource.close();

      if (!response.ok) {
        throw new Error(await response.text() || "Cloud export failed");
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

    const xhr = new XMLHttpRequest();
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setState(s => ({ ...s, uploadProgress: percentComplete }));
      }
    };

    xhr.onload = () => {
      eventSource.close();
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
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
        console.error("Transcription failed", xhr.responseText);
        incrementSessionFails();
        let errorMsg = "Failed to process video. ";
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData.error) errorMsg += errData.error;
          else errorMsg += "Unknown server error.";
        } catch {
          errorMsg += "Server returned an unexpected response.";
        }
        errorMsg += "\n\nTip: If this keeps happening, all AI API keys may be temporarily exhausted. Please try again in a few minutes.";
        setState(s => ({ 
          ...s, 
          hasFailed: true,
          logs: [...s.logs, `ERROR: ${errorMsg}`]
        }));
      }
    };

    xhr.onerror = () => {
      eventSource.close();
      incrementSessionFails();
      setState(s => ({ 
        ...s, 
        hasFailed: true,
        logs: [...s.logs, "ERROR: Network error. Please check your internet connection and try again."]
      }));
    };

    xhr.open('POST', `${API_BASE}/api/transcribe?jobId=${jobId}`, true);
    const activeToken = token || await getAccessToken();
    if (activeToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${activeToken}`);
    }
    xhr.send(formData);
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
    setState(s => ({
      ...s,
      styleSettings: {
        ...s.styleSettings,
        ...newSettings
      }
    }));
  };

  const handleUpdateWordText = (id: string, text: string) => {
    pushUndo(state.words);
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
      <header style={{ marginTop: '-1px' }} className="h-[64px] border-b border-[#333] bg-[#161616] flex items-center justify-between px-4 sm:px-6 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-600 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-black text-[18px] sm:text-[24px] tracking-tight uppercase flex items-center shrink-0">
              CAPTIONS
            </h1>
            
            <button 
              onClick={handleExport}
              disabled={state.words.length === 0 || isExporting}
              className="ml-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-3 py-1.5 sm:px-5 sm:py-2 rounded-full font-extrabold text-[11px] sm:text-[14px] border-none cursor-pointer uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-lg shadow-fuchsia-600/10 shrink-0"
            >
              {isExporting ? "Exporting..." : "Export Video"}
            </button>

            {state.videoUrl && (
              <>
                <button 
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="ml-1 bg-[#222] hover:bg-[#333] text-[#aaa] hover:text-white w-8 h-8 rounded-full flex items-center justify-center border border-[#333] cursor-pointer transition-all active:scale-95 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Undo"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="ml-1 bg-[#222] hover:bg-[#333] text-[#aaa] hover:text-white w-8 h-8 rounded-full flex items-center justify-center border border-[#333] cursor-pointer transition-all active:scale-95 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Redo"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => replaceVideoInputRef.current?.click()}
                  className="ml-1 bg-[#222] hover:bg-[#333] text-fuchsia-500 hover:text-white w-8 h-8 rounded-full flex items-center justify-center border border-[#333] cursor-pointer transition-all active:scale-95 shrink-0"
                  title="Replace video (keep captions & audio)"
                >
                  <Replace className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  accept="video/*"
                  ref={replaceVideoInputRef}
                  onChange={handleReplaceVideoChange}
                  className="hidden"
                />
                <button 
                  onClick={handleNewProject}
                  className="ml-1 bg-[#222] hover:bg-[#333] text-fuchsia-500 hover:text-white w-8 h-8 rounded-full flex items-center justify-center border border-[#333] cursor-pointer transition-all active:scale-95 shrink-0"
                  title="New project"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          
          {state.videoUrl && (
            <div className="hidden md:flex items-center gap-2 pl-4 border-l border-[#333]">
              <button
                onClick={handleSaveDraft}
                className="flex items-center gap-1.5 bg-[#222] hover:bg-[#2c2c2c] text-[#ccc] hover:text-white px-3 py-1.5 rounded-lg font-bold text-[11px] uppercase transition-all active:scale-95 border border-[#333]"
                title="Save progress to draft"
              >
                <Save className="w-3.5 h-3.5 text-fuchsia-500" /> Save Draft
              </button>

              <button
                onClick={handleAddVideoClick}
                className="flex items-center gap-1.5 bg-[#222] hover:bg-[#2c2c2c] text-[#ccc] hover:text-white px-3 py-1.5 rounded-lg font-bold text-[11px] uppercase transition-all active:scale-95 border border-[#333]"
                title="Upload/change the video file"
              >
                <FileVideo className="w-3.5 h-3.5 text-fuchsia-500" /> Add Video
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Hidden file input for adding/swapping video */}
          <input
            type="file"
            accept="video/*"
            ref={addVideoInputRef}
            onChange={handleAddVideoChange}
            className="hidden"
          />

          {/* Hidden file input for creating a new clean project */}
          <input
            type="file"
            accept="video/*"
            ref={newProjectFileInputRef}
            onChange={handleNewProjectFileChange}
            className="hidden"
          />

          <div className="hidden xs:flex text-[11px] sm:text-[13px] font-black uppercase text-[#888888] tracking-wider items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-500 animate-pulse" /> Live Caption Engine V4
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
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] h-[calc(100vh-64px)] overflow-y-auto lg:overflow-hidden w-full max-w-full">
            <div className="flex flex-col items-center justify-center bg-black border-r border-[#333] relative p-2 md:p-3 lg:p-4">
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
            
            <div className="h-auto lg:h-full bg-[#161616] overflow-visible lg:overflow-y-auto">
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
        )}
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
                Subtitle Export Studio
              </h3>
              {exportMode === 'choice' && (
                <button 
                  onClick={() => setIsExporting(false)}
                  className="text-[#666] hover:text-white transition-colors cursor-pointer border-none bg-transparent"
                  title="Close Export Studio"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
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

                  {/* Cloud Option */}
                  <button
                    onClick={startCloudExport}
                    className="p-5 rounded-2xl border-2 border-[#2c2c2c] hover:border-purple-500 bg-[#121212] hover:bg-purple-600/5 text-left transition-all flex flex-col gap-3 group cursor-pointer"
                  >
                    <div className="p-2 bg-purple-600/20 rounded-xl w-max text-purple-400 group-hover:scale-110 transition-transform">
                      <Cloud className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-[14px] font-black text-white uppercase tracking-wider mb-1">
                        Cloud Renderer
                      </h4>
                      <p className="text-[11px] text-[#888] leading-relaxed">
                        Processes the video on our high-speed render cluster. <strong>Requires uploading original video file.</strong>
                      </p>
                    </div>
                  </button>
                </div>

                <div className="text-[10px] text-[#555] font-semibold text-center mt-2">
                  BOTH ENGINES WILL PRESERVE YOUR SELECTED STYLES AND POSITIONS
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
    </div>
  );
}
