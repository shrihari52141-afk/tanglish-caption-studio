import React, { useState, Component, ErrorInfo, ReactNode } from 'react';
import { CaptionWord, SubtitleStyleSettings, DubbingSettings, DubbingVoice } from '../types';
import { PRESETS, STYLE_CATEGORIES } from '../data/presets';
import { DUBBING_VOICES, EMOTION_STYLES } from '../data/voices';
import { 
  Sparkles, 
  Type, 
  CaseSensitive, 
  AlignCenter, 
  AlignLeft, 
  AlignRight, 
  Sliders, 
  Edit3, 
  Check, 
  Play, 
  Square,
  Hash, 
  Smile, 
  RotateCcw, 
  ZoomIn, 
  Volume2, 
  Languages, 
  Search, 
  RefreshCw, 
  Loader2,
  Mic
} from 'lucide-react';
import { exportToSRT, exportToVTT, exportToASS, triggerDownload } from '../utils/subtitleExporter';
import { stripASSTags } from '../utils/captionFormatter';
import { ensureRomanScript } from '../utils/indicTransliterate';
import PresetPreview from './PresetPreview';

interface EditorPanelProps {
  styleSettings: SubtitleStyleSettings;
  onUpdateStyleSettings: (settings: Partial<SubtitleStyleSettings>) => void;
  words: CaptionWord[];
  currentTime: number;
  onUpdateWordText: (id: string, text: string) => void;
  onSeek: (time: number) => void;
  onUpdateWords?: (words: CaptionWord[]) => void;
  dubbingSettings?: DubbingSettings;
  onUpdateDubbingSettings?: (settings: Partial<DubbingSettings>) => void;
  onReDub?: (settings: DubbingSettings) => void;
  isReDubbing?: boolean;
  activeTab?: 'presets' | 'decorations' | 'transcript' | 'dubbing';
  onActiveTabChange?: (tab: 'presets' | 'decorations' | 'transcript' | 'dubbing') => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class EditorErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[EditorPanel Error Caught]:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full bg-[#161616] p-6 text-white flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xl font-bold">
            ⚠️
          </div>
          <h3 className="text-base font-black uppercase tracking-wider text-red-400">Editor Auto-Recovered</h3>
          <p className="text-xs text-gray-400 max-w-xs">
            A temporary render error occurred in the editor panel.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-black uppercase rounded-lg transition-colors cursor-pointer"
          >
            Reload Editor
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function EditorPanelContent({ 
  styleSettings, 
  onUpdateStyleSettings, 
  words = [], 
  currentTime = 0,
  onUpdateWordText,
  onSeek,
  onUpdateWords,
  dubbingSettings,
  onUpdateDubbingSettings,
  onReDub,
  isReDubbing = false,
  activeTab: controlledActiveTab,
  onActiveTabChange
}: EditorPanelProps) {
  const safeSettings: SubtitleStyleSettings = {
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
    ...(styleSettings || {})
  };

  const safeDubbing: DubbingSettings = {
    enabled: false,
    targetLanguage: 'english',
    voiceId: 'gemini-puck',
    emotion: 'natural',
    speechRate: 1.0,
    speechPitch: 1.0,
    naturalFillers: true,
    fitOriginalDuration: true,
    ...(dubbingSettings || {})
  };

  const [localActiveTab, setLocalActiveTab] = useState<'presets' | 'decorations' | 'transcript' | 'dubbing'>('presets');
  
  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : localActiveTab;
  const setActiveTab = (tab: 'presets' | 'decorations' | 'transcript' | 'dubbing') => {
    if (onActiveTabChange) {
      onActiveTabChange(tab);
    } else {
      setLocalActiveTab(tab);
    }
  };

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // States for sentence and word editing
  const [editingSentenceId, setEditingSentenceId] = useState<string | null>(null);
  const [editingSentenceText, setEditingSentenceText] = useState("");
  
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editingWordText, setEditingWordText] = useState("");
  
  // Bulk selection and editing states
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());

