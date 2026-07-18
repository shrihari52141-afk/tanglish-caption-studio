import React, { useRef, useState, useEffect } from 'react';
import { Upload, Loader2, Sparkles, Languages, Smile, ChevronLeft, Check, Video } from 'lucide-react';
import { extractAudioTrack } from '../utils/audioExtractor';

interface VideoUploaderProps {
  onUpload: (
    file: File, 
    language: string, 
    useEmojis: boolean, 
    translationMode: string, 
    usePunctuation: boolean,
    emojiStyle: 'none' | 'emotions' | 'vibes' | 'objects' | 'energetic' | 'minimal' | 'custom' | 'auto',
    preExtractedAudioBlob?: Blob | null
  ) => void;
  isProcessing: boolean;
  initialFile?: File | null;
}

const LANGUAGES = [
  { id: 'tamil', name: 'Tamil', desc: 'Select options after selecting this language', script: 'e.g. Tamil to Tanglish or Tamil to English' },
  { id: 'hindi', name: 'Hindi', desc: 'Select options after selecting this language', script: 'e.g. Hinglish or Hindi to English' },
  { id: 'telugu', name: 'Telugu', desc: 'Select options after selecting this language', script: 'e.g. Telugish or Telugu to English' },
  { id: 'kannada', name: 'Kannada', desc: 'Select options after selecting this language', script: 'e.g. Kannadish or Kannada to English' },
  { id: 'malayalam', name: 'Malayalam', desc: 'Select options after selecting this language', script: 'e.g. Manglish or Malayalam to English' },
  { id: 'english', name: 'English', desc: 'Standard English subtitles', script: 'e.g. Awesome!' },
  { id: 'spanish', name: 'Spanish', desc: 'Select options after selecting this language', script: 'e.g. Spanish or Spanish to English' },
  { id: 'italian', name: 'Italian', desc: 'Select options after selecting this language', script: 'e.g. Italian or Italian to English' },
  { id: 'auto', name: 'Auto-Detect', desc: 'Detects audio automatically with English script', script: 'Translates non-English to English alphabets' },
];

