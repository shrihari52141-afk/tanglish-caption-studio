import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Upload, RotateCcw, Download, Sparkles, Terminal, Code, Key, FileText, Send, Paperclip, CheckCircle, AlertTriangle, Zap, Sliders, RefreshCw, Cpu, Layers, HelpCircle, FastForward } from 'lucide-react';
import { CaptionWord } from '../types';

interface TestBenchProps {
  onReturnToStudio?: () => void;
}

const DEFAULT_SYSTEM_PROMPT = `You are an ULTRA-PRECISION MULTI-MODAL ACOUSTIC FORCED ALIGNMENT ENGINE & LIP-SYNC CAPTION PROCESSOR. You process raw audio spectrograms to generate frame-perfect, millisecond-accurate single-word captions.

Your mission is to perform PHONEME-LEVEL ACOUSTIC BOUNDARY MEASUREMENT on the uploaded audio track. You MUST measure actual physical vocal cord attacks, vowel durations, consonant bursts, and breath silences. NEVER guess, estimate, or distribute timestamps equally across words.

=== SECTION 1: PHYSICAL ACOUSTIC MEASUREMENT LAWS ===
1. ABSOLUTE SINGLE-WORD TOKENIZATION: Every item in "words" MUST contain EXACTLY ONE single word string (e.g., "word": "society"). NEVER combine multiple words into one token string.
2. CONSONANT ATTACK & VOWEL DECAY TIMESTAMPS:
   - start_ms: Exact millisecond physical sound starts (e.g. 800ms).
   - end_ms: Exact millisecond sound stops.
3. SILENCE MAP & HIGHLIGHT HOLD ALGORITHM (pause_after_ms):
   - pause_after_ms = start_ms[next_word] - end_ms[current_word].
   - If speaker pauses for 1.5s between clauses, end_ms marks speech stop, and pause_after_ms = 1500.

=== SECTION 2: OUTPUT JSON SCHEMA ===
Return ONLY raw valid JSON with "segments" containing "words" array.`;

const DEFAULT_ALGORITHM_CODE = `// Timing & Normalization Engine Code
function processWords(rawWords) {
  return rawWords.map((w, i, arr) => {
    const start_time = Number(w.start_ms || 0) / 1000;
    const end_time = Number(w.end_ms || 0) / 1000;
    const nextStart = i < arr.length - 1 ? Number(arr[i + 1].start_ms || 0) / 1000 : end_time;
    const pause_after_ms = typeof w.pause_after_ms === "number" ? w.pause_after_ms : Math.max(0, Math.round((nextStart - end_time) * 1000));
    
    return {
      ...w,
      start_time,
      end_time,
      pause_after_ms,
      is_hotword: !!w.is_hotword
    };
  });
}`;

const DEFAULT_RESPONSE_SCHEMA = `{
  "type": "OBJECT",
  "properties": {
    "total_speech_duration_ms": { "type": "NUMBER" },
    "segments": {
      "type": "ARRAY",
      "items": {
        "properties": {
          "segment_id": { "type": "NUMBER" },
          "source_text": { "type": "STRING" },
          "translated_text": { "type": "STRING" },
          "emoji": { "type": "STRING" },
          "speech_window_ms": {
            "type": "OBJECT",
            "properties": {
              "start_ms": { "type": "NUMBER" },
              "end_ms": { "type": "NUMBER" }
            }
          },
          "words": {
            "type": "ARRAY",
            "items": {
              "properties": {
                "word": { "type": "STRING" },
                "start_ms": { "type": "NUMBER" },
                "end_ms": { "type": "NUMBER" },
                "pause_after_ms": { "type": "NUMBER" },
                "is_hotword": { "type": "BOOLEAN" },
                "is_name": { "type": "BOOLEAN" },
                "is_sentence_end": { "type": "BOOLEAN" }
              },
              "required": ["word", "start_ms", "end_ms"]
            }
          }
        }
      }
    }
  }
}`;

