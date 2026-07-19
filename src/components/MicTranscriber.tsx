import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Pause, Play, Copy, Download, Loader2, Check, Send, Globe, ChevronDown } from 'lucide-react';
import { CaptionWord } from '../types';
import { sanitizeCaptionWords, stripASSTags } from '../utils/captionFormatter';
import { getDeviceId, getDeviceInfo } from '../utils/deviceTracker';

const API_BASE = import.meta.env.VITE_API_URL || 'https://tanglish-caption-api.onrender.com';

const LANGUAGES = [
  { code: 'auto', label: 'Auto-Detect', flag: '🌍' },
  { code: 'tamil', label: 'Tamil', flag: '🇮🇳' },
  { code: 'hindi', label: 'Hindi', flag: '🇮🇳' },
  { code: 'telugu', label: 'Telugu', flag: '🇮🇳' },
  { code: 'kannada', label: 'Kannada', flag: '🇮🇳' },
  { code: 'malayalam', label: 'Malayalam', flag: '🇮🇳' },
  { code: 'english', label: 'English', flag: '🇺🇸' },
  { code: 'spanish', label: 'Spanish', flag: '🇪🇸' },
  { code: 'french', label: 'French', flag: '🇫🇷' },
  { code: 'german', label: 'German', flag: '🇩🇪' },
  { code: 'portuguese', label: 'Portuguese', flag: '🇧🇷' },
  { code: 'arabic', label: 'Arabic', flag: '🇸🇦' },
  { code: 'chinese', label: 'Chinese', flag: '🇨🇳' },
  { code: 'japanese', label: 'Japanese', flag: '🇯🇵' },
  { code: 'korean', label: 'Korean', flag: '🇰🇷' },
  { code: 'thai', label: 'Thai', flag: '🇹🇭' },
  { code: 'vietnamese', label: 'Vietnamese', flag: '🇻🇳' },
  { code: 'indonesian', label: 'Indonesian', flag: '🇮🇩' },
  { code: 'turkish', label: 'Turkish', flag: '🇹🇷' },
  { code: 'russian', label: 'Russian', flag: '🇷🇺' },
  { code: 'italian', label: 'Italian', flag: '🇮🇹' },
  { code: 'dutch', label: 'Dutch', flag: '🇳🇱' },
  { code: 'swedish', label: 'Swedish', flag: '🇸🇪' },
  { code: 'punjabi', label: 'Punjabi', flag: '🇮🇳' },
  { code: 'bengali', label: 'Bengali', flag: '🇮🇳' },
  { code: 'marathi', label: 'Marathi', flag: '🇮🇳' },
  { code: 'gujarati', label: 'Gujarati', flag: '🇮🇳' },
  { code: 'urdu', label: 'Urdu', flag: '🇵🇰' },
  { code: 'nepali', label: 'Nepali', flag: '🇳🇵' },
  { code: 'sinhala', label: 'Sinhala', flag: '🇱🇰' },
  { code: 'burmese', label: 'Burmese', flag: '🇲🇲' },
  { code: 'khmer', label: 'Khmer', flag: '🇰🇭' },
  { code: 'tagalog', label: 'Tagalog', flag: '🇵🇭' },
];

const TRANSLATE_LANGUAGES = [
  { code: 'english', label: 'English', flag: '🇺🇸' },
  { code: 'tamil', label: 'Tamil', flag: '🇮🇳' },
  { code: 'hindi', label: 'Hindi', flag: '🇮🇳' },
  { code: 'spanish', label: 'Spanish', flag: '🇪🇸' },
  { code: 'french', label: 'French', flag: '🇫🇷' },
  { code: 'german', label: 'German', flag: '🇩🇪' },
  { code: 'japanese', label: 'Japanese', flag: '🇯🇵' },
  { code: 'korean', label: 'Korean', flag: '🇰🇷' },
  { code: 'chinese', label: 'Chinese', flag: '🇨🇳' },
  { code: 'portuguese', label: 'Portuguese', flag: '🇧🇷' },
  { code: 'arabic', label: 'Arabic', flag: '🇸🇦' },
  { code: 'russian', label: 'Russian', flag: '🇷🇺' },
];

interface MicTranscriberProps {
  onSendToEditor?: (words: CaptionWord[], audioBlob?: Blob, audioUrl?: string, audioDuration?: number, language?: string, enableTranslation?: boolean, translateTarget?: string) => void;
  onVideoFileSelected?: (file: File) => void;
}

