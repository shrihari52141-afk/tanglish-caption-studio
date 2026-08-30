import React, { useRef, useState, useEffect } from 'react';
import { 
  Upload, 
  Loader2, 
  Sparkles, 
  Languages, 
  Smile, 
  ChevronLeft, 
  Check, 
  Video, 
  FileAudio, 
  Zap, 
  Volume2, 
  Play, 
  Square, 
  Search, 
  Filter, 
  User, 
  Sliders, 
  Music,
  HelpCircle
} from 'lucide-react';
import { extractAudioTrack } from '../utils/audioExtractor';
import { DUBBING_VOICES, EMOTION_STYLES } from '../data/voices';
import { DubbingSettings, DubbingVoice } from '../types';
import { cancelAndClearSession } from '../utils/dubbingEngine';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

interface VideoUploaderProps {
  onUpload: (
    file: File,
    language: string,
    useEmojis: boolean,
    translationMode: string,
    usePunctuation: boolean,
    emojiStyle: 'none' | 'emotions' | 'vibes' | 'objects' | 'energetic' | 'minimal' | 'custom' | 'auto',
    enableHotwords: boolean,
    preExtractedAudioBlob?: Blob | null,
    dubbingSettings?: DubbingSettings
  ) => void;
  isProcessing: boolean;
  initialFile?: File | null;
}

