import React, { useRef, useState, useEffect } from 'react';
import { Upload, Loader2, Sparkles, Languages, Smile, ChevronLeft, Check, Video, FileAudio } from 'lucide-react';
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
      <div style={{ marginTop: '-14px' }} className="flex-1 p-5 sm:p-6 space-y-6 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#111] p-4 rounded-xl border border-[#222]">
          {/* Source Language */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-[#aaa] flex items-center gap-1.5">
              🎙️ Source Language
            </label>
            <div className="relative">
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-[#0A0A0A] border border-[#333] rounded-xl text-white text-sm font-bold px-3 py-2.5 w-full focus:outline-none focus:border-fuchsia-600 appearance-none cursor-pointer"
              >
                <option value="auto">Auto Detect</option>
                <option value="tamil">Tamil</option>
                <option value="hindi">Hindi</option>
                <option value="english">English</option>
                <option value="kannada">Kannada</option>
                <option value="telugu">Telugu</option>
                <option value="malayalam">Malayalam</option>
                <option value="bengali">Bengali</option>
                <option value="marathi">Marathi</option>
                <option value="gujarati">Gujarati</option>
                <option value="punjabi">Punjabi</option>
                <option value="odia">Odia</option>
                <option value="assamese">Assamese</option>
                <option value="urdu">Urdu</option>
                <option value="sanskrit">Sanskrit</option>
                <option value="korean">Korean</option>
                <option value="japanese">Japanese</option>
                <option value="chinese">Chinese (Mandarin)</option>
                <option value="cantonese">Chinese (Cantonese)</option>
                <option value="spanish">Spanish</option>
                <option value="french">French</option>
                <option value="german">German</option>
                <option value="portuguese">Portuguese</option>
                <option value="italian">Italian</option>
                <option value="russian">Russian</option>
                <option value="arabic">Arabic</option>
                <option value="turkish">Turkish</option>
                <option value="thai">Thai</option>
                <option value="vietnamese">Vietnamese</option>
                <option value="indonesian">Indonesian</option>
                <option value="malay">Malay</option>
                <option value="dutch">Dutch</option>
                <option value="polish">Polish</option>
                <option value="romanian">Romanian</option>
                <option value="czech">Czech</option>
                <option value="swedish">Swedish</option>
                <option value="norwegian">Norwegian</option>
                <option value="danish">Danish</option>
                <option value="finnish">Finnish</option>
                <option value="greek">Greek</option>
                <option value="hebrew">Hebrew</option>
                <option value="persian">Persian</option>
                <option value="swahili">Swahili</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-fuchsia-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Translation Mode */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-[#aaa] flex items-center gap-1.5">
              🌐 Translate To
            </label>
            <div className="relative">
              <select
                value={translationMode}
                onChange={(e) => setTranslationMode(e.target.value)}
                className="bg-[#0A0A0A] border border-[#333] rounded-xl text-white text-sm font-bold px-3 py-2.5 w-full focus:outline-none focus:border-fuchsia-600 appearance-none cursor-pointer"
              >
                <option value="transliterate">Keep Original</option>
                <option value="translate_english">Translate to English</option>
                <option value="translate_tamil">Translate to Tamil</option>
                <option value="translate_hindi">Translate to Hindi</option>
                <option value="translate_kannada">Translate to Kannada</option>
                <option value="translate_telugu">Translate to Telugu</option>
                <option value="translate_malayalam">Translate to Malayalam</option>
                <option value="translate_spanish">Translate to Spanish</option>
                <option value="translate_french">Translate to French</option>
                <option value="translate_german">Translate to German</option>
                <option value="translate_portuguese">Translate to Portuguese</option>
                <option value="translate_italian">Translate to Italian</option>
                <option value="translate_russian">Translate to Russian</option>
                <option value="translate_arabic">Translate to Arabic</option>
                <option value="translate_japanese">Translate to Japanese</option>
                <option value="translate_korean">Translate to Korean</option>
                <option value="translate_chinese">Translate to Chinese</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-fuchsia-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

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