export default function TestBench({ onReturnToStudio }: TestBenchProps) {
  // Video & Audio state
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Caption words & output state
  const [words, setWords] = useState<CaptionWord[]>([]);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [rawGeminiJson, setRawGeminiJson] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>(["[System] Test Bench Engine Initialized."]);

  // Model & Prompt parameters
  const [modelName, setModelName] = useState<string>("gemini-3.5-flash");
  const [language, setLanguage] = useState<string>("tamil");
  const [translationMode, setTranslationMode] = useState<string>("transliterate");
  const [useEmojis, setUseEmojis] = useState<boolean>(true);
  const [usePunctuation, setUsePunctuation] = useState<boolean>(true);

  // Editable Code & Prompts
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPT);
  const [algorithmCode, setAlgorithmCode] = useState<string>(DEFAULT_ALGORITHM_CODE);
  const [responseSchema, setResponseSchema] = useState<string>(DEFAULT_RESPONSE_SCHEMA);

  // 11 API Keys Manager
  const [apiKeysText, setApiKeysText] = useState<string>(
    `AQ.KEY_1_DEMO\nAQ.KEY_2_DEMO\nAQ.KEY_3_DEMO\nAQ.KEY_4_DEMO\nAQ.KEY_5_DEMO\nAQ.KEY_6_DEMO\nAQ.KEY_7_DEMO\nAQ.KEY_8_DEMO\nAQ.KEY_9_DEMO\nAQ.KEY_10_DEMO\nAQ.KEY_11_DEMO`
  );

  // UI Tabs & Flags
  const [activeTab, setActiveTab] = useState<'prompt' | 'code' | 'schema' | 'keys' | 'logs' | 'json'>('prompt');
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoSyncPromptCode, setAutoSyncPromptCode] = useState(true);

  // AI Copilot Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; time: string }>>([
    {
      sender: 'ai',
      text: '👋 Hello! I am your AI Copilot. I can edit prompts, fix misaligned words, update pacing algorithms, or re-process audio. Ask me anything!',
      time: new Date().toLocaleTimeString(),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Keep RAF playback time updated
  useEffect(() => {
    let animId: number;
    const updateTime = () => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
      }
      animId = requestAnimationFrame(updateTime);
    };
    animId = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Handle Video Upload
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      addLog(`Loaded video file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
    }
  };

  const addLog = (msg: string) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    setLogs((prev) => [entry, ...prev]);
  };

  // Toggle Video Playback
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Run Transcription on Test Bench
  const runTestBenchTranscription = async () => {
    if (!videoFile) {
      alert("Please upload a video file first.");
      return;
    }

    setIsProcessing(true);
    addLog(`Initiating transcription via model ${modelName}...`);

    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append("customSystemPrompt", systemPrompt);
    formData.append("customResponseSchema", responseSchema);
    formData.append("customApiKeys", apiKeysText);
    formData.append("modelName", modelName);
    formData.append("language", language);
    formData.append("translationMode", translationMode);
    formData.append("useEmojis", String(useEmojis));
    formData.append("usePunctuation", String(usePunctuation));

    try {
      const res = await fetch("/api/test-bench/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Transcription request failed");
      }

      const data = await res.json();
      setWords(data.words || []);
      setRawGeminiJson(data.rawJson || {});
      if (Array.isArray(data.logs)) {
        data.logs.forEach((l: string) => addLog(l));
      }
      addLog(`✅ Transcription completed successfully! (${data.words?.length || 0} words)`);
    } catch (err: any) {
      addLog(`❌ Error: ${err.message || err}`);
      alert(`Transcription Failed: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Sync selected word timestamp to video currentTime
  const syncSelectedWordToCurrentTime = (type: 'start' | 'end') => {
    if (selectedWordIndex === null || !words[selectedWordIndex]) return;

    const newWords = [...words];
    const target = newWords[selectedWordIndex];
    const newTime = Number(currentTime.toFixed(3));

    if (type === 'start') {
      target.start_time = newTime;
      addLog(`Updated word #${selectedWordIndex + 1} ("${target.word}") start_time -> ${newTime}s`);
    } else {
      target.end_time = newTime;
      addLog(`Updated word #${selectedWordIndex + 1} ("${target.word}") end_time -> ${newTime}s`);
    }

    setWords(newWords);

    // Auto-update system prompt and code if toggle enabled
    if (autoSyncPromptCode) {
      const updatedPrompt = systemPrompt + `\n// Sync Rule Update (${new Date().toLocaleTimeString()}): Word #${selectedWordIndex + 1} ("${target.word}") aligned at ${newTime}s.`;
      setSystemPrompt(updatedPrompt);
      addLog(`Auto-updated System Prompt with sync rule.`);
    }
  };

  // Shift all timestamps by offset
  const shiftAllTimestamps = (deltaSec: number) => {
    const updated = words.map((w) => ({
      ...w,
      start_time: Math.max(0, Number((w.start_time + deltaSec).toFixed(3))),
      end_time: Math.max(0.1, Number((w.end_time + deltaSec).toFixed(3))),
    }));
    setWords(updated);
    addLog(`Shifted all timestamps by ${deltaSec > 0 ? '+' : ''}${deltaSec}s`);
  };

  // Export current settings, prompt, and algorithm code as .txt file
  const exportAlgorithmTxt = () => {
    const content = `=====================================================
TANGLISH CAPTION STUDIO - TEST BENCH ALGORITHM EXPORT
Exported at: ${new Date().toLocaleString()}
=====================================================

1. MODEL CONFIGURATION:
------------------------
Primary Model: ${modelName}
Language: ${language}
Mode: ${translationMode}
Use Emojis: ${useEmojis}
Use Punctuation: ${usePunctuation}

2. ACTIVE SYSTEM PROMPT:
------------------------
${systemPrompt}

3. TIMING & NORMALIZATION ALGORITHM CODE:
------------------------------------------
${algorithmCode}

4. RESPONSE SCHEMA JSON:
------------------------
${responseSchema}

5. ACTIVE WORD TIMESTAMPS (${words.length} words):
-------------------------------------------
${JSON.stringify(words, null, 2)}
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caption_algorithm_export_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('Exported current algorithm and prompt settings to .txt');
  };

  // AI Copilot Chat Handler
  const handleSendAiMessage = async () => {
    if (!chatInput.trim() && !chatFile) return;

    const userText = chatInput;
    const nowStr = new Date().toLocaleTimeString();
    setChatMessages((prev) => [...prev, { sender: 'user', text: userText, time: nowStr }]);
    setChatInput('');
    setIsAiThinking(true);

    const formData = new FormData();
    formData.append('message', userText);
    formData.append(
      'currentState',
      JSON.stringify({
        modelName,
        language,
        translationMode,
        wordsCount: words.length,
        wordsSample: words.slice(0, 10),
        systemPromptSnippet: systemPrompt.slice(0, 300),
      })
    );
    formData.append('customApiKeys', apiKeysText);
    formData.append('modelName', modelName);
    if (chatFile) {
      formData.append('media', chatFile);
    }

    try {
      const res = await fetch('/api/test-bench/ai-chat', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('AI Chat failed');

      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { sender: 'ai', text: data.reply || 'State updated successfully.', time: new Date().toLocaleTimeString() },
      ]);

      // Apply mutations returned by AI
      if (data.mutations) {
        if (Array.isArray(data.mutations.updatedWords)) {
          setWords(data.mutations.updatedWords);
          addLog('AI Copilot updated caption words.');
        }
        if (data.mutations.updatedSystemPrompt) {
          setSystemPrompt(data.mutations.updatedSystemPrompt);
          addLog('AI Copilot updated System Prompt.');
        }
        if (data.mutations.updatedAlgorithmCode) {
          setAlgorithmCode(data.mutations.updatedAlgorithmCode);
          addLog('AI Copilot updated Timing Algorithm code.');
        }
        if (data.mutations.updatedModelName) {
          setModelName(data.mutations.updatedModelName);
          addLog(`AI Copilot changed model -> ${data.mutations.updatedModelName}`);
        }
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        { sender: 'ai', text: `❌ AI Error: ${err.message || err}`, time: new Date().toLocaleTimeString() },
      ]);
    } finally {
      setIsAiThinking(false);
      setChatFile(null);
    }
  };

  // Find currently active word based on video time & pause_after_ms hold rule
  const activeWord = words.find((w) => {
    const pauseSec = (w.pause_after_ms || 0) / 1000;
    return currentTime >= w.start_time && currentTime < w.end_time + pauseSec;
  });

  return (
    <div className="min-h-screen bg-[#070709] text-white flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-[#111116] border-b border-white/10 px-6 py-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-fuchsia-600 to-indigo-600 rounded-xl shadow-lg shadow-fuchsia-500/20">
            <Cpu className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-purple-300 to-indigo-400">
              AI PROMPT & TIMING TEST BENCH v12.0
            </h1>
            <p className="text-xs text-gray-400">Live Gemini Spectrogram Alignment & Sync Engineering Suite</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportAlgorithmTxt}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md active:scale-95"
          >
            <Download className="w-4 h-4" />
            Export Settings (.txt)
          </button>

          {onReturnToStudio && (
            <button
              onClick={onReturnToStudio}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all border border-white/10"
            >
              <RotateCcw className="w-4 h-4" />
              Return to Studio
            </button>
          )}
        </div>
      </header>

      {/* Main Grid Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 overflow-hidden">
        
        {/* LEFT COLUMN: Video Container & Manual Sync Editor (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4 overflow-y-auto pr-1">
          
          {/* Video Container Card */}
          <div className="bg-[#121218] border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300 flex items-center gap-2">
                <Play className="w-4 h-4 text-fuchsia-400" /> Preview Video & Audio Sync
              </span>
              <label className="cursor-pointer bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shadow-md">
                <Upload className="w-3.5 h-3.5" /> Upload Video
                <input type="file" accept="video/*,audio/*" onChange={handleVideoUpload} className="hidden" />
              </label>
            </div>

            {/* Video Container Display */}
            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/10 flex items-center justify-center">
              {videoUrl ? (
                <>
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                    onEnded={() => setIsPlaying(false)}
                    className="w-full h-full object-contain"
                  />

                  {/* Subtitle Overlay */}
                  {activeWord && (
                    <div className="absolute bottom-6 inset-x-0 mx-auto w-max max-w-[85%] bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 shadow-2xl flex items-center gap-2 transition-all">
                      <span
                        className={`text-xl font-black ${
                          activeWord.is_hotword
                            ? 'text-yellow-300 drop-shadow-[0_0_12px_rgba(234,179,8,0.8)] scale-110'
                            : 'text-white'
                        }`}
                      >
                        {activeWord.word}
                      </span>
                      {activeWord.emoji && <span className="text-xl">{activeWord.emoji}</span>}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-500 p-6 text-center">
                  <Upload className="w-10 h-10 text-gray-600" />
                  <span className="text-sm font-bold">No Media Loaded</span>
                  <span className="text-xs text-gray-600">Upload a video to test caption lip-syncing</span>
                </div>
              )}
            </div>

            {/* Playback Scrubber & Speed Controls */}
            {videoUrl && (
              <div className="flex flex-col gap-2 bg-black/40 p-2.5 rounded-xl border border-white/5">
                <div className="flex items-center justify-between text-xs font-mono text-gray-400">
                  <span>{currentTime.toFixed(2)}s</span>
                  <span>{duration.toFixed(2)}s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  step="0.01"
                  value={currentTime}
                  onChange={(e) => {
                    const t = parseFloat(e.target.value);
                    if (videoRef.current) videoRef.current.currentTime = t;
                    setCurrentTime(t);
                  }}
                  className="w-full accent-fuchsia-500 cursor-pointer"
                />

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={togglePlay}
                    className="p-2 bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg text-white transition-all shadow-md"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>

                  <div className="flex items-center gap-1">
                    {[0.5, 0.75, 1.0, 1.25, 1.5].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => {
                          setPlaybackSpeed(speed);
                          if (videoRef.current) videoRef.current.playbackRate = speed;
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded ${
                          playbackSpeed === speed ? 'bg-fuchsia-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Word Timing Adjuster */}
          <div className="bg-[#121218] border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" /> Word Sync Adjuster ({words.length} words)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => shiftAllTimestamps(-0.1)}
                  className="text-[10px] font-bold bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-gray-300 border border-white/10"
                >
                  -100ms All
                </button>
                <button
                  onClick={() => shiftAllTimestamps(0.1)}
                  className="text-[10px] font-bold bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-gray-300 border border-white/10"
                >
                  +100ms All
                </button>
              </div>
            </div>

            {/* Sync Current Time Controls */}
            {selectedWordIndex !== null && words[selectedWordIndex] && (
              <div className="bg-fuchsia-950/40 border border-fuchsia-500/30 p-3 rounded-xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-fuchsia-300">
                    Selected Word #{selectedWordIndex + 1}: "{words[selectedWordIndex].word}"
                  </span>
                  <span className="font-mono text-gray-400">
                    {words[selectedWordIndex].start_time}s - {words[selectedWordIndex].end_time}s
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => syncSelectedWordToCurrentTime('start')}
                    className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold py-1.5 rounded-lg shadow-md flex items-center justify-center gap-1"
                  >
                    ⏱️ Sync Start to Current ({currentTime.toFixed(2)}s)
                  </button>
                  <button
                    onClick={() => syncSelectedWordToCurrentTime('end')}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-1.5 rounded-lg shadow-md flex items-center justify-center gap-1"
                  >
                    ⏱️ Sync End to Current ({currentTime.toFixed(2)}s)
                  </button>
                </div>
              </div>
            )}

            {/* Word List Table */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 border border-white/5 rounded-xl p-2 bg-black/30">
              {words.length === 0 ? (
                <div className="text-center text-xs text-gray-500 py-8">Run transcription to populate timing data</div>
              ) : (
                words.map((w, idx) => {
                  const isActive = activeWord?.id === w.id;
                  const isSelected = selectedWordIndex === idx;
                  return (
                    <div
                      key={w.id || idx}
                      onClick={() => setSelectedWordIndex(idx)}
                      className={`p-2 rounded-lg text-xs font-mono flex items-center justify-between cursor-pointer border transition-all ${
                        isSelected
                          ? 'bg-fuchsia-600/30 border-fuchsia-500 text-white'
                          : isActive
                          ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                          : 'bg-white/5 border-white/5 hover:bg-white/10 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">#{idx + 1}</span>
                        <span className="font-bold text-sm">{w.word}</span>
                        {w.is_hotword && <span className="text-[10px] bg-yellow-500/30 text-yellow-300 px-1.5 py-0.5 rounded font-sans font-bold">HOTWORD</span>}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-gray-400">
                        <span>{w.start_time}s → {w.end_time}s</span>
                        <span className="text-gray-500">+{w.pause_after_ms || 0}ms</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE COLUMN: Editable Prompts, Code & Logs (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto">
          
          {/* Controls Bar */}
          <div className="bg-[#121218] border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" /> Engine Config
              </span>
              <button
                onClick={runTestBenchTranscription}
                disabled={isProcessing || !videoFile}
                className="bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                Run Test Transcription
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-1">Model Selection</label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs focus:border-fuchsia-500 outline-none"
                >
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash (Primary)</option>
                  <option value="gemini-3.6-flash">Gemini 3.6 Flash (Secondary)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-1">Source Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs focus:border-fuchsia-500 outline-none"
                >
                  <option value="tamil">Tamil / Tanglish</option>
                  <option value="hindi">Hindi / Hinglish</option>
                  <option value="english">English</option>
                  <option value="kannada">Kannada</option>
                  <option value="telugu">Telugu</option>
                  <option value="malayalam">Malayalam</option>
                </select>
              </div>
            </div>
          </div>

          {/* Editable Code & Prompt Tabs Card */}
          <div className="bg-[#121218] border border-white/10 rounded-2xl p-4 shadow-2xl flex-1 flex flex-col gap-3">
            {/* Tab Headers */}
            <div className="flex items-center gap-1 border-b border-white/10 pb-2 overflow-x-auto">
              {[
                { id: 'prompt', label: 'System Prompt', icon: FileText },
                { id: 'code', label: 'Algorithm Code', icon: Code },
                { id: 'schema', label: 'JSON Schema', icon: Layers },
                { id: 'keys', label: '11 API Keys', icon: Key },
                { id: 'logs', label: 'Live Logs', icon: Terminal },
                { id: 'json', label: 'Raw Output', icon: Cpu },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                      active ? 'bg-fuchsia-600 text-white shadow-md' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="flex-1 flex flex-col min-h-[300px]">
              {activeTab === 'prompt' && (
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>Editable System Prompt sent to Gemini</span>
                    <button
                      onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                      className="text-fuchsia-400 hover:underline font-bold"
                    >
                      Reset to Master Engine v12.0
                    </button>
                  </div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="w-full flex-1 min-h-[280px] bg-black/60 border border-white/10 rounded-xl p-3 text-xs font-mono text-emerald-300 focus:border-fuchsia-500 outline-none resize-none leading-relaxed"
                  />
                </div>
              )}

              {activeTab === 'code' && (
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>Editable Timing Normalization & Silence Algorithm Code</span>
                    <button
                      onClick={() => setAlgorithmCode(DEFAULT_ALGORITHM_CODE)}
                      className="text-fuchsia-400 hover:underline font-bold"
                    >
                      Reset Code
                    </button>
                  </div>
                  <textarea
                    value={algorithmCode}
                    onChange={(e) => setAlgorithmCode(e.target.value)}
                    className="w-full flex-1 min-h-[280px] bg-black/60 border border-white/10 rounded-xl p-3 text-xs font-mono text-cyan-300 focus:border-fuchsia-500 outline-none resize-none leading-relaxed"
                  />
                </div>
              )}

              {activeTab === 'schema' && (
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>Editable Response Schema JSON</span>
                    <button
                      onClick={() => setResponseSchema(DEFAULT_RESPONSE_SCHEMA)}
                      className="text-fuchsia-400 hover:underline font-bold"
                    >
                      Reset Schema
                    </button>
                  </div>
                  <textarea
                    value={responseSchema}
                    onChange={(e) => setResponseSchema(e.target.value)}
                    className="w-full flex-1 min-h-[280px] bg-black/60 border border-white/10 rounded-xl p-3 text-xs font-mono text-yellow-300 focus:border-fuchsia-500 outline-none resize-none leading-relaxed"
                  />
                </div>
              )}

              {activeTab === 'keys' && (
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>Manage 11 API Keys for Rotation</span>
                    <span className="text-emerald-400 font-bold">Automatic Key Failover ON</span>
                  </div>
                  <textarea
                    value={apiKeysText}
                    onChange={(e) => setApiKeysText(e.target.value)}
                    placeholder="Enter API keys one per line..."
                    className="w-full flex-1 min-h-[280px] bg-black/60 border border-white/10 rounded-xl p-3 text-xs font-mono text-gray-300 focus:border-fuchsia-500 outline-none resize-none leading-relaxed"
                  />
                </div>
              )}

              {activeTab === 'logs' && (
                <div className="flex-1 bg-black/80 border border-white/10 rounded-xl p-3 text-xs font-mono text-green-400 max-h-[320px] overflow-y-auto space-y-1">
                  {logs.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              )}

              {activeTab === 'json' && (
                <div className="flex-1 bg-black/80 border border-white/10 rounded-xl p-3 text-xs font-mono text-indigo-300 max-h-[320px] overflow-y-auto">
                  <pre>{JSON.stringify(rawGeminiJson || { message: "No output yet." }, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Autonomous AI Copilot Assistant Chat (3 cols) */}
        <div className="lg:col-span-3 bg-[#121218] border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 h-full">
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <Sparkles className="w-5 h-5 text-fuchsia-400" />
            <div>
              <h2 className="text-xs font-black text-white uppercase tracking-wider">AI Copilot Controller</h2>
              <p className="text-[10px] text-gray-400">Full App Control & Prompt Tuning AI</p>
            </div>
          </div>

          {/* Quick Action Chips */}
          <div className="flex flex-wrap gap-1.5">
            {[
              "Fix word #2",
              "Add 150ms delay",
              "Enforce 30% hotwords",
              "Optimize for Tanglish",
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => setChatInput(chip)}
                className="text-[10px] bg-white/5 hover:bg-white/10 text-gray-300 px-2 py-1 rounded-md border border-white/5 transition-all"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Chat Messages Window */}
          <div className="flex-1 max-h-[420px] overflow-y-auto space-y-3 p-2 bg-black/40 rounded-xl border border-white/5">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col gap-1 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`p-2.5 rounded-xl text-xs max-w-[90%] leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-fuchsia-600 text-white rounded-br-none'
                      : 'bg-white/10 text-gray-200 rounded-bl-none border border-white/10'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[9px] text-gray-500 font-mono px-1">{msg.time}</span>
              </div>
            ))}
            {isAiThinking && (
              <div className="flex items-center gap-2 text-xs text-fuchsia-400 font-mono p-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> AI Copilot is thinking...
              </div>
            )}
          </div>

          {/* Chat Input & Media Upload */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            {chatFile && (
              <div className="flex items-center justify-between bg-white/5 p-1.5 rounded-lg text-xs text-fuchsia-300">
                <span className="truncate">📎 {chatFile.name}</span>
                <button onClick={() => setChatFile(null)} className="text-gray-400 hover:text-white">✕</button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white cursor-pointer transition-all border border-white/10">
                <Paperclip className="w-4 h-4" />
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={(e) => setChatFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendAiMessage()}
                placeholder="Ask AI to fix words, prompts or code..."
                className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-fuchsia-500 outline-none"
              />

              <button
                onClick={handleSendAiMessage}
                disabled={isAiThinking}
                className="p-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