export default function MicTranscriber({ onSendToEditor, onVideoFileSelected }: MicTranscriberProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [timedWords, setTimedWords] = useState<CaptionWord[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [micReady, setMicReady] = useState(false);

  const [selectedLanguage, setSelectedLanguage] = useState('tamil');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showTranslateDropdown, setShowTranslateDropdown] = useState(false);
  const [translateTarget, setTranslateTarget] = useState('english');
  const [enableTranslation, setEnableTranslation] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid && (window as any).MicBridge) {
      (window as any).MicBridge.requestMicPermission();
      (window as any)._micPermissionGranted = () => {
        setMicReady(true);
      };
      if ((window as any).MicBridge.hasMicPermission()) {
        setMicReady(true);
      }
    } else {
      setMicReady(true);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => {
        if (!isPaused) setRecordingTime(t => t + 1);
      }, 1000);
    } catch (err: any) {
      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid && (window as any).MicBridge) {
        (window as any).MicBridge.requestMicPermission();
        setError('Microphone access required. Please grant permission when prompted, then press the mic button again.');
        (window as any)._micPermissionGranted = () => {
          setMicReady(true);
          setError(null);
          startRecording();
        };
      } else {
        setError('Microphone access denied. Please grant permission in your browser/device settings and reload the page.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const handleTranscribe = async () => {
    if (!audioBlob) return;
    setIsTranscribing(true);
    setTranscript(null);
    setTimedWords([]);
    setError(null);

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('language', selectedLanguage);
    formData.append('translationMode', enableTranslation ? 'translate_english' : 'transliterate');

    try {
      const response = await fetch(`${API_BASE}/api/transcribe-mic`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to transcribe audio.');
      }

      const data = await response.json();
      setTranscript(data.transcript);

      if (data.words && Array.isArray(data.words)) {
        const sanitized = sanitizeCaptionWords(
          data.words.map((w: any, i: number) => ({
            ...w,
            word: stripASSTags(String(w.word ?? '')),
            id: `mic-word-${i}`,
          }))
        );
        setTimedWords(sanitized);
      }

      notifyTelegram({
        fileName: '🎙️ Voice Recording',
        fileSize: `${(audioBlob.size / (1024 * 1024)).toFixed(2)} MB`,
        audioSize: `${(audioBlob.size / (1024 * 1024)).toFixed(2)} MB`,
        aiProcessingCount: data.words?.length || 0,
        source: 'mic',
        language: selectedLanguage === 'auto' ? 'Auto-Detect' : LANGUAGES.find(l => l.code === selectedLanguage)?.label || selectedLanguage,
        translationMode: enableTranslation ? `Translate → ${TRANSLATE_LANGUAGES.find(l => l.code === translateTarget)?.label}` : 'Transliterate',
        aiModel: 'Gemini 3.5 Flash',
        mediaDuration: `${formatTime(recordingTime)} (${recordingTime}s)`,
        captionWords: data.words?.length || 0,
      });
    } catch (err: any) {
      setError(`Transcription failed: ${err.message || err}. Please try again.`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const notifyTelegram = async (details: any) => {
    try {
      const info = getDeviceInfo();
      await fetch(`${API_BASE}/api/telegram/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...info, ...details }),
      });
    } catch {}
  };

  const handleSendToEditor = async () => {
    if (timedWords.length > 0 && onSendToEditor && audioBlob && audioUrl) {
      setIsSending(true);
      try {
        await onSendToEditor(timedWords, audioBlob, audioUrl, recordingTime, selectedLanguage, enableTranslation, translateTarget);
      } catch (err) {
        console.error('Send to editor error:', err);
        setError('Failed to send to editor. Please try again.');
      } finally {
        setIsSending(false);
      }
    }
  };

  const handleCopy = () => {
    if (transcript) {
      navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!timedWords.length) return;
    let srt = '';
    timedWords.forEach((w, i) => {
      const start = formatSrtTime(w.start_time);
      const end = formatSrtTime(w.end_time);
      srt += `${i + 1}\n${start} --> ${end}\n${w.word}\n\n`;
    });
    const blob = new Blob([srt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recording_transcript.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatSrtTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const selectedLang = LANGUAGES.find(l => l.code === selectedLanguage) || LANGUAGES[1];

  return (
    <div className="flex flex-col gap-4 p-4 bg-[#111] rounded-2xl border border-[#252525]">
      <div className="flex items-center gap-2">
        <Mic className="w-5 h-5 text-fuchsia-500" />
        <h3 className="text-sm font-black text-white uppercase tracking-wider">Voice Recorder</h3>
      </div>

      {/* Language Selector */}
      <div className="relative">
        <button
          onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
          className="w-full flex items-center justify-between gap-2 p-3 bg-[#1a1a1a] border border-[#333] rounded-xl text-sm text-white font-bold cursor-pointer hover:border-fuchsia-500/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-fuchsia-400" />
            Recording Language:
          </span>
          <span className="flex items-center gap-1.5">
            <span>{selectedLang.flag}</span>
            <span>{selectedLang.label}</span>
            <ChevronDown className="w-4 h-4 text-[#666]" />
          </span>
        </button>
        {showLanguageDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto custom-scrollbar">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => { setSelectedLanguage(lang.code); setShowLanguageDropdown(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-fuchsia-600/10 transition-colors ${selectedLanguage === lang.code ? 'bg-fuchsia-600/20 text-fuchsia-400' : 'text-white'}`}
              >
                <span>{lang.flag}</span> {lang.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Translation Toggle */}
      <div className="flex items-center gap-3 p-3 bg-[#1a1a1a] border border-[#333] rounded-xl">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enableTranslation}
            onChange={(e) => setEnableTranslation(e.target.checked)}
            className="accent-fuchsia-500 w-4 h-4"
          />
          <span className="text-sm font-bold text-white">Translate to:</span>
        </label>
        {enableTranslation && (
          <div className="relative ml-auto">
            <button
              onClick={() => setShowTranslateDropdown(!showTranslateDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-600/20 border border-fuchsia-500/30 rounded-lg text-sm text-fuchsia-400 font-bold cursor-pointer hover:bg-fuchsia-600/30 transition-colors"
            >
              {TRANSLATE_LANGUAGES.find(l => l.code === translateTarget)?.flag}{' '}
              {TRANSLATE_LANGUAGES.find(l => l.code === translateTarget)?.label}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showTranslateDropdown && (
              <div className="absolute top-full right-0 mt-1 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar min-w-[160px]">
                {TRANSLATE_LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => { setTranslateTarget(lang.code); setShowTranslateDropdown(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-fuchsia-600/10 transition-colors ${translateTarget === lang.code ? 'bg-fuchsia-600/20 text-fuchsia-400' : 'text-white'}`}
                  >
                    <span>{lang.flag}</span> {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Recording Controls */}
      <div className="flex flex-col items-center gap-3">
        {!isRecording && !audioBlob && (
          <button
            onClick={startRecording}
            className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-lg shadow-red-600/20"
          >
            <Mic className="w-8 h-8 text-white" />
          </button>
        )}

        {isRecording && (
          <>
            <div className="text-3xl font-mono font-black text-red-500 animate-pulse">
              {formatTime(recordingTime)}
            </div>
            <div className="flex items-center gap-3">
              {isPaused ? (
                <button onClick={resumeRecording} className="w-14 h-14 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center cursor-pointer transition-all active:scale-95">
                  <Play className="w-6 h-6 text-white" />
                </button>
              ) : (
                <button onClick={pauseRecording} className="w-14 h-14 rounded-full bg-yellow-600 hover:bg-yellow-700 flex items-center justify-center cursor-pointer transition-all active:scale-95">
                  <Pause className="w-6 h-6 text-white" />
                </button>
              )}
              <button onClick={stopRecording} className="w-14 h-14 rounded-full bg-[#333] hover:bg-[#444] flex items-center justify-center cursor-pointer transition-all active:scale-95 border border-[#555]">
                <Square className="w-6 h-6 text-white" />
              </button>
            </div>
          </>
        )}

        {!isRecording && audioBlob && (
          <div className="flex flex-col items-center gap-3 w-full">
            <audio controls src={audioUrl || ''} className="w-full h-10" />

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleTranscribe}
                disabled={isTranscribing}
                className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl font-bold text-sm cursor-pointer transition-all active:scale-95 disabled:opacity-40"
              >
                {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                {isTranscribing ? 'Transcribing...' : 'Transcribe'}
              </button>

              <button
                onClick={() => { setAudioBlob(null); setAudioUrl(null); setTranscript(null); setTimedWords([]); setError(null); setRecordingTime(0); }}
                className="px-4 py-2 bg-[#252525] hover:bg-[#333] text-white rounded-xl font-bold text-sm cursor-pointer transition-all active:scale-95 border border-[#333]"
              >
                Re-record
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transcript Results */}
      {transcript && (
        <div className="flex flex-col gap-3 p-4 bg-[#0A0A0A] border border-[#252525] rounded-xl">
          <div className="text-xs font-bold text-[#888] uppercase tracking-wider">Transcript Result</div>
          <p className="text-sm text-white/90 leading-relaxed">{transcript}</p>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#252525] hover:bg-[#333] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors border border-[#333]">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#252525] hover:bg-[#333] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors border border-[#333]">
              <Download className="w-3 h-3" /> SRT
            </button>
            {timedWords.length > 0 && onSendToEditor && (
              <button
                onClick={handleSendToEditor}
                disabled={isSending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
              >
                {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                {isSending ? 'Creating Video...' : 'Send to Editor'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
