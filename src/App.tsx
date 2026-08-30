import React, { useState, useRef, useEffect } from 'react';
import VideoPlayer from './components/VideoPlayer';
import VideoUploader from './components/VideoUploader';
import EditorPanel from './components/EditorPanel';
import { ProcessingModal } from './components/ProcessingModal';
import { AppState, CaptionStyle, CaptionWord, SubtitleStyleSettings, ProcessingStep, DubbingSettings } from './types';
import { Layers, Sparkles, Plus, Save, FileVideo, FolderOpen, RefreshCw, Cloud, Laptop, Loader2, X, XCircle, Undo2, Redo2, Replace, Languages, Check, Download, Volume2 } from 'lucide-react';
import { directTranscribe } from './utils/directTranscriber';
import { generateExpressiveDubbedAudio, fitAudioToDuration, cancelAndClearSession } from './utils/dubbingEngine';
import { continuousPiecewiseAlignment, sanitizeCaptionWords } from './utils/captionFormatter';

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
    activeModel: 'Gemini 3.5 + Nova 3 + Gemini 3.6 Flash',
    hasFailed: false,
    processingSteps: [],
    processingStartTime: null,
    dubbedAudioUrl: null,
    sessionCache: null,
  });

  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'presets' | 'decorations' | 'transcript' | 'dubbing'>('presets');
  const [isReDubbing, setIsReDubbing] = useState(false);

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
      { id: 'step-gemini-orchestrate', name: 'Gemini 3.6 Flash Orchestrator', description: 'Captions, Roman/native script, punctuation & emojis', status: 'pending' },
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
    const sessionCache = appState.sessionCache;

    try {
      const textToSpeak = sessionCache.gemini36FlashOutput?.translatedText || sessionCache.gemini35Transcript?.rawText || appState.words.map(w => w.word).join(' ');
      
      const { geminiKeys, dgKeys } = await (async () => {
        let keys: string[] = (import.meta.env?.VITE_GEMINI_API_KEY || '').split(/[\s,;]+/).filter(Boolean);
        let dgs: string[] = (import.meta.env?.VITE_DEEPGRAM_API_KEY || '').split(/[\s,;]+/).filter(Boolean);
        try {
          const r = await fetch('/api/client-keys');
          if (r.ok) {
            const d = await r.json();
            if (d.geminiKeys) keys.push(...d.geminiKeys);
            if (d.dgKeys) dgs.push(...d.dgKeys);
          }
        } catch {}
        return { geminiKeys: Array.from(new Set(keys)) as string[], dgKeys: Array.from(new Set(dgs)) as string[] };
      })();

      // 1. Generate new dubbed audio with selected voice
      const rawDub = await generateExpressiveDubbedAudio(
        textToSpeak,
        newSettings.targetLanguage,
        newSettings,
        geminiKeys,
        (msg) => console.log(msg)
      );

      // 2. Duration fitting
      const targetDuration = appState.mediaDurationSeconds || (appState.words[appState.words.length - 1]?.end_time || 60);
      const fittedBlob = await fitAudioToDuration(rawDub, targetDuration);
      const dubbedUrl = URL.createObjectURL(fittedBlob);

      // 3. Deepgram Nova 3 on Dubbed Audio
      let newWords = appState.words;
      if (dgKeys.length > 0) {
        const dgDubUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&word_timestamps=true&language=${encodeURIComponent(newSettings.targetLanguage)}`;
        for (const k of dgKeys) {
          try {
            const authHeader = k.toLowerCase().startsWith('token ') ? k : `Token ${k}`;
            const res = await fetch(dgDubUrl, {
              method: 'POST',
              headers: { 'Authorization': authHeader, 'Content-Type': fittedBlob.type || 'audio/wav' },
              body: fittedBlob
            });
            if (res.ok) {
              const j = await res.json();
              const wList = j?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
              if (wList.length > 0) {
                const acousticTimings = wList.map((w: any) => ({
                  word: w.punctuated_word || w.word || '',
                  start: Math.round(w.start * 1000),
                  end: Math.round(w.end * 1000)
                }));
                newWords = continuousPiecewiseAlignment(newWords, acousticTimings);
                break;
              }
            }
          } catch {}
        }
      }

      setAppState(prev => ({
        ...prev,
        dubbedAudioUrl: dubbedUrl,
        dubbingSettings: newSettings,
        words: sanitizeCaptionWords(newWords)
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
            <p className="text-[10px] text-gray-500 font-mono">Gemini 3.5 + Nova 3 + Gemini 3.6 Flash</p>
          </div>
        </div>

        {appState.videoUrl && (
          <div className="flex items-center gap-3">
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