export default function VideoUploader({ onUpload, isProcessing, initialFile }: VideoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile || null);

  useEffect(() => {
    if (initialFile) {
      setSelectedFile(initialFile);
    }
  }, [initialFile]);

  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    return localStorage.getItem('saved_selectedLanguage') || 'auto';
  });
  const [translationMode, setTranslationMode] = useState<string>(() => {
    return localStorage.getItem('saved_translationMode') || 'transliterate';
  });
  const [useEmojis, setUseEmojis] = useState<boolean>(() => {
    const val = localStorage.getItem('saved_useEmojis');
    return val !== null ? val === 'true' : true;
  });
  const [usePunctuation, setUsePunctuation] = useState<boolean>(() => {
    const val = localStorage.getItem('saved_usePunctuation');
    return val !== null ? val === 'true' : true;
  });
  const [emojiStyle, setEmojiStyle] = useState<'none' | 'emotions' | 'vibes' | 'objects' | 'energetic' | 'minimal' | 'custom' | 'auto'>(() => {
    return (localStorage.getItem('saved_emojiStyle') as any) || 'auto';
  });
  const [enableHotwords, setEnableHotwords] = useState<boolean>(() => {
    const val = localStorage.getItem('saved_enableHotwords');
    return val !== null ? val === 'true' : false;
  });

  // Dubbing state
  const [enableDubbing, setEnableDubbing] = useState<boolean>(() => {
    const val = localStorage.getItem('saved_enableDubbing');
    return val === 'true';
  });
  const [dubbingTargetLang, setDubbingTargetLang] = useState<string>(() => {
    return localStorage.getItem('saved_dubbingTargetLang') || 'english';
  });
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(() => {
    return localStorage.getItem('saved_selectedVoiceId') || 'gemini-puck';
  });
  const [selectedEmotion, setSelectedEmotion] = useState<any>(() => {
    return localStorage.getItem('saved_selectedEmotion') || 'natural';
  });
  const [naturalFillers, setNaturalFillers] = useState<boolean>(true);
  const [fitDuration, setFitDuration] = useState<boolean>(true);

  const [voiceSearch, setVoiceSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  const [extractedAudioBlob, setExtractedAudioBlob] = useState<Blob | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const [extractedAudioSize, setExtractedAudioSize] = useState<string>('');

  useEffect(() => {
    localStorage.setItem('saved_selectedLanguage', selectedLanguage);
  }, [selectedLanguage]);

  useEffect(() => {
    localStorage.setItem('saved_translationMode', translationMode);
  }, [translationMode]);

  useEffect(() => {
    localStorage.setItem('saved_useEmojis', String(useEmojis));
  }, [useEmojis]);

  useEffect(() => {
    localStorage.setItem('saved_usePunctuation', String(usePunctuation));
  }, [usePunctuation]);

  useEffect(() => {
    localStorage.setItem('saved_emojiStyle', emojiStyle);
  }, [emojiStyle]);

  useEffect(() => {
    localStorage.setItem('saved_enableHotwords', String(enableHotwords));
  }, [enableHotwords]);

  useEffect(() => {
    localStorage.setItem('saved_enableDubbing', String(enableDubbing));
  }, [enableDubbing]);

  useEffect(() => {
    localStorage.setItem('saved_dubbingTargetLang', dubbingTargetLang);
  }, [dubbingTargetLang]);

  useEffect(() => {
    localStorage.setItem('saved_selectedVoiceId', selectedVoiceId);
  }, [selectedVoiceId]);

  useEffect(() => {
    localStorage.setItem('saved_selectedEmotion', selectedEmotion);
  }, [selectedEmotion]);

  // Background audio extraction & cache lifecycle
  useEffect(() => {
    let active = true;
    if (selectedFile) {
      cancelAndClearSession();

      const startBackgroundExtraction = async (file: File) => {
        setExtractedAudioBlob(null);
        setExtractedAudioSize('');
        setExtractionStatus('Validating & preparing audio in background...');
        
        const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);
        if (isAudio) {
          if (active) {
            setExtractedAudioBlob(file);
            setExtractedAudioSize(formatFileSize(file.size));
            setExtractionStatus('Audio file ready for AI pipeline! ✨');
          }
          return;
        }

        try {
          const blob = await extractAudioTrack(file, (msg) => {
            if (active) {
              setExtractionStatus(`Background extraction: ${msg}`);
            }
          });
          if (active) {
            setExtractedAudioBlob(blob);
            setExtractedAudioSize(formatFileSize(blob.size));
            setExtractionStatus('Audio cached & ready for AI models! ✨');
          }
        } catch (err) {
          if (active) {
            setExtractionStatus('Background extraction complete. Ready to generate.');
          }
        }
      };

      startBackgroundExtraction(selectedFile);
    } else {
      cancelAndClearSession();
      setExtractedAudioBlob(null);
      setExtractedAudioSize('');
      setExtractionStatus('');
    }
    return () => {
      active = false;
    };
  }, [selectedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('video/') || file.type.startsWith('audio/'))) {
      setSelectedFile(file);
    }
  };

  const handlePreviewVoice = (voice: DubbingVoice, e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewingVoiceId === voice.id) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setPreviewingVoiceId(null);
      return;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const sampleText = `Hello! I am ${voice.name.split(' ')[0]}. I can naturally dub your media with human expression.`;
      const utterance = new SpeechSynthesisUtterance(sampleText);
      utterance.rate = voice.rate || 1.0;
      utterance.pitch = voice.pitch || 1.0;

      const voices = window.speechSynthesis.getVoices();
      const matched = voices.find(v => (voice.gender === 'female' ? /female|woman|zira|samantha/i.test(v.name) : /male|man|david|alex/i.test(v.name)));
      if (matched) utterance.voice = matched;

      utterance.onend = () => setPreviewingVoiceId(null);
      utterance.onerror = () => setPreviewingVoiceId(null);

      setPreviewingVoiceId(voice.id);
      window.speechSynthesis.speak(utterance);
    } else {
      setPreviewingVoiceId(voice.id);
      setTimeout(() => setPreviewingVoiceId(null), 2500);
    }
  };

  const filteredVoices = DUBBING_VOICES.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(voiceSearch.toLowerCase()) || 
                          v.tags.some(t => t.toLowerCase().includes(voiceSearch.toLowerCase())) ||
                          v.description.toLowerCase().includes(voiceSearch.toLowerCase());
    const matchesGender = genderFilter === 'all' || v.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  const handleGenerate = () => {
    if (selectedFile) {
      const dubbingPayload: DubbingSettings = {
        enabled: enableDubbing,
        targetLanguage: dubbingTargetLang,
        voiceId: selectedVoiceId,
        emotion: selectedEmotion,
        speechRate: 1.0,
        speechPitch: 1.0,
        naturalFillers,
        fitOriginalDuration: fitDuration
      };

      onUpload(
        selectedFile,
        selectedLanguage,
        useEmojis,
        translationMode,
        usePunctuation,
        emojiStyle,
        enableHotwords,
        extractedAudioBlob,
        dubbingPayload
      );
    }
  };

  if (!selectedFile) {
    return (
      <div 
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="w-full max-w-xl mx-auto p-6 sm:p-10 bg-[#161616] border-2 border-dashed border-[#333] hover:border-fuchsia-600 rounded-3xl flex flex-col items-center justify-center gap-6 sm:gap-8 transition-all group cursor-pointer shadow-2xl"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-fuchsia-600/10 flex items-center justify-center border border-fuchsia-600/30 group-hover:scale-110 transition-transform shadow-lg shadow-fuchsia-600/10">
            <Upload className="w-8 h-8 text-fuchsia-500" />
          </div>
          <h2 className="text-[26px] font-black tracking-tight text-white uppercase mt-4">
            Import Video or Audio
          </h2>
          <p className="text-[#888888] text-[13px] font-extrabold uppercase tracking-widest max-w-md leading-relaxed">
            Drag & drop or click to select a file <br/>
            <span className="text-fuchsia-500/80">(Supports MP4, MOV, WEBM, MKV, MP3, WAV, M4A, AAC)</span>
          </p>
        </div>

        <button
          type="button"
          className="py-4 px-8 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white rounded-full font-black text-[15px] uppercase tracking-wide flex items-center justify-center gap-3 transition-colors border-none shadow-lg shadow-fuchsia-600/20 active:scale-95 cursor-pointer"
        >
          <Video className="w-5 h-5" /> Select Media File
        </button>

        <input
          type="file"
          accept="video/*,audio/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div style={{ marginTop: '-25px' }} className="w-full max-w-2xl mx-auto bg-[#161616] border border-[#333] rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.6)] flex flex-col max-h-[min(780px,calc(100vh-100px))]">
      {/* Header with selected file info */}
      <div className="p-4 sm:p-5 bg-[#0E0E0E] border-b border-[#252525] flex items-center justify-between shrink-0">
        <button 
          onClick={() => setSelectedFile(null)}
          className="flex items-center gap-1.5 text-[11px] font-black uppercase text-[#888888] hover:text-white transition-colors cursor-pointer bg-[#1a1a1a] px-3 py-1.5 rounded-lg border border-[#2a2a2a]"
        >
          <ChevronLeft className="w-4 h-4" /> Replace File
        </button>
        <div className="flex items-center gap-2 max-w-[320px]">
          {selectedFile.type.startsWith('audio/') ? (
            <FileAudio className="w-4 h-4 text-green-500 shrink-0" />
          ) : (
            <Video className="w-4 h-4 text-fuchsia-500 shrink-0" />
          )}
          <span className="text-[12px] font-bold text-white truncate uppercase tracking-tight">
            {selectedFile.name}
          </span>
          <span className="text-[10px] font-mono text-fuchsia-400/70 shrink-0 bg-fuchsia-500/10 px-2 py-0.5 rounded-full">
            {formatFileSize(selectedFile.size)}
          </span>
        </div>
      </div>

      {/* Scrollable middle section */}
      <div className="flex-1 p-4 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
        
        {/* Source Language & Target Output Script Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#141414] p-4 rounded-2xl border border-[#2a2a2a] shadow-inner">
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-fuchsia-400 flex items-center gap-1.5">
              🎙️ Spoken Audio Language
            </label>
            <div className="relative">
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-[#0A0A0A] border border-[#3a3a3a] hover:border-fuchsia-500 rounded-xl text-white text-xs font-bold px-3 py-2.5 w-full focus:outline-none focus:border-fuchsia-500 appearance-none cursor-pointer transition-colors"
              >
                <option value="auto">⚡ Auto Detect (Tamil, Hindi, English, etc.)</option>
                <option value="tamil">தமிழ் (Tamil)</option>
                <option value="hindi">हिन्दी (Hindi)</option>
                <option value="english">English (Global)</option>
                <option value="kannada">ಕನ್ನಡ (Kannada)</option>
                <option value="telugu">తెలుగు (Telugu)</option>
                <option value="malayalam">മലയാളം (Malayalam)</option>
                <option value="bengali">বাংলা (Bengali)</option>
                <option value="marathi">मराठी (Marathi)</option>
                <option value="gujarati">ગુજરાતી (Gujarati)</option>
                <option value="punjabi">ਪੰਜਾਬੀ (Punjabi)</option>
                <option value="urdu">اردو (Urdu)</option>
                <option value="spanish">Español (Spanish)</option>
                <option value="french">Français (French)</option>
                <option value="german">Deutsch (German)</option>
                <option value="japanese">日本語 (Japanese)</option>
                <option value="korean">한국어 (Korean)</option>
                <option value="chinese">中文 (Chinese)</option>
                <option value="arabic">العربية (Arabic)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-fuchsia-400 flex items-center gap-1.5">
              🌐 Caption Output Script
            </label>
            <div className="relative">
              <select
                value={translationMode}
                onChange={(e) => setTranslationMode(e.target.value)}
                className="bg-[#0A0A0A] border border-[#3a3a3a] hover:border-fuchsia-500 rounded-xl text-white text-xs font-bold px-3 py-2.5 w-full focus:outline-none focus:border-fuchsia-500 appearance-none cursor-pointer transition-colors"
              >
                <option value="auto_roman">🔤 Roman Script (Tanglish / Hinglish in English Script) ✨</option>
                <option value="translate_english">🇬🇧 Translate to English (Netflix Standard)</option>
                <option value="keep_script">🇮🇳 Keep Original Native Script (தமிழ், हिन्दी, etc.)</option>
                <option value="translate_tamil">🇮🇳 Translate to Tamil (தமிழ்)</option>
                <option value="translate_hindi">🇮🇳 Translate to Hindi (हिन्दी)</option>
                <option value="translate_kannada">🇮🇳 Translate to Kannada (ಕನ್ನಡ)</option>
                <option value="translate_telugu">🇮🇳 Translate to Telugu (తెలుగు)</option>
                <option value="translate_malayalam">🇮🇳 Translate to Malayalam (മലയാളം)</option>
                <option value="translate_spanish">🇪🇸 Translate to Spanish (Español)</option>
                <option value="translate_french">🇫🇷 Translate to French (Français)</option>
                <option value="translate_german">🇩🇪 Translate to German (Deutsch)</option>
              </select>
            </div>
          </div>
        </div>

        {/* AI Voice Dubbing & Speech Studio Section */}
        <div className="bg-gradient-to-br from-[#18121f] to-[#121216] p-4 rounded-2xl border border-fuchsia-500/30 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-fuchsia-600/20 border border-fuchsia-500/40 flex items-center justify-center text-fuchsia-400">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                  AI Voice Dubbing Studio
                  <span className="text-[9px] bg-fuchsia-500/20 text-fuchsia-300 px-2 py-0.5 rounded-full font-mono">PRO</span>
                </h3>
                <p className="text-[10px] text-gray-400">Generate expressive human speech synced with video duration</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEnableDubbing(!enableDubbing)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                enableDubbing 
                  ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30 ring-2 ring-fuchsia-400/50' 
                  : 'bg-[#222] text-gray-400 hover:text-white hover:bg-[#2c2c2c]'
              }`}
            >
              {enableDubbing ? <Check className="w-3.5 h-3.5" /> : null}
              {enableDubbing ? 'Dubbing Active' : 'Enable Dubbing'}
            </button>
          </div>

          {enableDubbing && (
            <div className="space-y-4 pt-2 border-t border-[#2a2a38] animate-fade-in">
              
              {/* Target Dubbing Language */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-fuchsia-300">
                  Target Spoken Dubbing Language
                </label>
                <select
                  value={dubbingTargetLang}
                  onChange={(e) => setDubbingTargetLang(e.target.value)}
                  className="bg-[#0A0A0A] border border-[#3a3a3a] hover:border-fuchsia-500 rounded-xl text-white text-xs font-bold px-3 py-2.5 w-full focus:outline-none focus:border-fuchsia-500 cursor-pointer"
                >
                  <option value="english">English (US / Global)</option>
                  <option value="tamil">Tamil (தமிழ்)</option>
                  <option value="hindi">Hindi (हिन्दी)</option>
                  <option value="telugu">Telugu (తెలుగు)</option>
                  <option value="kannada">Kannada (ಕನ್ನಡ)</option>
                  <option value="malayalam">Malayalam (മലയാളം)</option>
                  <option value="spanish">Spanish (Español)</option>
                  <option value="french">French (Français)</option>
                  <option value="german">German (Deutsch)</option>
                  <option value="japanese">Japanese (日本語)</option>
                  <option value="korean">Korean (한국어)</option>
                </select>
              </div>

              {/* Expressive Delivery Style / Emotion */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-wider text-fuchsia-300">
                    Expressive Human Emotion & Performance
                  </label>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {EMOTION_STYLES.map((emo) => (
                    <button
                      key={emo.id}
                      type="button"
                      onClick={() => setSelectedEmotion(emo.id)}
                      className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                        selectedEmotion === emo.id
                          ? 'border-fuchsia-500 bg-fuchsia-600/20 text-white shadow-sm'
                          : 'border-[#2a2a38] bg-[#0c0c10] text-gray-400 hover:text-white hover:bg-[#16161f]'
                      }`}
                    >
                      <span className="text-xs font-bold leading-tight flex items-center gap-1">
                        <span>{emo.emoji}</span>
                        <span className="truncate">{emo.name.split(' ')[0]}</span>
                      </span>
                      <span className="text-[9px] text-gray-500 truncate">{emo.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Catalog Selector with Filter & Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-wider text-fuchsia-300">
                    AI Voice Library ({filteredVoices.length} Voices)
                  </label>
                  <div className="flex items-center gap-1">
                    {(['all', 'male', 'female'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGenderFilter(g)}
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                          genderFilter === g ? 'bg-fuchsia-600 text-white' : 'bg-[#181822] text-gray-400 hover:text-white'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={voiceSearch}
                    onChange={(e) => setVoiceSearch(e.target.value)}
                    placeholder="Search voice by tone, style, or name..."
                    className="w-full bg-[#0a0a0e] border border-[#2c2c3a] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500"
                  />
                </div>

                {/* Voice Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {filteredVoices.map((voice) => {
                    const isSelected = selectedVoiceId === voice.id;
                    const isPlayingSample = previewingVoiceId === voice.id;

                    return (
                      <div
                        key={voice.id}
                        onClick={() => setSelectedVoiceId(voice.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'border-fuchsia-500 bg-fuchsia-600/25 ring-1 ring-fuchsia-500/50'
                            : 'border-[#22222e] bg-[#0d0d12] hover:bg-[#161620]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-[#1a1a24] flex items-center justify-center text-sm shrink-0 border border-[#2e2e3e]">
                            {voice.emoji}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white truncate">
                                {voice.name.split(' ')[0]}
                              </span>
                              <span className="text-[9px] uppercase font-mono text-gray-400 bg-[#1e1e28] px-1.5 py-0.2 rounded">
                                {voice.gender}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 truncate">
                              {voice.tags.join(' • ')}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handlePreviewVoice(voice, e)}
                          title="Play Voice Preview"
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                            isPlayingSample
                              ? 'bg-fuchsia-500 text-white border-fuchsia-400 animate-pulse'
                              : 'bg-[#181824] text-gray-400 hover:text-white hover:bg-fuchsia-600/30 border-[#2e2e3e]'
                          }`}
                        >
                          {isPlayingSample ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Toggles: Fillers & Duration Fitting */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-2 text-[10px] font-bold text-gray-300 bg-[#0a0a0f] p-2 rounded-xl border border-[#222230] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={naturalFillers}
                    onChange={(e) => setNaturalFillers(e.target.checked)}
                    className="rounded border-gray-700 text-fuchsia-600 focus:ring-fuchsia-500"
                  />
                  <span>Natural Breaths & Fillers</span>
                </label>

                <label className="flex items-center gap-2 text-[10px] font-bold text-gray-300 bg-[#0a0a0f] p-2 rounded-xl border border-[#222230] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fitDuration}
                    onChange={(e) => setFitDuration(e.target.checked)}
                    className="rounded border-gray-700 text-fuchsia-600 focus:ring-fuchsia-500"
                  />
                  <span>Fit Original Media Duration</span>
                </label>
              </div>

            </div>
          )}
        </div>

        {/* Hot Words Highlight Selection */}
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-2.5">
            <Zap className="w-4 h-4 text-fuchsia-500" />
            <h3 className="text-[13px] font-black uppercase tracking-wider text-white">
              Hot Words Emphasis
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setEnableHotwords(true)}
              className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                enableHotwords
                  ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-md ring-1 ring-fuchsia-500/50'
                  : 'border-[#2c2c2c] bg-[#161616] hover:bg-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase text-white">Hot Words 🔥</span>
                {enableHotwords && <Check className="w-3.5 h-3.5 text-fuchsia-400" />}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Highlight slang & brand names with dynamic glow.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setEnableHotwords(false)}
              className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                !enableHotwords
                  ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-md ring-1 ring-fuchsia-500/50'
                  : 'border-[#2c2c2c] bg-[#161616] hover:bg-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase text-white">Standard 🚫</span>
                {!enableHotwords && <Check className="w-3.5 h-3.5 text-fuchsia-400" />}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Uniform subtitle display without word highlighting.
              </p>
            </button>
          </div>
        </div>

        {/* Emojis Option Selection */}
        <div className="pt-2 border-t border-[#222]">
          <div className="flex items-center gap-2 mb-2.5">
            <Smile className="w-4 h-4 text-fuchsia-500" />
            <h3 className="text-[13px] font-black uppercase tracking-wider text-white">
              AI Expressive Emojis
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setUseEmojis(true)}
              className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                useEmojis 
                  ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-md ring-1 ring-fuchsia-500/50' 
                  : 'border-[#2c2c2c] bg-[#161616] hover:bg-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase text-white">With Emojis 🔥</span>
                {useEmojis && <Check className="w-3.5 h-3.5 text-fuchsia-400" />}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Auto-attach matching emojis to emotional words.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setUseEmojis(false)}
              className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                !useEmojis 
                  ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-md ring-1 ring-fuchsia-500/50' 
                  : 'border-[#2c2c2c] bg-[#161616] hover:bg-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase text-white">Text Only 🚫</span>
                {!useEmojis && <Check className="w-3.5 h-3.5 text-fuchsia-400" />}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Clean text without auto-generated emojis.
              </p>
            </button>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="p-4 sm:p-5 bg-[#0E0E0E] border-t border-[#252525] shrink-0 flex flex-col gap-3">
        {extractionStatus && (
          <div className="flex items-center justify-between bg-[#161616] border border-[#222] px-3.5 py-2 rounded-xl text-[10px] font-mono text-[#aaa]">
            <div className="flex items-center gap-2 truncate">
              {extractedAudioBlob ? (
                <span className="w-2 h-2 rounded-full shrink-0 bg-green-500" />
              ) : (
                <span className="w-2 h-2 rounded-full shrink-0 bg-fuchsia-500 animate-pulse" />
              )}
              <span className="truncate font-bold uppercase tracking-wider text-[#bbb]">{extractionStatus}</span>
            </div>
            <span className="text-fuchsia-400 font-bold shrink-0 ml-2">
              {selectedFile.type.startsWith('audio/') ? 'AUDIO' : 'VIDEO'}
            </span>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={isProcessing}
          className="w-full py-3.5 px-6 bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-full font-black text-[15px] uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-lg shadow-fuchsia-600/20 disabled:opacity-50 cursor-pointer border-none active:scale-[0.99]"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              AI Pipeline is executing...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 animate-pulse" />
              ✨ Generate Captions & AI Dubbing
            </>
          )}
        </button>
      </div>
    </div>
  );
}