export default function VideoUploader({ onUpload, isProcessing, initialFile }: VideoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile || null);

  useEffect(() => {
    if (initialFile) {
      setSelectedFile(initialFile);
    }
  }, [initialFile]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    return localStorage.getItem('saved_selectedLanguage') || 'tamil';
  });
  const [translationMode, setTranslationMode] = useState<string>(() => {
    return localStorage.getItem('saved_translationMode') || 'translate_english';
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

  const [showEmojiModal, setShowEmojiModal] = useState<boolean>(false);
  const [extractedAudioBlob, setExtractedAudioBlob] = useState<Blob | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (selectedFile) {
      const startBackgroundExtraction = async (file: File) => {
        setExtractedAudioBlob(null);
        setExtractionStatus('Initializing background audio extractor...');
        try {
          const blob = await extractAudioTrack(file, (msg) => {
            if (active) {
              setExtractionStatus(`Background audio extraction: ${msg}`);
            }
          });
          if (active) {
            setExtractedAudioBlob(blob);
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
      onUpload(selectedFile, selectedLanguage, useEmojis, translationMode, usePunctuation, emojiStyle, extractedAudioBlob);
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
          <ChevronLeft className="w-4 h-4" /> Change Video
        </button>
        <div className="flex items-center gap-2 max-w-[280px]">
          <Video className="w-4 h-4 text-fuchsia-500 shrink-0" />
          <span className="text-[12px] font-bold text-white truncate uppercase tracking-tight">
            {selectedFile.name}
          </span>
        </div>
      </div>

      {/* Scrollable middle section for options */}
      <div style={{ marginTop: '-14px' }} className="flex-1 p-5 sm:p-6 space-y-6 overflow-y-auto custom-scrollbar">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Languages className="w-5 h-5 text-fuchsia-500" />
            <h3 className="text-[14px] font-black uppercase tracking-wider text-white">
              What's your original video language?
            </h3>
          </div>
          <p className="text-[11px] text-[#888888] uppercase font-bold mb-4 tracking-wide">
            Select a language from the list below. AI will transcribe or translate with conversion to English/Roman alphabets.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1.5 custom-scrollbar">
            {LANGUAGES.map((lang) => {
              const isSelected = selectedLanguage === lang.id;
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setSelectedLanguage(lang.id)}
                  className={`p-4 rounded-xl text-left border-2 transition-all flex flex-col gap-1 cursor-pointer ${
                    isSelected 
                      ? 'border-fuchsia-600 bg-fuchsia-600/10 shadow-md' 
                      : 'border-[#2c2c2c] bg-[#1d1d1d] hover:bg-[#252525]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-black uppercase tracking-tight text-white">
                      {lang.name}
                    </span>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-fuchsia-600 flex items-center justify-center text-white">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#888888] font-semibold leading-tight">
                    {lang.desc}
                  </span>
                  <span className="text-[10px] text-fuchsia-400 font-mono mt-0.5">
                    {lang.script}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Translation & Script Mode Selection */}
        {['auto', 'tamil', 'hindi', 'telugu', 'kannada', 'malayalam', 'spanish', 'italian'].includes(selectedLanguage) && (
          <div className="pt-4 border-t border-[#252525] animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <Languages className="w-5 h-5 text-fuchsia-500" />
              <h3 className="text-[14px] font-black uppercase tracking-wider text-white">
                Choose Subtitle Style & Translation
              </h3>
            </div>
            <p className="text-[11px] text-[#888888] uppercase font-bold mb-4 tracking-wide">
              Customize how the subtitles are translated or romanized.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTranslationMode('transliterate')}
                className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                  translationMode === 'transliterate'
                    ? 'border-fuchsia-600 bg-fuchsia-600/10 shadow-md'
                    : 'border-[#2c2c2c] bg-[#1d1d1d] hover:bg-[#252525]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black uppercase text-white">
                    {selectedLanguage === 'auto'
                      ? 'Auto-Detect to Roman Script'
                      : ['spanish', 'italian'].includes(selectedLanguage)
                      ? `Original ${selectedLanguage.toUpperCase()}`
                      : `${selectedLanguage.toUpperCase()} to Roman Script`}
                  </span>
                  {translationMode === 'transliterate' && (
                    <span className="w-5 h-5 rounded-full bg-fuchsia-600 flex items-center justify-center text-white">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                  {selectedLanguage === 'auto'
                    ? 'Detect language and convert regional speech into English letters (Romanized, e.g., Tanglish/Hinglish)'
                    : ['spanish', 'italian'].includes(selectedLanguage) 
                    ? `Provide standard ${selectedLanguage} subtitles in Roman letters`
                    : `Convert spoken ${selectedLanguage} into English letters (Romanized, e.g. Tanglish)`}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTranslationMode('translate_english')}
                className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                  translationMode === 'translate_english'
                    ? 'border-fuchsia-600 bg-fuchsia-600/10 shadow-md'
                    : 'border-[#2c2c2c] bg-[#1d1d1d] hover:bg-[#252525]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black uppercase text-white">
                    {selectedLanguage === 'auto'
                      ? 'Auto-Detect to English Text'
                      : `${selectedLanguage.toUpperCase()} to English Text`}
                  </span>
                  {translationMode === 'translate_english' && (
                    <span className="w-5 h-5 rounded-full bg-fuchsia-600 flex items-center justify-center text-white">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                  {selectedLanguage === 'auto'
                    ? 'Detect language, translate non-English speech and output subtitles in proper English text.'
                    : `Translate the spoken ${selectedLanguage} audio and output subtitles in proper English text.`}
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Emojis Option Selection */}
        <div className="pt-4 border-t border-[#252525]">
          <div className="flex items-center gap-2 mb-3">
            <Smile className="w-5 h-5 text-fuchsia-500" />
            <h3 className="text-[14px] font-black uppercase tracking-wider text-white">
              AI Expressive Emojis
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setUseEmojis(true)}
              className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                useEmojis 
                  ? 'border-fuchsia-600 bg-fuchsia-600/10 shadow-md' 
                  : 'border-[#2c2c2c] bg-[#1d1d1d] hover:bg-[#252525]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-black uppercase text-white flex items-center gap-1.5">
                  With Emojis 🔥
                </span>
                {useEmojis && (
                  <span className="w-5 h-5 rounded-full bg-fuchsia-600 flex items-center justify-center text-white">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                AI adds relevant visual emojis on key adjectives & emotion words.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setUseEmojis(false)}
              className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                !useEmojis 
                  ? 'border-fuchsia-600 bg-fuchsia-600/10 shadow-md' 
                  : 'border-[#2c2c2c] bg-[#1d1d1d] hover:bg-[#252525]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-black uppercase text-white flex items-center gap-1.5">
                  Plain Text 🚫
                </span>
                {!useEmojis && (
                  <span className="w-5 h-5 rounded-full bg-fuchsia-600 flex items-center justify-center text-white">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Clean and minimal subtitle words without any auto-generated symbols.
              </p>
            </button>
            {useEmojis && (
              <div 
                className="col-span-2 mt-3 bg-[#111] p-4 rounded-xl border border-[#222] space-y-2.5 animate-fade-in"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#aaa]">
                    Emoji Theme Preset
                  </span>
                  <span className="text-[9px] text-fuchsia-400 font-bold bg-fuchsia-500/10 px-2 py-0.5 rounded-full uppercase">
                    AI Auto-Fit Available
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
                            ? 'border-fuchsia-600 bg-fuchsia-600/15 shadow-sm text-fuchsia-400 font-black' 
                            : 'border-[#222] bg-[#0A0A0A] text-zinc-400 hover:text-white hover:bg-[#151515]'
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
        <div className="pt-4 border-t border-[#252525]">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-fuchsia-500" />
            <h3 className="text-[14px] font-black uppercase tracking-wider text-white">
              AI Smart Punctuation
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setUsePunctuation(true)}
              className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                usePunctuation 
                  ? 'border-fuchsia-600 bg-fuchsia-600/10 shadow-md' 
                  : 'border-[#2c2c2c] bg-[#1d1d1d] hover:bg-[#252525]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-black uppercase text-white flex items-center gap-1.5">
                  With Punctuation ✍️
                </span>
                {usePunctuation && (
                  <span className="w-5 h-5 rounded-full bg-fuchsia-600 flex items-center justify-center text-white">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Include normal commas, periods, exclamation, and question marks.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setUsePunctuation(false)}
              className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-1 cursor-pointer ${
                !usePunctuation 
                  ? 'border-fuchsia-600 bg-fuchsia-600/10 shadow-md' 
                  : 'border-[#2c2c2c] bg-[#1d1d1d] hover:bg-[#252525]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-black uppercase text-white flex items-center gap-1.5">
                  No Punctuation 🚫
                </span>
                {!usePunctuation && (
                  <span className="w-5 h-5 rounded-full bg-fuchsia-600 flex items-center justify-center text-white">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#888888] font-semibold leading-normal">
                Clean words with all commas, periods, and questions stripped.
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* Footer containing Background Extraction status and Generate Button (shrink-0) */}
      <div style={{ marginTop: '1px', paddingTop: '4px' }} className="p-4 sm:p-5 bg-[#0E0E0E] border-t border-[#252525] shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-center gap-2 bg-[#161616] border border-[#222] px-3.5 py-2.5 rounded-xl text-[11px] font-mono text-[#aaa]">
          <span className="w-2 h-2 rounded-full shrink-0 bg-red-500 animate-pulse" />
          <span className="truncate font-bold uppercase tracking-wider text-[#aaa]">made by Batman ❤️</span>
        </div>

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