  // Dubbing tab states
  const [voiceSearch, setVoiceSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  const handleBulkDelete = () => {
    if (!onUpdateWords) return;
    const filtered = (words || []).filter(w => !selectedWordIds.has(w.id));
    onUpdateWords(filtered);
    setSelectedWordIds(new Set());
  };

  const handleBulkCapitalize = (mode: 'upper' | 'lower' | 'capitalize') => {
    if (!onUpdateWords) return;
    const updated = (words || []).map(w => {
      if (selectedWordIds.has(w.id)) {
        let newWord = w.word;
        if (mode === 'upper') {
          newWord = w.word.toUpperCase();
        } else if (mode === 'lower') {
          newWord = w.word.toLowerCase();
        } else if (mode === 'capitalize') {
          newWord = w.word.charAt(0).toUpperCase() + w.word.slice(1).toLowerCase();
        }
        return { ...w, word: newWord };
      }
      return w;
    });
    onUpdateWords(updated);
  };

  const handleBulkRomanize = () => {
    if (!onUpdateWords || !words || words.length === 0) return;
    const updated = (words || []).map(w => {
      if (selectedWordIds.size === 0 || selectedWordIds.has(w.id)) {
        return { ...w, word: ensureRomanScript(w.word) };
      }
      return w;
    });
    onUpdateWords(updated);
  };

  const handleSelectAll = () => {
    const allIds = (words || []).map(w => w.id);
    setSelectedWordIds(new Set(allIds));
  };

  const handleClearSelection = () => {
    setSelectedWordIds(new Set());
  };

  const fonts = [
    { id: 'Inter', name: 'SANS-SERIF (NORMAL)' },
    { id: 'Playfair Display', name: 'ROMANTIC SERIF' },
    { id: 'Pacifico', name: 'LOVE CURSIVE' },
    { id: 'Black Han Sans', name: 'KOREAN BLOCK' },
    { id: 'Impact', name: 'IMPACT BOLD' },
    { id: 'Fredoka', name: 'FREDOKA BOLD' },
    { id: 'Space Grotesk', name: 'SPACE GROTESK' },
    { id: 'Courier', name: 'COURIER MONO' },
  ];

  const premiumColors = [
    { hex: '#FFFFFF', name: 'White' },
    { hex: '#C600DC', name: 'Purple' },
    { hex: '#FACC15', name: 'Yellow' },
    { hex: '#C026D3', name: 'Fuchsia' },
    { hex: '#00FF00', name: 'Green' },
    { hex: '#38BDF8', name: 'Sky' },
    { hex: '#F472B6', name: 'Pink' },
    { hex: '#FB7185', name: 'Rose' },
    { hex: '#F97316', name: 'Orange' },
  ];

  const activeIndex = (words || []).findIndex(w => currentTime >= (w.start_time || 0) && currentTime <= (w.end_time || 0));

  const sentences = React.useMemo(() => {
    if (!words || words.length === 0) return [];
    const maxGap = 1.2;
    const maxWords = 5;
    
    const list: { id: string; text: string; start_time: number; end_time: number; words: CaptionWord[] }[] = [];
    let currentGroup: CaptionWord[] = [words[0]];
    
    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1];
      const curr = words[i];
      const gap = (curr.start_time || 0) - (prev.end_time || 0);
      
      if (gap > maxGap || currentGroup.length >= maxWords) {
        list.push({
          id: (currentGroup[0]?.id || `s-${i}`) + '_sentence',
          text: currentGroup.map(w => stripASSTags(w.word)).filter(Boolean).join(' '),
          start_time: currentGroup[0]?.start_time || 0,
          end_time: currentGroup[currentGroup.length - 1]?.end_time || 0,
          words: currentGroup
        });
        currentGroup = [curr];
      } else {
        currentGroup.push(curr);
      }
    }
    
    if (currentGroup.length > 0) {
      list.push({
        id: (currentGroup[0]?.id || 's-end') + '_sentence',
        text: currentGroup.map(w => stripASSTags(w.word)).filter(Boolean).join(' '),
        start_time: currentGroup[0]?.start_time || 0,
        end_time: currentGroup[currentGroup.length - 1]?.end_time || 0,
        words: currentGroup
      });
    }
    return list;
  }, [words]);

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
      const sampleText = `Hello! I am ${voice.name.split(' ')[0]}. Here is how I sound dubbing your project.`;
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

  return (
    <div className="w-full h-full bg-[#121216] border border-[#262633] rounded-3xl flex flex-col overflow-hidden shadow-2xl">
      {/* Tab Navigation Header */}
      <div className="p-3 bg-[#16161c] border-b border-[#22222a] flex items-center justify-between gap-1 shrink-0">
        <div className="grid grid-cols-4 gap-1 w-full">
          <button
            onClick={() => setActiveTab('presets')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'presets'
                ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30'
                : 'text-gray-400 hover:text-white hover:bg-[#202028]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Presets</span>
          </button>

          <button
            onClick={() => setActiveTab('decorations')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'decorations'
                ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30'
                : 'text-gray-400 hover:text-white hover:bg-[#202028]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Style</span>
          </button>

          <button
            onClick={() => setActiveTab('transcript')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'transcript'
                ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30'
                : 'text-gray-400 hover:text-white hover:bg-[#202028]'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Words</span>
          </button>

          <button
            onClick={() => setActiveTab('dubbing')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'dubbing'
                ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30'
                : 'text-gray-400 hover:text-white hover:bg-[#202028]'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Dubbing</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-5">
        
        {/* TAB 1: PRESETS */}
        {activeTab === 'presets' && (
          <div className="space-y-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 custom-scrollbar">
              {STYLE_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-xl uppercase transition-colors shrink-0 cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-fuchsia-600 text-white shadow-sm'
                      : 'bg-[#1a1a22] text-gray-400 hover:text-white'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {PRESETS.filter(p => selectedCategory === 'all' || p.category === selectedCategory).map(preset => {
                const isSel = safeSettings.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => onUpdateStyleSettings({ preset: preset.settings.preset, highlightColor: preset.settings.highlightColor, textColor: preset.settings.textColor, fontFamily: preset.settings.fontFamily, showBackground: preset.settings.showBackground, capitalization: preset.settings.capitalization, showBacklight: preset.settings.showBacklight, showSpotlight: preset.settings.showSpotlight, rotation: preset.settings.rotation, maxWordsPerScreen: preset.settings.maxWordsPerScreen })}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-2 relative overflow-hidden ${
                      isSel 
                        ? 'border-fuchsia-500 bg-fuchsia-600/20 shadow-lg ring-2 ring-fuchsia-500/50' 
                        : 'border-[#262635] bg-[#161620] hover:bg-[#1f1f2c]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-white truncate">{preset.name}</span>
                      {isSel && <Check className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />}
                    </div>
                    <div className="h-10 rounded-xl bg-black/40 flex items-center justify-center border border-white/5">
                      <PresetPreview settings={preset.settings} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: DECORATIONS & STYLING */}
        {activeTab === 'decorations' && (
          <div className="space-y-5">
            {/* Color Palette */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-fuchsia-400">
                Word Highlight Color
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {premiumColors.map(c => (
                  <button
                    key={c.hex}
                    onClick={() => onUpdateStyleSettings({ highlightColor: c.hex })}
                    className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer flex items-center justify-center ${
                      safeSettings.highlightColor.toLowerCase() === c.hex.toLowerCase()
                        ? 'scale-115 border-white ring-2 ring-fuchsia-500 shadow-md'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>

            {/* Typography */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-fuchsia-400">
                Typography / Font
              </label>
              <select
                value={safeSettings.fontFamily}
                onChange={(e) => onUpdateStyleSettings({ fontFamily: e.target.value })}
                className="w-full bg-[#0a0a0e] border border-[#2c2c3a] rounded-xl text-white text-xs font-bold px-3 py-2.5 focus:outline-none focus:border-fuchsia-500 cursor-pointer"
              >
                {fonts.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            {/* Font Size Scaling */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-black uppercase text-fuchsia-400">Font Size Scaling</span>
                <span className="font-mono text-white font-bold">{Math.round(safeSettings.fontSize * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.8"
                step="0.05"
                value={safeSettings.fontSize}
                onChange={(e) => onUpdateStyleSettings({ fontSize: parseFloat(e.target.value) })}
                className="w-full accent-fuchsia-500 cursor-pointer"
              />
            </div>

            {/* Max Words Per Screen */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-black uppercase text-fuchsia-400">Words Per Caption Screen</span>
                <span className="font-mono text-white font-bold">{safeSettings.maxWordsPerScreen} Words</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 5].map(cnt => (
                  <button
                    key={cnt}
                    onClick={() => onUpdateStyleSettings({ maxWordsPerScreen: cnt })}
                    className={`py-2 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer ${
                      safeSettings.maxWordsPerScreen === cnt
                        ? 'bg-fuchsia-600 text-white font-black'
                        : 'bg-[#181822] text-gray-400 hover:text-white'
                    }`}
                  >
                    {cnt} {cnt === 1 ? 'Word' : 'Words'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WORDS & TRANSCRIPT */}
        {activeTab === 'transcript' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-gray-400">
                Synchronized Words ({words.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkRomanize}
                  className="text-[10px] font-bold uppercase bg-[#1e1e28] hover:bg-fuchsia-600/30 text-fuchsia-300 px-2.5 py-1 rounded-lg border border-[#2e2e3e] transition-colors cursor-pointer"
                >
                  Romanize Script
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-1">
              {sentences.map((sent, sIdx) => (
                <div 
                  key={sent.id}
                  className="p-3 bg-[#161620] border border-[#262633] rounded-2xl space-y-2"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-gray-500">
                    <span>{sent.start_time.toFixed(1)}s - {sent.end_time.toFixed(1)}s</span>
                    <button
                      onClick={() => onSeek(sent.start_time)}
                      className="text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" /> Seek
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {sent.words.map(w => {
                      const isActive = currentTime >= w.start_time && currentTime <= w.end_time;
                      return (
                        <span
                          key={w.id}
                          onClick={() => {
                            setEditingWordId(w.id);
                            setEditingWordText(w.word);
                          }}
                          className={`text-xs px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-fuchsia-600 text-white shadow-md scale-105'
                              : 'bg-[#0f0f15] text-gray-300 hover:bg-[#20202c] border border-white/5'
                          }`}
                        >
                          {w.word}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: AI DUBBING & RE-DUB STUDIO */}
        {activeTab === 'dubbing' && (
          <div className="space-y-5">
            <div className="bg-gradient-to-r from-purple-950/40 to-fuchsia-950/40 p-4 rounded-2xl border border-fuchsia-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-fuchsia-400" />
                  <span className="text-xs font-black uppercase text-white">Re-Dubbing Studio</span>
                </div>
                <span className="text-[10px] font-mono text-fuchsia-300 bg-fuchsia-500/20 px-2 py-0.5 rounded-full">
                  Instant Cache Reuse
                </span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Change voice or language without re-transcribing from scratch. The pipeline reuses cached results and fits dubbed audio to video duration.
              </p>
            </div>

            {/* Target Language Dropdown */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-fuchsia-400">
                Target Dubbing Language
              </label>
              <select
                value={safeDubbing.targetLanguage}
                onChange={(e) => onUpdateDubbingSettings?.({ targetLanguage: e.target.value })}
                className="w-full bg-[#0a0a0e] border border-[#2c2c3a] rounded-xl text-white text-xs font-bold px-3 py-2.5 focus:outline-none focus:border-fuchsia-500 cursor-pointer"
              >
                <option value="english">English (Global)</option>
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

            {/* Emotion Style */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-fuchsia-400">
                Expressive Emotion & Performance
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {EMOTION_STYLES.map(emo => (
                  <button
                    key={emo.id}
                    onClick={() => onUpdateDubbingSettings?.({ emotion: emo.id as any })}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      safeDubbing.emotion === emo.id
                        ? 'border-fuchsia-500 bg-fuchsia-600/25 text-white font-bold'
                        : 'border-[#262635] bg-[#14141d] text-gray-400 hover:text-white'
                    }`}
                  >
                    <span className="text-xs">{emo.emoji} {emo.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Catalog Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black uppercase tracking-wider text-fuchsia-400">
                  Select AI Voice
                </label>
                <div className="flex items-center gap-1">
                  {(['all', 'male', 'female'] as const).map(g => (
                    <button
                      key={g}
                      onClick={() => setGenderFilter(g)}
                      className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        genderFilter === g ? 'bg-fuchsia-600 text-white' : 'bg-[#181822] text-gray-400 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={voiceSearch}
                  onChange={(e) => setVoiceSearch(e.target.value)}
                  placeholder="Search voice name or tone..."
                  className="w-full bg-[#0a0a0e] border border-[#2c2c3a] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500"
                />
              </div>

              {/* Voice Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                {filteredVoices.map(voice => {
                  const isSelected = safeDubbing.voiceId === voice.id;
                  const isPlayingSample = previewingVoiceId === voice.id;

                  return (
                    <div
                      key={voice.id}
                      onClick={() => onUpdateDubbingSettings?.({ voiceId: voice.id })}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'border-fuchsia-500 bg-fuchsia-600/25 ring-1 ring-fuchsia-500/50'
                          : 'border-[#22222e] bg-[#0d0d12] hover:bg-[#161620]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">{voice.emoji}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{voice.name.split(' ')[0]}</div>
                          <div className="text-[9px] text-gray-400 truncate">{voice.tags.join(' • ')}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handlePreviewVoice(voice, e)}
                        className="w-6 h-6 rounded-full bg-[#181824] hover:bg-fuchsia-600 text-gray-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        {isPlayingSample ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current ml-0.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Re-Dub Action Button */}
            <button
              onClick={() => onReDub?.(safeDubbing)}
              disabled={isReDubbing}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-600/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {isReDubbing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Re-Dubbing in Progress...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  ✨ Re-Dub Video with Selected Voice
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default function EditorPanel(props: EditorPanelProps) {
  return (
    <EditorErrorBoundary>
      <EditorPanelContent {...props} />
    </EditorErrorBoundary>
  );
}
