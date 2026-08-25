import React, { useRef, useState, useEffect } from 'react';
import { Upload, Loader2, Sparkles, Languages, Smile, ChevronLeft, Check, Video, FileAudio, Zap } from 'lucide-react';
import { extractAudioTrack } from '../utils/audioExtractor';

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
    preExtractedAudioBlob?: Blob | null
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

  const [showEmojiModal, setShowEmojiModal] = useState<boolean>(false);
  const [extractedAudioBlob, setExtractedAudioBlob] = useState<Blob | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const [extractedAudioSize, setExtractedAudioSize] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (selectedFile) {
      const startBackgroundExtraction = async (file: File) => {
      setExtractedAudioBlob(null);
      setExtractedAudioSize('');
      setExtractionStatus('Initializing background audio extractor...');
        try {
          const blob = await extractAudioTrack(file, (msg) => {
            if (active) {
              setExtractionStatus(`Background audio extraction: ${msg}`);
            }
          });
          if (active) {
            setExtractedAudioBlob(blob);
            setExtractedAudioSize(formatFileSize(blob.size));
            setExtractionStatus('Audio pre-extracted successfully! Ready to generate. ✨');
          }
        } catch (err) {
          console.warn("Background audio extraction failed, will upload original file.", err);
          if (active) {
            setExtractionStatus('Background extraction failed, using original file as fallback.');
          }
        }
      };

      startBackgroundExtraction(selectedFile);
    } else {
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

  const handleGenerate = () => {
    if (selectedFile) {
      onUpload(selectedFile, selectedLanguage, useEmojis, translationMode, usePunctuation, emojiStyle, enableHotwords, extractedAudioBlob);
    }
  };

  // Step 1: Select Video
  if (!selectedFile) {
    return (
      <div 
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="w-full max-w-xl mx-auto p-5 sm:p-10 bg-[#161616] border-2 border-dashed border-[#333] hover:border-fuchsia-600 rounded-3xl flex flex-col items-center justify-center gap-6 sm:gap-8 transition-all group cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-fuchsia-600/10 flex items-center justify-center border border-fuchsia-600/30 group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8 text-fuchsia-500" />
          </div>
          <h2 className="text-[26px] font-black tracking-tight text-white uppercase mt-4">
            Import Video or Audio
          </h2>
          <p className="text-[#888888] text-[13px] font-extrabold uppercase tracking-widest max-w-md leading-relaxed">
            Drag & drop or click to select a file <br/>
            <span className="text-fuchsia-500/80">(Supports MP4, MOV, WEBM, MP3, WAV, M4A)</span>
          </p>
        </div>

        <button
          type="button"
          className="py-4 px-8 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-full font-black text-[15px] uppercase tracking-wide flex items-center justify-center gap-3 transition-colors border-none shadow-lg shadow-fuchsia-600/20"
        >
          <Video className="w-5 h-5" /> Select File
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

  // Step 2: Choose subtitle languages and AI option list
  return (
    <div style={{ marginTop: '-31px' }} className="w-full max-w-2xl mx-auto bg-[#161616] border border-[#333] rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[min(740px,calc(100vh-120px))]">
      {/* Header with selected file name info (shrink-0) */}
      <div style={{ marginLeft: '0px', marginTop: '-6px' }} className="p-4 sm:p-5 bg-[#0E0E0E] border-b border-[#252525] flex items-center justify-between shrink-0">
        <button 
          onClick={() => setSelectedFile(null)}
          className="flex items-center gap-1 text-[11px] font-black uppercase text-[#888888] hover:text-white transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Replace Video
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
          <span className="text-[10px] font-mono text-fuchsia-400/70 shrink-0">
            {formatFileSize(selectedFile.size)}
          </span>
        </div>
      </div>
      {/* Scrollable middle section for options */}
      <div className="flex-1 p-4 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
        {/* Source Language & Target Output Script Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#141414] p-4 rounded-2xl border border-[#2a2a2a] shadow-inner">
          {/* Source Language */}
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
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-fuchsia-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Translation Mode */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-fuchsia-400 flex items-center gap-1.5">
              🌐 Output Script & Language
            </label>
            <div className="relative">
              <select
                value={translationMode}
                onChange={(e) => setTranslationMode(e.target.value)}
                className="bg-[#0A0A0A] border border-[#3a3a3a] hover:border-fuchsia-500 rounded-xl text-white text-xs font-bold px-3 py-2.5 w-full focus:outline-none focus:border-fuchsia-500 appearance-none cursor-pointer transition-colors"
              >
                <option value="auto_roman">
                  🔤 Roman Script (Tanglish / Hinglish in English Script) ✨
                </option>
                <option value="translate_english">
                  🇬🇧 Translate to English (Netflix / BBC Quality)
                </option>
                <option value="keep_script">
                  🇮🇳 Keep Original Native Script (தமிழ், हिन्दी, etc.)
                </option>
                <option value="translate_tamil">🇮🇳 Translate to Tamil (தமிழ்)</option>
                <option value="translate_hindi">🇮🇳 Translate to Hindi (हिन्दी)</option>
                <option value="translate_kannada">🇮🇳 Translate to Kannada (ಕನ್ನಡ)</option>
                <option value="translate_telugu">🇮🇳 Translate to Telugu (తెలుగు)</option>
                <option value="translate_malayalam">🇮🇳 Translate to Malayalam (മലയാളം)</option>
                <option value="translate_spanish">🇪🇸 Translate to Spanish (Español)</option>
                <option value="translate_french">🇫🇷 Translate to French (Français)</option>
                <option value="translate_german">🇩🇪 Translate to German (Deutsch)</option>
                <option value="translate_japanese">🇯🇵 Translate to Japanese (日本語)</option>
                <option value="translate_korean">🇰🇷 Translate to Korean (한국어)</option>
                <option value="translate_chinese">🇨🇳 Translate to Chinese (中文)</option>
                <option value="translate_arabic">🇸🇦 Translate to Arabic (العربية)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-fuchsia-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
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
              className={`p-3.5 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                enableHotwords
                  ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-md ring-1 ring-fuchsia-500/50'
                  : 'border-[#2c2c2c] bg-[#161616] hover:bg-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase text-white flex items-center gap-1.5">
                  Hot Words 🔥
                </span>
                {enableHotwords && (
                  <span className="w-4 h-4 rounded-full bg-fuchsia-600 flex items-center justify-center text-white text-[10px]">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Highlight slang, brand names & emotional words with gold glow.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setEnableHotwords(false)}
              className={`p-3.5 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                !enableHotwords
                  ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-md ring-1 ring-fuchsia-500/50'
                  : 'border-[#2c2c2c] bg-[#161616] hover:bg-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase text-white flex items-center gap-1.5">
                  Standard 🚫
                </span>
                {!enableHotwords && (
                  <span className="w-4 h-4 rounded-full bg-fuchsia-600 flex items-center justify-center text-white text-[10px]">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Standard subtitle display with uniform word highlighting.
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
              className={`p-3.5 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                useEmojis 
                  ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-md ring-1 ring-fuchsia-500/50' 
                  : 'border-[#2c2c2c] bg-[#161616] hover:bg-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase text-white flex items-center gap-1.5">
                  With Emojis 🔥
                </span>
                {useEmojis && (
                  <span className="w-4 h-4 rounded-full bg-fuchsia-600 flex items-center justify-center text-white text-[10px]">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                AI attaches matching high-impact emojis to emotional keywords.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setUseEmojis(false)}
              className={`p-3.5 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                !useEmojis 
                  ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-md ring-1 ring-fuchsia-500/50' 
                  : 'border-[#2c2c2c] bg-[#161616] hover:bg-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase text-white flex items-center gap-1.5">
                  Text Only 🚫
                </span>
                {!useEmojis && (
                  <span className="w-4 h-4 rounded-full bg-fuchsia-600 flex items-center justify-center text-white text-[10px]">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Clean text without auto-generated emojis.
              </p>
            </button>

            {useEmojis && (
              <div className="col-span-2 mt-2 bg-[#121212] p-3.5 rounded-xl border border-[#2a2a2a] space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Emoji Theme Preset
                  </span>
                  <span className="text-[9px] text-fuchsia-400 font-bold bg-fuchsia-500/10 px-2 py-0.5 rounded-full uppercase">
                    AI Auto-Synced
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { id: 'auto', name: 'Smart Auto 🤖' },
                    { id: 'vibes', name: 'Hype Vibes 🔥' },
                    { id: 'emotions', name: 'Feelings 🤩' },
                    { id: 'objects', name: 'Objects 🎬' },
                    { id: 'energetic', name: 'Beast 🦾' },
                    { id: 'minimal', name: 'Minimal 👾' },
                    { id: 'custom', name: 'Magical 💖' },
                  ].map((stylePreset) => {
                    const isSel = emojiStyle === stylePreset.id;
                    return (
                      <button
                        key={stylePreset.id}
                        type="button"
                        onClick={() => setEmojiStyle(stylePreset.id as any)}
                        className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          isSel 
                            ? 'border-fuchsia-600 bg-fuchsia-600/20 shadow-sm text-fuchsia-300 font-black' 
                            : 'border-[#2a2a2a] bg-[#0A0A0A] text-zinc-400 hover:text-white hover:bg-[#181818]'
                        }`}
                      >
                        <span className="text-[11px] font-bold leading-none">{stylePreset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Punctuation Selection */}
        <div className="pt-2 border-t border-[#222]">
          <div className="flex items-center gap-2 mb-2.5">
            <Sparkles className="w-4 h-4 text-fuchsia-500" />
            <h3 className="text-[13px] font-black uppercase tracking-wider text-white">
              AI Smart Punctuation
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setUsePunctuation(true)}
              className={`p-3.5 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                usePunctuation 
                  ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-md ring-1 ring-fuchsia-500/50' 
                  : 'border-[#2c2c2c] bg-[#161616] hover:bg-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase text-white flex items-center gap-1.5">
                  With Punctuation ✍️
                </span>
                {usePunctuation && (
                  <span className="w-4 h-4 rounded-full bg-fuchsia-600 flex items-center justify-center text-white text-[10px]">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Include natural commas, question marks, and full stops.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setUsePunctuation(false)}
              className={`p-3.5 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                !usePunctuation 
                  ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-md ring-1 ring-fuchsia-500/50' 
                  : 'border-[#2c2c2c] bg-[#161616] hover:bg-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase text-white flex items-center gap-1.5">
                  No Punctuation 🚫
                </span>
                {!usePunctuation && (
                  <span className="w-4 h-4 rounded-full bg-fuchsia-600 flex items-center justify-center text-white text-[10px]">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Clean words with all punctuation marks stripped.
              </p>
            </button>
          </div>
        </div>
      </div>

        {/* Footer containing Background Extraction status and Generate Button (shrink-0) */}
      <div style={{ marginTop: '1px', paddingTop: '4px' }} className="p-4 sm:p-5 bg-[#0E0E0E] border-t border-[#252525] shrink-0 flex flex-col gap-3">
        {extractionStatus && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2 bg-[#161616] border border-[#222] px-3.5 py-2.5 rounded-xl text-[10px] font-mono text-[#aaa]">
              {extractedAudioBlob ? (
                <span className="w-2 h-2 rounded-full shrink-0 bg-green-500" />
              ) : (
                <span className="w-2 h-2 rounded-full shrink-0 bg-red-500 animate-pulse" />
              )}
              <span className="truncate font-bold uppercase tracking-wider text-[#aaa]">{extractionStatus}</span>
            </div>
            <div className="flex items-center justify-center gap-4 text-[10px] font-mono">
              <span className="flex items-center gap-1.5 text-[#888]">
                <Video className="w-3 h-3 text-fuchsia-500" />
                <span className="text-white font-bold">{formatFileSize(selectedFile.size)}</span>
                <span className="uppercase">Video</span>
              </span>
              {extractedAudioBlob && (
                <span className="flex items-center gap-1.5 text-[#888]">
                  <FileAudio className="w-3 h-3 text-green-500" />
                  <span className="text-green-400 font-bold">{extractedAudioSize}</span>
                  <span className="uppercase">Audio</span>
                </span>
              )}
            </div>
          </div>
        )}
        {!extractionStatus && (
          <div className="flex items-center justify-center gap-2 bg-[#161616] border border-[#222] px-3.5 py-2.5 rounded-xl text-[11px] font-mono text-[#aaa]">
            <span className="w-2 h-2 rounded-full shrink-0 bg-red-500 animate-pulse" />
            <span className="truncate font-bold uppercase tracking-wider text-[#aaa]">made by Batman ❤️</span>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={isProcessing}
          style={{ marginTop: '-7px' }}
          className="w-full py-3.5 px-6 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white rounded-full font-black text-[15px] uppercase tracking-wider flex items-center justify-center gap-3 transition-colors shadow-lg disabled:opacity-50 cursor-pointer border-none"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              AI Subtitle Generation is running...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 animate-pulse" />
              ✨ Generate Subtitles with AI
            </>
          )}
        </button>
      </div>
    </div>
  );
}
