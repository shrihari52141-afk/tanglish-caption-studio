import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Copy, Check, Download, Loader2, Sparkles, Volume2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://tanglish-caption-api.onrender.com';

export default function MicTranscriber() {
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'stopped'>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    setTranscript(null);
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    audioChunksRef.current = [];
    setDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stopTracks();
      };

      mediaRecorder.start(200); // chunk intervals
      setRecordingState('recording');

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please ensure microphone permissions are granted.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.pause();
      setRecordingState('paused');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'paused') {
      mediaRecorderRef.current.resume();
      setRecordingState('recording');
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && (recordingState === 'recording' || recordingState === 'paused')) {
      mediaRecorderRef.current.stop();
      setRecordingState('stopped');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const resetRecorder = () => {
    stopTracks();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecordingState('idle');
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setDuration(0);
    setTranscript(null);
    setPlaybackState('idle');
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleTranscribe = async () => {
    if (!audioBlob) return;
    setIsTranscribing(true);
    setTranscript(null);

    const formData = new FormData();
    formData.append('audio', audioBlob, 'microphone_recording.webm');

    try {
      const response = await fetch(`${API_BASE}/api/transcribe-mic`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text() || 'Failed to transcribe audio.');
      }

      const data = await response.json();
      setTranscript(data.transcript);
    } catch (err: any) {
      console.error(err);
      alert(`Transcription failed: ${err.message || err}`);
    } finally {
      setIsTranscribing(false);
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
    if (!transcript) return;
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voice_transcript_${new Date().toISOString().slice(0,10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const togglePlayback = () => {
    if (!audioElRef.current) return;
    if (playbackState === 'playing') {
      audioElRef.current.pause();
      setPlaybackState('paused');
    } else {
      audioElRef.current.play();
      setPlaybackState('playing');
    }
  };

  return (
    <div style={{ marginTop: '-31px' }} className="w-full max-w-xl mx-auto bg-[#161616] border border-[#333] hover:border-[#444] transition-all rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
      <div style={{ marginLeft: '0px', marginTop: '-6px' }} className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-fuchsia-600/10 flex items-center justify-center border border-fuchsia-600/30">
          <Mic className={`w-8 h-8 ${recordingState === 'recording' ? 'text-red-500 animate-pulse' : 'text-fuchsia-500'}`} />
        </div>
        <h2 className="text-[24px] font-black tracking-tight text-white uppercase mt-4">
          AI Voice Notes Transcriber
        </h2>
        <p className="text-xs text-[#888888] font-black uppercase tracking-[2px]">
          Transcribe Voice Memos Instantly using Gemini 3.5 Flash
        </p>
      </div>

      {/* Recording Control & Interface Panel */}
      <div style={{ marginTop: '-14px' }} className="bg-[#0A0A0A] border border-[#252525] rounded-2xl p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden">
        {recordingState === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600/10 border border-red-500/20 px-2 py-1 rounded-md">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="text-[9px] font-black uppercase tracking-wider text-red-500">Live Recording</span>
          </div>
        )}

        <div className="text-4xl font-mono font-bold text-white tabular-nums tracking-wider my-2">
          {formatTime(duration)}
        </div>

        {/* Action Button Strip */}
        <div className="flex items-center gap-3">
          {recordingState === 'idle' && (
            <button
              onClick={startRecording}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 border-none cursor-pointer transition-all active:scale-95 shadow-lg shadow-red-600/10"
            >
              <Mic className="w-4 h-4" /> Start Recording
            </button>
          )}

          {recordingState === 'recording' && (
            <>
              <button
                onClick={pauseRecording}
                className="p-3 bg-[#222] hover:bg-[#333] text-white rounded-xl border border-[#333] cursor-pointer transition-all active:scale-95"
                title="Pause recording"
              >
                <Pause className="w-5 h-5 text-yellow-500" />
              </button>
              <button
                onClick={stopRecording}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 border-none cursor-pointer transition-all active:scale-95"
              >
                <Square className="w-4 h-4 fill-white" /> Stop & Save
              </button>
            </>
          )}

          {recordingState === 'paused' && (
            <>
              <button
                onClick={resumeRecording}
                className="p-3 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl border-none cursor-pointer transition-all active:scale-95"
                title="Resume recording"
              >
                <Play className="w-5 h-5 fill-white" />
              </button>
              <button
                onClick={stopRecording}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 border-none cursor-pointer transition-all active:scale-95"
              >
                <Square className="w-4 h-4 fill-white" /> Stop & Save
              </button>
            </>
          )}

          {(recordingState === 'stopped' || audioBlob) && (
            <button
              onClick={resetRecorder}
              className="px-4 py-2.5 bg-[#222] hover:bg-[#333] text-[#aaa] hover:text-white font-black text-[10px] uppercase tracking-wider rounded-xl flex items-center gap-1.5 border border-[#333] cursor-pointer transition-all active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Start Over
            </button>
          )}
        </div>

        {/* Audio playback component */}
        {audioUrl && (
          <div className="w-full flex items-center justify-between gap-4 mt-2 pt-4 border-t border-[#222]">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-fuchsia-500" />
              <span className="text-[10px] font-black uppercase tracking-wider text-[#666]">Preview Audio:</span>
            </div>
            
            <button
              onClick={togglePlayback}
              className="flex items-center gap-1.5 bg-[#1a1a1a] border border-[#333] hover:border-fuchsia-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer"
            >
              {playbackState === 'playing' ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-fuchsia-500 fill-fuchsia-500" /> Pause Playback
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-fuchsia-500 fill-fuchsia-500" /> Listen Back
                </>
              )}
            </button>

            <audio
              ref={audioElRef}
              src={audioUrl}
              onEnded={() => setPlaybackState('idle')}
              onPause={() => setPlaybackState('paused')}
              onPlay={() => setPlaybackState('playing')}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* Transcription trigger */}
      {audioBlob && !transcript && (
        <button
          onClick={handleTranscribe}
          disabled={isTranscribing}
          className="w-full py-4 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white rounded-full font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all shadow-xl disabled:opacity-50 cursor-pointer border-none"
        >
          {isTranscribing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Gemini 3.5 Flash is transcribing...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 animate-pulse" />
              Transcribe Voice Notes with AI
            </>
          )}
        </button>
      )}

      {/* Transcription Output panel */}
      {isTranscribing && (
        <div className="p-8 rounded-2xl bg-[#0A0A0A] border border-[#222] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-fuchsia-500 animate-spin" />
          <p className="text-[10px] font-black uppercase text-[#888] tracking-[3px] animate-pulse">Running Neural Transcription...</p>
        </div>
      )}

      {transcript && (
        <div style={{ marginTop: '1px', paddingTop: '4px' }} className="bg-[#0A0A0A] border-2 border-fuchsia-600/20 rounded-2xl p-5 flex flex-col gap-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-[#222] pb-3 shrink-0">
            <h3 className="text-[12px] font-black text-fuchsia-500 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-400 animate-pulse" /> Transcribed Text
            </h3>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="p-2 bg-[#1a1a1a] hover:bg-[#252525] text-white rounded-lg border border-[#333] transition-all cursor-pointer active:scale-95 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                title="Copy to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-500" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#aaa]" /> Copy Text
                  </>
                )}
              </button>

              <button
                onClick={handleDownload}
                className="p-2 bg-[#1a1a1a] hover:bg-[#252525] text-white rounded-lg border border-[#333] transition-all cursor-pointer active:scale-95 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                title="Download text file"
              >
                <Download className="w-3.5 h-3.5 text-[#aaa]" /> Download
              </button>
            </div>
          </div>

          <p className="text-white text-[13px] leading-relaxed select-text font-medium whitespace-pre-wrap max-h-[180px] overflow-y-auto custom-scrollbar bg-[#111] p-4 rounded-xl border border-[#222]">
            {transcript}
          </p>

          <div className="text-[10px] text-center font-black uppercase tracking-[3px] text-[#444] select-none border-t border-[#222] pt-3">
            Transcribed with gemini-3.5-flash
          </div>
        </div>
      )}
    </div>
  );
}
