import React, { useState, useRef, useEffect } from 'react';
import VideoPlayer from './components/VideoPlayer';
import VideoUploader from './components/VideoUploader';
import EditorPanel from './components/EditorPanel';
import { ProcessingModal } from './components/ProcessingModal';
import { AppState, CaptionStyle, CaptionWord, SubtitleStyleSettings, ProcessingStep, DubbingSettings } from './types';
import { Layers, Sparkles, Plus, Save, FileVideo, FolderOpen, RefreshCw, Cloud, Laptop, Loader2, X, XCircle, Undo2, Redo2, Replace, Languages, Check, Download, Volume2 } from 'lucide-react';
import { directTranscribe, executeReDub } from './utils/directTranscriber';
import { generateExpressiveDubbedAudio, fitAudioToDuration, cancelAndClearSession } from './utils/dubbingEngine';
import { continuousPiecewiseAlignment, sanitizeCaptionWords } from './utils/captionFormatter';
import { useVideoExport } from './hooks/useVideoExport';
import { exportToSRT, exportToVTT, exportToASS, triggerDownload } from './utils/subtitleExporter';
import { drawExportCaptions } from './utils/exportCaptionDraw';

function ExportModal({
  words,
  styleSettings,
  videoRef,
  isAudioOnly,
  onClose,
}: {
  words: CaptionWord[];
  styleSettings: SubtitleStyleSettings;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  isAudioOnly: boolean;
  onClose: () => void;
}) {
  const { startExport, cancelExport, isExporting, progress, logs } = useVideoExport();
  const [error, setError] = useState<string | null>(null);
  const [doneFile, setDoneFile] = useState<string | null>(null);

  const handleExportVideo = async () => {
    const video = videoRef.current;
    if (!video) {
      setError('Video element is not ready yet — please wait a moment and try again.');
      return;
    }
    setError(null);
    setDoneFile(null);
    const wordsSnap = words;
    const styleSnap = styleSettings;
    await startExport({
      video,
      drawFn: (ctx, t) =>
        drawExportCaptions(
          ctx,
          video.videoWidth || 1280,
          video.videoHeight || 720,
          t,
          wordsSnap,
          styleSnap
        ),
      onComplete: (blob, mime) => {
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const filename = `tanglish-captioned-${Date.now()}.${ext}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 8000);
        setDoneFile(filename);
      },
      onError: (e) => setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`),
    });
  };

  const downloadSubtitle = (kind: 'srt' | 'vtt' | 'ass') => {
    if (!words.length) {
      setError('No captions to export yet.');
      return;
    }
    const maxW = styleSettings.maxWordsPerScreen || 3;
    const base = `tanglish-captions-${Date.now()}`;
    try {
      if (kind === 'srt') triggerDownload(exportToSRT(words, maxW), `${base}.srt`, 'text/plain;charset=utf-8');
      else if (kind === 'vtt') triggerDownload(exportToVTT(words, maxW), `${base}.vtt`, 'text/vtt;charset=utf-8');
      else triggerDownload(exportToASS(words, maxW), `${base}.ass`, 'text/plain;charset=utf-8');
      setDoneFile(`${base}.${kind}`);
      setError(null);
    } catch (e) {
      setError(`Subtitle export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleClose = () => {
    if (isExporting) cancelExport();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="w-full max-w-md bg-[#181822] border border-[#2c2c3e] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2c2c3e]">
          <h2 className="text-sm font-black uppercase tracking-wide text-white">Export Studio</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close export"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Video export */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-fuchsia-300 mb-2">Video with burned-in captions</h3>
            {isAudioOnly && (
              <p className="text-[11px] text-gray-400 mb-2">Audio project exports as a video with captions on a black background.</p>
            )}
            <button
              onClick={handleExportVideo}
              disabled={isExporting}
              className="w-full bg-gradient-to-tr from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? 'Rendering…' : 'Export Video'}
            </button>

            {isExporting && (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-[#0A0A0E] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-gray-400 font-mono">{progress}%</span>
                  <button
                    onClick={cancelExport}
                    className="text-[11px] font-bold text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                {logs.length > 0 && (
                  <div className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-[#0A0A0E] border border-[#2c2c3e] p-2">
                    {logs.slice(-6).map((l, i) => (
                      <p key={i} className="text-[10px] text-gray-400 font-mono leading-relaxed">{l}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Subtitle export */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-fuchsia-300 mb-2">Subtitles</h3>
            <div className="grid grid-cols-3 gap-2">
              {(['srt', 'vtt', 'ass'] as const).map((kind) => (
                <button
                  key={kind}
                  onClick={() => downloadSubtitle(kind)}
                  disabled={isExporting || words.length === 0}
                  className="bg-[#242432] hover:bg-[#2e2e42] disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 text-xs font-bold px-3 py-2.5 rounded-xl border border-[#2c2c3e] transition-colors cursor-pointer uppercase"
                >
                  .{kind}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">{words.length} words → {Math.ceil(words.length / (styleSettings.maxWordsPerScreen || 3))} subtitle cues</p>
          </section>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
          )}
          {doneFile && !error && (
            <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
              Saved: {doneFile}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [appState, setAppState] = useState<AppState>({
    videoUrl: null,
    videoFile: null,
    audioFile: null,
    isAudioOnly: false,
    words: [],
    activeStyle: 'glow',
    isTransliterating: false,
    isProcessing: false,
    currentTime: 0,
    uploadProgress: 0,
    logs: [],
    styleSettings: {
      preset: 'glow',
      fontFamily: 'Inter',
      fontSize: 1.0,
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      showShadow: true,
      alignment: 'center',
      positionX: 0,
      positionY: 0,
      rotation: 0,
      maxWordsPerScreen: 3,
      showEmojis: true,
      showPunctuation: true,
      emojiStyle: 'vibes',
    },
    dubbingSettings: {
      enabled: false,
      targetLanguage: 'english',
      voiceId: 'gemini-puck',
      emotion: 'natural',
      speechRate: 1.0,
      speechPitch: 1.0,
      naturalFillers: true,
      fitOriginalDuration: true,
    },
    activeModel: 'Gemini 3.5 Transcribe + Nova 3 + Gemini 3.8 Flash',
    hasFailed: false,
    processingSteps: [],
    processingStartTime: null,
    dubbedAudioUrl: null,
    sessionCache: null,
  });

  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'presets' | 'decorations' | 'transcript' | 'dubbing'>('presets');
  const [isReDubbing, setIsReDubbing] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  const handleStepUpdate = (
    stepId: string, 
    status: 'pending' | 'in_progress' | 'completed' | 'failed', 
    extra?: { durationMs?: number; error?: string }
  ) => {
    setAppState(prev => {
      const currentSteps = prev.processingSteps || [];
      const updatedSteps = currentSteps.map(s => {
        if (s.id === stepId) {
          return {
            ...s,
            status,
            durationMs: extra?.durationMs ?? s.durationMs,
            error: extra?.error ?? s.error
          };
        }
        return s;
      });

      return {
        ...prev,
        processingSteps: updatedSteps,
        hasFailed: status === 'failed' ? true : prev.hasFailed
      };
    });
  };

  const handleLog = (msg: string) => {
    setAppState(prev => ({
      ...prev,
      logs: [...prev.logs, msg]
    }));
  };

  const handleStartProcessing = async (
    file: File,
    language: string,
    useEmojis: boolean,
    translationMode: string,
    usePunctuation: boolean,
    emojiStyle: any,
    enableHotwords: boolean,
    preExtractedAudioBlob?: Blob | null,
    dubbingSettings?: DubbingSettings
  ) => {
    const isDubbing = !!dubbingSettings?.enabled;

    const initialSteps: ProcessingStep[] = [
      { id: 'step-probe', name: 'Media Probe & Audio Cache', description: 'Inspecting media properties & preparing audio cache', status: 'pending' },
      { id: 'step-gemini-transcribe', name: 'Gemini 3.5 Transcribe', description: 'Ground truth recognized words & source language detection', status: 'pending' },
      { id: 'step-deepgram-original', name: 'Deepgram Nova 3 Timings', description: 'High-precision acoustic timestamps on source audio', status: 'pending' },
      { id: 'step-align', name: 'Master Alignment', description: 'Piecewise alignment of words with acoustic boundaries', status: 'pending' },
      { id: 'step-gemini-orchestrate', name: 'Gemini Flash Orchestrator', description: 'Merge Deepgram timings + Gemini 3.5 captions (3.8 Flash / 3.5 Flash-Lite)', status: 'pending' },
      ...(isDubbing ? [
        { id: 'step-dubbing-tts', name: 'Expressive Dubbing & Duration Fit', description: 'Generating expressive speech & fitting media duration', status: 'pending' as const },
        { id: 'step-deepgram-dubbed', name: 'Deepgram Nova 3 on Dubbed Audio', description: 'Exact acoustic synchronization on target dubbed speech', status: 'pending' as const },
      ] : []),
      { id: 'step-editor', name: 'Project Assembly', description: 'Routing synchronized media into studio editor', status: 'pending' }
    ];

    setAppState(prev => ({
      ...prev,
      isProcessing: true,
      hasFailed: false,
      logs: ['🚀 Starting AI Subtitle & Dubbing Pipeline...'],
      processingSteps: initialSteps,
      processingStartTime: Date.now(),
      lastUploadParams: {
        file,
        language,
        useEmojis,
        translationMode,
        usePunctuation,
        emojiStyle,
        enableHotwords,
        preExtractedAudioBlob,
        dubbingSettings
      }
    }));

    try {
      const result = await directTranscribe({
        file,
        language,
        translationMode,
        useEmojis,
        usePunctuation,
        emojiStyle,
        enableHotwords,
        preExtractedAudioBlob,
        dubbingSettings,
        onStepUpdate: handleStepUpdate,
        onLog: handleLog
      });

      setAppState(prev => ({
        ...prev,
        isProcessing: false,
        videoUrl: result.videoUrl || null,
        videoFile: file,
        isAudioOnly: result.isAudioOnly,
        words: result.words,
        dubbedAudioUrl: result.dubbedAudioUrl || null,
        sessionCache: result.sessionCache || null,
        dubbingSettings: dubbingSettings || prev.dubbingSettings,
        mediaDurationSeconds: result.mediaDurationSeconds
      }));
    } catch (err: any) {
      console.error('Pipeline failed:', err);
      handleLog(`❌ Error: ${err.message || 'Pipeline execution failed'}`);
      setAppState(prev => ({
        ...prev,
        hasFailed: true
      }));
    }
  };

  const handleRetry = () => {
    if (appState.lastUploadParams) {
      const p = appState.lastUploadParams;
      handleStartProcessing(
        p.file,
        p.language,
        p.useEmojis,
        p.translationMode,
        p.usePunctuation,
        p.emojiStyle,
        p.enableHotwords ?? true,
        p.preExtractedAudioBlob,
        p.dubbingSettings
      );
    }
  };

  const handleCancel = () => {
    cancelAndClearSession();
    setAppState(prev => ({
      ...prev,
      isProcessing: false,
      hasFailed: false,
      videoUrl: null,
      videoFile: null,
      words: []
    }));
  };

  // Re-dub project in Editor reusing cached transcription/translation
  const handleReDubInEditor = async (newSettings: DubbingSettings) => {
    if (!appState.sessionCache || isReDubbing) return;
    setIsReDubbing(true);

    try {
      const targetDuration = appState.mediaDurationSeconds || (appState.words[appState.words.length - 1]?.end_time || 60);
      const res = await executeReDub(
        newSettings,
        appState.dubbingSettings,
        appState.sessionCache,
        targetDuration,
        (msg) => console.log(msg)
      );

      setAppState(prev => ({
        ...prev,
        dubbedAudioUrl: res.dubbedAudioUrl,
        dubbingSettings: newSettings,
        words: res.words,
        sessionCache: res.sessionCache
      }));
    } catch (e) {
      console.error('Re-dubbing failed:', e);
    } finally {
      setIsReDubbing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0E] text-white flex flex-col font-sans selection:bg-fuchsia-500 selection:text-white">
      {/* Top Navbar */}
      <header className="h-16 border-b border-[#20202a] bg-[#0E0E14]/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-fuchsia-600/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-fuchsia-200 to-fuchsia-400">
              Tanglish Caption & Dubbing Studio
            </h1>
            <p className="text-[10px] text-gray-500 font-mono">Gemini 3.5 Transcribe + Nova 3 + Gemini 3.8 Flash</p>
          </div>
        </div>

        {appState.videoUrl && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowExportModal(true)}
              className="bg-gradient-to-tr from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={handleCancel}
              className="bg-[#181822] hover:bg-[#242432] text-gray-300 hover:text-white text-xs font-bold px-3.5 py-2 rounded-xl border border-[#2c2c3e] transition-colors cursor-pointer"
            >
              New Project
            </button>
          </div>
        )}
      </header>

      {/* Main Studio Workspace */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
        {!appState.videoUrl ? (
          <VideoUploader
            onUpload={handleStartProcessing}
            isProcessing={appState.isProcessing}
          />
        ) : (
          <div className="w-full max-w-7xl h-[calc(100vh-100px)] grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Video Player Area */}
            <div className="lg:col-span-7 h-full flex flex-col justify-center">
              <VideoPlayer
                videoUrl={appState.videoUrl}
                words={appState.words}
                currentTime={appState.currentTime}
                onTimeUpdate={(t) => setAppState(prev => ({ ...prev, currentTime: t }))}
                styleSettings={appState.styleSettings}
                onUpdateStyleSettings={(s) => setAppState(prev => ({ ...prev, styleSettings: { ...prev.styleSettings, ...s } }))}
                onUpdateWordText={(id, text) => {
                  setAppState(prev => ({
                    ...prev,
                    words: prev.words.map(w => w.id === id ? { ...w, word: text } : w)
                  }));
                }}
                seekTime={seekTime}
                onSeekComplete={() => setSeekTime(null)}
                onRemoveVideo={handleCancel}
                externalVideoRef={videoElementRef}
              />
            </div>

            {/* Right: Studio Editor Panel Area */}
            <div className="lg:col-span-5 h-full">
              <EditorPanel
                styleSettings={appState.styleSettings}
                onUpdateStyleSettings={(s) => setAppState(prev => ({ ...prev, styleSettings: { ...prev.styleSettings, ...s } }))}
                words={appState.words}
                currentTime={appState.currentTime}
                onUpdateWordText={(id, text) => {
                  setAppState(prev => ({
                    ...prev,
                    words: prev.words.map(w => w.id === id ? { ...w, word: text } : w)
                  }));
                }}
                onSeek={(t) => setSeekTime(t)}
                onUpdateWords={(wList) => setAppState(prev => ({ ...prev, words: wList }))}
                dubbingSettings={appState.dubbingSettings}
                onUpdateDubbingSettings={(d) => setAppState(prev => ({ ...prev, dubbingSettings: { ...prev.dubbingSettings, ...d } }))}
                onReDub={handleReDubInEditor}
                isReDubbing={isReDubbing}
                activeTab={activeTab}
                onActiveTabChange={(t) => setActiveTab(t)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Export Studio Modal */}
      {showExportModal && appState.videoUrl && (
        <ExportModal
          words={appState.words}
          styleSettings={appState.styleSettings}
          videoRef={videoElementRef}
          isAudioOnly={appState.isAudioOnly}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Transparent Pipeline Progress Modal */}
      <ProcessingModal
        isOpen={appState.isProcessing || appState.hasFailed}
        steps={appState.processingSteps || []}
        logs={appState.logs}
        startTime={appState.processingStartTime}
        hasFailed={appState.hasFailed}
        activeModel={appState.activeModel}
        onRetry={handleRetry}
        onCancel={handleCancel}
      />
    </div>
  );
}
