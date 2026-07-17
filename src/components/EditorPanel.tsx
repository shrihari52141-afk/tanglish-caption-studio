import React, { useState } from 'react';
import { CaptionWord, SubtitleStyleSettings } from '../types';
import { PRESETS, STYLE_CATEGORIES } from '../data/presets';
import { Sparkles, Type, CaseSensitive, AlignCenter, AlignLeft, AlignRight, Sliders, Edit3, Check, Play, Hash, Smile } from 'lucide-react';
import { exportToSRT, exportToVTT, exportToASS, triggerDownload } from '../utils/subtitleExporter';

interface EditorPanelProps {
  styleSettings: SubtitleStyleSettings;
  onUpdateStyleSettings: (settings: Partial<SubtitleStyleSettings>) => void;
  words: CaptionWord[];
  currentTime: number;
  onUpdateWordText: (id: string, text: string) => void;
  onSeek: (time: number) => void;
  onUpdateWords?: (words: CaptionWord[]) => void;
  activeTab?: 'presets' | 'decorations' | 'transcript';
  onActiveTabChange?: (tab: 'presets' | 'decorations' | 'transcript') => void;
}

export default function EditorPanel({ 
  styleSettings, 
  onUpdateStyleSettings, 
  words, 
  currentTime,
  onUpdateWordText,
  onSeek,
  onUpdateWords,
  activeTab: controlledActiveTab,
  onActiveTabChange
}: EditorPanelProps) {
  const [localActiveTab, setLocalActiveTab] = useState<'presets' | 'decorations' | 'transcript'>('presets');
  
  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : localActiveTab;
  const setActiveTab = (tab: 'presets' | 'decorations' | 'transcript') => {
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
  
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);

  // Bulk selection and editing states
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());

  const handleBulkDelete = () => {
    if (!onUpdateWords) return;
    const filtered = words.filter(w => !selectedWordIds.has(w.id));
    onUpdateWords(filtered);
    setSelectedWordIds(new Set());
  };

  const handleBulkCapitalize = (mode: 'upper' | 'lower' | 'capitalize') => {
    if (!onUpdateWords) return;
    const updated = words.map(w => {
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

  const handleSelectAll = () => {
    const allIds = words.map(w => w.id);
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

  const genres = [
    { id: 'normal', name: 'Normal 😐', fontFamily: 'Inter' },
    { id: 'romantic', name: 'Romantic 🌹', fontFamily: 'Playfair Display' },
    { id: 'love', name: 'Love ❤️', fontFamily: 'Pacifico' },
    { id: 'korean', name: 'Korean 🇰🇷', fontFamily: 'Black Han Sans' },
    { id: 'action', name: 'Action ⚡', fontFamily: 'Impact' },
    { id: 'cute', name: 'Cute 🧸', fontFamily: 'Fredoka' },
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

  // Active word index based on playback time
  const activeIndex = words.findIndex(w => currentTime >= w.start_time && currentTime <= w.end_time);

  // Group individual words into sentences for the Interactive Timestamps
  const sentences = React.useMemo(() => {
    if (words.length === 0) return [];
    const maxGap = 1.2; // seconds pause triggers new sentence
    const maxWords = 5; // maximum words per sentence box
    
    const list: { id: string; text: string; start_time: number; end_time: number; words: CaptionWord[] }[] = [];
    let currentGroup: CaptionWord[] = [words[0]];
    
    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1];
      const curr = words[i];
      const gap = curr.start_time - prev.end_time;
      
      if (gap > maxGap || currentGroup.length >= maxWords) {
        list.push({
          id: currentGroup[0].id + '_sentence',
          text: currentGroup.map(w => w.word).join(' '),
          start_time: currentGroup[0].start_time,
          end_time: currentGroup[currentGroup.length - 1].end_time,
          words: currentGroup
        });
        currentGroup = [curr];
      } else {
        currentGroup.push(curr);
      }
    }
    
    if (currentGroup.length > 0) {
      list.push({
        id: currentGroup[0].id + '_sentence',
        text: currentGroup.map(w => w.word).join(' '),
        start_time: currentGroup[0].start_time,
        end_time: currentGroup[currentGroup.length - 1].end_time,
        words: currentGroup
      });
    }
    return list;
  }, [words]);

  // Handle preset application
  const handleApplyPreset = (presetSettings: any) => {
    onUpdateStyleSettings(presetSettings);
  };

  // Editing standard word
  const handleStartWordEdit = (w: CaptionWord, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWordId(w.id);
    setEditingWordText(w.word);
    setEditingSentenceId(null);
  };

  const handleSaveWordEdit = (id: string) => {
    onUpdateWordText(id, editingWordText);
    setEditingWordId(null);
  };

  // Editing full sentence
  const handleStartSentenceEdit = (sId: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSentenceId(sId);
    setEditingSentenceText(text);
    setEditingWordId(null);
  };

  const handleSaveSentenceEdit = (sId: string, sentenceWords: CaptionWord[]) => {
    const newWordsText = editingSentenceText.trim().split(/\s+/).filter(Boolean);
    if (newWordsText.length === 0) {
      setEditingSentenceId(null);
      return;
    }

    if (!onUpdateWords) {
      // Fallback: update matching indices
      sentenceWords.forEach((sw, idx) => {
        if (newWordsText[idx]) {
          onUpdateWordText(sw.id, newWordsText[idx]);
        }
      });
      setEditingSentenceId(null);
      return;
    }

    // Distribute time proportionally
    const startTime = sentenceWords[0].start_time;
    const endTime = sentenceWords[sentenceWords.length - 1].end_time;
    const totalDuration = endTime - startTime;
    const wordDuration = totalDuration / newWordsText.length;

    const updatedSentenceWords = newWordsText.map((wText, idx) => {
      const originalWord = sentenceWords[idx];
      return {
        id: originalWord?.id || `word-${sId}-${idx}-${Math.random().toString(36).substring(5)}`,
        word: wText,
        start_time: startTime + (idx * wordDuration),
        end_time: startTime + ((idx + 1) * wordDuration),
      };
    });

    const originalWordIds = new Set(sentenceWords.map(sw => sw.id));
    const finalWordsList: CaptionWord[] = [];
    let replaced = false;

    for (let i = 0; i < words.length; i++) {
      if (originalWordIds.has(words[i].id)) {
        if (!replaced) {
          finalWordsList.push(...updatedSentenceWords);
          replaced = true;
        }
      } else {
        finalWordsList.push(words[i]);
      }
    }

    onUpdateWords(finalWordsList);
    setEditingSentenceId(null);
  };

  // Filter presets based on category
  const filteredPresets = PRESETS.filter(p => selectedCategory === 'all' || p.category === selectedCategory);

  return (
    <div className="w-full h-auto lg:h-full bg-[#161616] flex flex-col border-l border-[#333]">
      {/* Category Tabs */}
      <div className="flex border-b border-[#333] bg-[#0A0A0A] shrink-0 sticky top-0 z-10">
        <button
          onClick={() => setActiveTab('presets')}
          className={`flex-1 py-4 text-center text-[12px] font-black uppercase tracking-wide border-b-2 transition-colors ${
            activeTab === 'presets' ? 'border-fuchsia-600 text-fuchsia-500' : 'border-transparent text-[#888888] hover:text-white'
          }`}
        >
          Presets
        </button>
        <button
          onClick={() => setActiveTab('decorations')}
          className={`flex-1 py-4 text-center text-[12px] font-black uppercase tracking-wide border-b-2 transition-colors ${
            activeTab === 'decorations' ? 'border-fuchsia-600 text-fuchsia-500' : 'border-transparent text-[#888888] hover:text-white'
          }`}
        >
          Decoration
        </button>
        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex-1 py-4 text-center text-[12px] font-black uppercase tracking-wide border-b-2 transition-colors ${
            activeTab === 'transcript' ? 'border-fuchsia-600 text-fuchsia-500' : 'border-transparent text-[#888888] hover:text-white'
          }`}
        >
          Transcript
        </button>
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-visible lg:overflow-y-auto custom-scrollbar flex flex-col gap-6">
        {/* PRESETS TAB */}
        {activeTab === 'presets' && (
          <div className="flex flex-col gap-5 animate-fade-in">
            {/* Horizontal Scrollable Subcategories */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 custom-scrollbar shrink-0 select-none -mx-1 px-1">
              {STYLE_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/20'
                      : 'bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2a2a]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div>
              <div className="text-[12px] font-extrabold uppercase tracking-[1px] text-[#888888] mb-3.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-fuchsia-500" /> Caption Presets ({filteredPresets.length})
                </span>
                <span className="text-[9px] text-fuchsia-400 font-bold bg-fuchsia-500/10 px-2 py-0.5 rounded-full uppercase">
                  Animations Active
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {filteredPresets.map((p) => {
                  const isActive = styleSettings.preset === p.id || styleSettings.preset === p.settings.preset;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleApplyPreset(p.settings)}
                      className={`relative p-3.5 rounded-xl border-2 text-left transition-all overflow-hidden flex flex-col justify-between ${
                        isActive 
                          ? 'border-fuchsia-600 bg-fuchsia-600/10 shadow-lg shadow-fuchsia-600/10' 
                          : 'border-transparent bg-[#222] hover:bg-[#2c2c2c]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-lg">{p.emoji}</span>
                          <div className="text-[11px] font-black uppercase tracking-tight text-white truncate max-w-[80%]">
                            {p.name}
                          </div>
                        </div>
                        
                        {/* Interactive live preview playing the preset animation */}
                        <div className="mt-1 bg-[#0A0A0A] p-2.5 rounded-lg text-[13px] font-black text-center border border-[#2c2c2c] overflow-hidden h-[42px] flex items-center justify-center">
                          <span 
                            style={{ 
                              color: p.settings.highlightColor, 
                              fontFamily: p.settings.fontFamily === 'Impact' ? 'Impact, sans-serif' :
                                          p.settings.fontFamily === 'Courier' ? '"Courier New", Courier, monospace' :
                                          p.settings.fontFamily === 'Fredoka' ? '"Fredoka One", "Inter", sans-serif' :
                                          p.settings.fontFamily === 'Space Grotesk' ? '"Space Grotesk", sans-serif' :
                                          '"Helvetica Neue", Arial, sans-serif',
                              textShadow: p.settings.showBacklight 
                                ? `0 0 10px ${p.settings.highlightColor}` 
                                : '3px 3px 0px #000',
                            }}
                            className={`inline-block style-${p.settings.preset} ${p.settings.fontFamily === 'Impact' ? 'italic uppercase' : ''}`}
                          >
                            TNP {p.emoji}
                          </span>
                        </div>
                      </div>

                      {isActive && (
                        <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-fuchsia-600 rounded-bl-lg"></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-[#222]/40 rounded-xl p-4 border border-[#333] mt-2">
              <div className="text-[12px] font-extrabold uppercase text-white mb-2">💡 Quick tip</div>
              <p className="text-[11px] text-[#888888] leading-relaxed">
                Click any preset to instantly apply fonts, colors, and keyframe animations! Tweak colors or formatting under <strong className="text-white">Decoration</strong>.
              </p>
            </div>
          </div>
        )}

        {/* DECORATIONS TAB */}
        {activeTab === 'decorations' && (
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* Font Family & Genres */}
            <div>
              <div className="text-[12px] font-extrabold uppercase tracking-[1px] text-[#888888] mb-3 flex items-center gap-1.5">
                <Type className="w-4 h-4 text-fuchsia-500" /> Font & Genre Style
              </div>

              {/* Genre Selector */}
              <div className="mb-4 bg-[#0E0E0E] p-3 rounded-xl border border-[#222]">
                <div className="text-[10px] font-black uppercase tracking-wider text-[#777] mb-2">Style Genres</div>
                <div className="grid grid-cols-3 gap-2">
                  {genres.map((g) => {
                    const isActive = styleSettings.fontFamily === g.fontFamily;
                    return (
                      <button
                        key={g.id}
                        onClick={() => onUpdateStyleSettings({ fontFamily: g.fontFamily })}
                        className={`py-2 px-1 rounded-lg border text-[11px] font-extrabold transition-all duration-200 cursor-pointer text-center ${
                          isActive
                            ? 'border-fuchsia-600 bg-fuchsia-600/15 text-fuchsia-400 shadow-sm'
                            : 'border-[#333] bg-[#1a1a1a] text-[#888] hover:bg-[#222] hover:text-white'
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
                {genres.some(g => g.fontFamily === styleSettings.fontFamily) && (
                  <div className="text-[9px] text-fuchsia-400 font-semibold mt-2 text-center animate-fade-in">
                    ✨ Automatically selected <strong className="uppercase font-black">{styleSettings.fontFamily}</strong> font for you!
                  </div>
                )}
              </div>

              {/* Individual Fonts */}
              <div className="text-[10px] font-black uppercase tracking-wider text-[#777] mb-2">All Individual Fonts</div>
              <div className="flex flex-wrap gap-1.5">
                {fonts.map((f) => {
                  const isActive = styleSettings.fontFamily === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => onUpdateStyleSettings({ fontFamily: f.id })}
                      className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wide transition-colors cursor-pointer ${
                        isActive 
                          ? 'border-fuchsia-600 bg-fuchsia-600/15 text-fuchsia-500' 
                          : 'border-[#333] bg-[#222] text-white hover:bg-[#333]'
                      }`}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Capitalization */}
            <div>
              <div className="text-[12px] font-extrabold uppercase tracking-[1px] text-[#888888] mb-3 flex items-center gap-1.5">
                <CaseSensitive className="w-4 h-4 text-fuchsia-500" /> Capitalization
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['none', 'all', 'lower', 'sentence'] as const).map((cap) => {
                  const isActive = styleSettings.capitalization === cap;
                  return (
                    <button
                      key={cap}
                      onClick={() => onUpdateStyleSettings({ capitalization: cap })}
                      className={`py-2 px-1 rounded-lg border text-[10px] font-black uppercase text-center transition-colors cursor-pointer ${
                        isActive 
                          ? 'border-fuchsia-600 bg-fuchsia-600/15 text-fuchsia-500' 
                          : 'border-[#333] bg-[#222] text-white hover:bg-[#333]'
                      }`}
                    >
                      {cap === 'none' ? 'Original' : cap}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Alignments */}
            <div>
              <div className="text-[12px] font-extrabold uppercase tracking-[1px] text-[#888888] mb-3 flex items-center gap-1.5">
                <AlignCenter className="w-4 h-4 text-fuchsia-500" /> Alignments
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'left', icon: AlignLeft, label: 'Left' },
                  { id: 'center', icon: AlignCenter, label: 'Center' },
                  { id: 'right', icon: AlignRight, label: 'Right' },
                ].map((align) => {
                  const isActive = styleSettings.alignment === align.id;
                  const Icon = align.icon;
                  return (
                    <button
                      key={align.id}
                      onClick={() => onUpdateStyleSettings({ alignment: align.id as any })}
                      className={`py-2 px-3 rounded-lg border text-[11px] font-black uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isActive 
                          ? 'border-fuchsia-600 bg-fuchsia-600/15 text-fuchsia-500' 
                          : 'border-[#333] bg-[#222] text-white hover:bg-[#333]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {align.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Words per Screen */}
            <div>
              <div className="text-[12px] font-extrabold uppercase tracking-[1px] text-[#888888] mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-sans font-extrabold">
                  <Hash className="w-4 h-4 text-fuchsia-500" /> Words on Screen
                </span>
                <span className="text-[10px] bg-fuchsia-600/20 text-fuchsia-400 px-2 py-0.5 rounded-full font-bold">
                  Active: {styleSettings.maxWordsPerScreen || 1} {styleSettings.maxWordsPerScreen === 1 ? 'word' : 'words'}
                </span>
              </div>
              
              <div className="grid grid-cols-5 gap-1.5 mb-2.5">
                {[1, 2, 3, 4, 5].map((num) => {
                  const isActive = styleSettings.maxWordsPerScreen === num;
                  return (
                    <button
                      key={num}
                      onClick={() => onUpdateStyleSettings({ maxWordsPerScreen: num })}
                      className={`py-2 px-1 rounded-lg border text-[12px] font-black transition-all cursor-pointer ${
                        isActive
                          ? 'border-fuchsia-600 bg-fuchsia-600/20 text-fuchsia-500 shadow-lg font-extrabold'
                          : 'border-[#333] bg-[#222] text-white hover:bg-[#333]'
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>

              {/* AI Suggest Button */}
              <button
                onClick={() => {
                  setIsAnalyzingAI(true);
                  setTimeout(() => {
                    onUpdateStyleSettings({
                      maxWordsPerScreen: 3,
                      preset: 'bounce',
                      fontFamily: 'Fredoka',
                      showBackground: false,
                      showSpotlight: false,
                      showBacklight: false,
                      highlightColor: '#F472B6', // pink highlight as default
                      capitalization: 'sentence',
                      rotation: 0,
                    });
                    setIsAnalyzingAI(false);
                  }, 1200);
                }}
                disabled={isAnalyzingAI}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white font-extrabold text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isAnalyzingAI ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    AI CADENCE ANALYSIS...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    Set Optimal Words via AI
                  </>
                )}
              </button>
            </div>

            {/* AI Emojis & Punctuation Controls */}
            <div>
              <div className="text-[12px] font-extrabold uppercase tracking-[1px] text-[#888888] mb-3 flex items-center gap-1.5">
                <Smile className="w-4 h-4 text-fuchsia-500" /> AI Emojis & Punctuation
              </div>
              <div className="flex flex-col gap-3.5 bg-[#1f1f1f] p-4 rounded-xl border border-[#333] mb-4">
                {/* Enable Emojis Switch */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-black text-white uppercase flex items-center gap-1.5">
                      Show Emojis
                    </div>
                    <div className="text-[10px] text-[#888888]">Toggle whether to render visual reaction emojis</div>
                  </div>
                  <button
                    onClick={() => onUpdateStyleSettings({ showEmojis: styleSettings.showEmojis !== false ? false : true })}
                    className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none cursor-pointer ${
                      styleSettings.showEmojis !== false ? 'bg-fuchsia-600' : 'bg-[#333]'
                    }`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                      styleSettings.showEmojis !== false ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Show Punctuation Switch */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-black text-white uppercase">Show Punctuation</div>
                    <div className="text-[10px] text-[#888888]">Toggle commas, periods, and question marks</div>
                  </div>
                  <button
                    onClick={() => onUpdateStyleSettings({ showPunctuation: styleSettings.showPunctuation !== false ? false : true })}
                    className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none cursor-pointer ${
                      styleSettings.showPunctuation !== false ? 'bg-fuchsia-600' : 'bg-[#333]'
                    }`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                      styleSettings.showPunctuation !== false ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Emoji Styles / Options Selector (Disabled if showEmojis is false) */}
                {styleSettings.showEmojis !== false && (
                  <div className="pt-3 border-t border-[#333] space-y-2.5 animate-fade-in">
                    <div className="text-[11px] font-black text-white uppercase tracking-wider">Emoji Theme Preset</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'auto', name: 'Smart Auto 🤖', desc: 'Fits video style' },
                        { id: 'vibes', name: 'Hype Vibes 🔥', desc: 'Reaction emojis' },
                        { id: 'emotions', name: 'Feelings 🤩', desc: 'Expressions & faces' },
                        { id: 'objects', name: 'Objects 🎬', desc: 'Real life items' },
                        { id: 'energetic', name: 'Beast 🦾', desc: 'Fierce action' },
                        { id: 'minimal', name: 'Minimal 👾', desc: 'Retro pixel' },
                        { id: 'custom', name: 'Magical 💖', desc: 'Cute dream' },
                      ].map((stylePreset) => {
                        const isSel = (styleSettings.emojiStyle || 'auto') === stylePreset.id;
                        return (
                          <button
                            key={stylePreset.id}
                            onClick={() => onUpdateStyleSettings({ emojiStyle: stylePreset.id as any })}
                            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                              isSel 
                                ? 'border-fuchsia-600 bg-fuchsia-600/10' 
                                : 'border-[#333] bg-[#0A0A0A] hover:bg-[#151515]'
                            }`}
                          >
                            <span className="text-[11px] font-bold text-white leading-none">{stylePreset.name}</span>
                            <span className="text-[8px] text-[#888888] leading-tight mt-0.5">{stylePreset.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Text Formatting toggles */}
            <div>
              <div className="text-[12px] font-extrabold uppercase tracking-[1px] text-[#888888] mb-3 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-fuchsia-500" /> Formatting Effects
              </div>
              <div className="flex flex-col gap-3.5 bg-[#1f1f1f] p-4 rounded-xl border border-[#333]">
                {/* Background Box */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-black text-white uppercase">Background Box</div>
                    <div className="text-[10px] text-[#888888]">Solid capsule background on active words</div>
                  </div>
                  <button
                    onClick={() => onUpdateStyleSettings({ showBackground: !styleSettings.showBackground })}
                    className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none cursor-pointer ${
                      styleSettings.showBackground ? 'bg-fuchsia-600' : 'bg-[#333]'
                    }`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                      styleSettings.showBackground ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Spotlight Active */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-black text-white uppercase">Spotlight Accent</div>
                    <div className="text-[10px] text-[#888888]">Dims inactive words to focus viewer</div>
                  </div>
                  <button
                    onClick={() => onUpdateStyleSettings({ showSpotlight: !styleSettings.showSpotlight })}
                    className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none cursor-pointer ${
                      styleSettings.showSpotlight ? 'bg-fuchsia-600' : 'bg-[#333]'
                    }`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                      styleSettings.showSpotlight ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Backlight Glow */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-black text-white uppercase">Backlight Glow</div>
                    <div className="text-[10px] text-[#888888]">Neon bloom / glow behind highlights</div>
                  </div>
                  <button
                    onClick={() => onUpdateStyleSettings({ showBacklight: !styleSettings.showBacklight })}
                    className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none cursor-pointer ${
                      styleSettings.showBacklight ? 'bg-fuchsia-600' : 'bg-[#333]'
                    }`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                      styleSettings.showBacklight ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Text Shadow */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-black text-white uppercase">Text Shadow / Outline</div>
                    <div className="text-[10px] text-[#888888]">Traditional drop-shadow and stroke outline</div>
                  </div>
                  <button
                    onClick={() => onUpdateStyleSettings({ showShadow: !styleSettings.showShadow })}
                    className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none cursor-pointer ${
                      styleSettings.showShadow ? 'bg-fuchsia-600' : 'bg-[#333]'
                    }`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                      styleSettings.showShadow ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Color Palette */}
            <div>
              <div className="text-[12px] font-extrabold uppercase tracking-[1px] text-[#888888] mb-2">
                Active Word Color
              </div>
              <div className="flex flex-wrap gap-2.5 bg-[#1f1f1f] p-3.5 rounded-xl border border-[#333]">
                {premiumColors.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => onUpdateStyleSettings({ highlightColor: c.hex })}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-95 cursor-pointer ${
                      styleSettings.highlightColor.toLowerCase() === c.hex.toLowerCase()
                        ? 'border-white scale-110 shadow-lg shadow-white/10'
                        : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="text-[12px] font-extrabold uppercase tracking-[1px] text-[#888888] mb-2">
                Standard Text Color
              </div>
              <div className="flex flex-wrap gap-2.5 bg-[#1f1f1f] p-3.5 rounded-xl border border-[#333]">
                {premiumColors.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => onUpdateStyleSettings({ textColor: c.hex })}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-95 cursor-pointer ${
                      styleSettings.textColor.toLowerCase() === c.hex.toLowerCase()
                        ? 'border-white scale-110 shadow-lg shadow-white/10'
                        : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TRANSCRIPT TAB */}
        {activeTab === 'transcript' && (
          <div className="flex flex-col gap-4 animate-fade-in flex-1 min-h-0">
            <div className="text-[12px] font-extrabold uppercase tracking-[1px] text-[#888888] mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-fuchsia-500" /> Interactive Timestamps
              </span>
              <span className="text-[10px] text-fuchsia-400 font-bold bg-fuchsia-500/10 px-2 py-0.5 rounded-full uppercase">
                Sentence Mode Active
              </span>
            </div>

            {/* Bulk Selection and Action Header */}
            {words.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between bg-[#1e1e1e] p-3 rounded-xl border border-[#333]">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="bulk-mode-toggle"
                      checked={isBulkMode}
                      onChange={(e) => {
                        setIsBulkMode(e.target.checked);
                        setSelectedWordIds(new Set());
                      }}
                      className="w-4 h-4 rounded border-[#444] text-fuchsia-600 focus:ring-fuchsia-500 bg-[#0A0A0A] accent-fuchsia-500 cursor-pointer"
                    />
                    <label htmlFor="bulk-mode-toggle" className="text-[11px] font-black uppercase text-white cursor-pointer select-none flex items-center gap-1.5">
                      Bulk Edit Mode
                    </label>
                  </div>
                  {isBulkMode && (
                    <span className="text-[10px] text-fuchsia-400 font-black bg-fuchsia-500/10 px-2.5 py-1 rounded-full uppercase">
                      {selectedWordIds.size} selected
                    </span>
                  )}
                </div>

                {isBulkMode && (
                  <div className="bg-[#1a1a1a] p-3.5 rounded-xl border border-fuchsia-500/30 flex flex-col gap-2.5 animate-fade-in">
                    <div className="text-[10px] font-black uppercase tracking-wide text-gray-400">Bulk Actions:</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleBulkDelete}
                        disabled={selectedWordIds.size === 0}
                        className="py-2.5 px-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border-none"
                      >
                        🗑️ Delete Selected
                      </button>
                      <button
                        onClick={() => handleBulkCapitalize('upper')}
                        disabled={selectedWordIds.size === 0}
                        className="py-2.5 px-3 bg-[#2c2c2c] hover:bg-[#3d3d3d] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border-none"
                      >
                        🔠 UPPERCASE
                      </button>
                      <button
                        onClick={() => handleBulkCapitalize('lower')}
                        disabled={selectedWordIds.size === 0}
                        className="py-2.5 px-3 bg-[#2c2c2c] hover:bg-[#3d3d3d] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border-none"
                      >
                        🔡 lowercase
                      </button>
                      <button
                        onClick={() => handleBulkCapitalize('capitalize')}
                        disabled={selectedWordIds.size === 0}
                        className="py-2.5 px-3 bg-[#2c2c2c] hover:bg-[#3d3d3d] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border-none"
                      >
                        ✍️ Title Case
                      </button>
                    </div>
                    <div className="flex gap-2 justify-between border-t border-[#2a2a2a] pt-2 mt-0.5">
                      <button
                        onClick={handleSelectAll}
                        className="text-[10px] font-bold uppercase text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer bg-transparent border-none"
                      >
                        Select All ({words.length})
                      </button>
                      <button
                        onClick={handleClearSelection}
                        className="text-[10px] font-bold uppercase text-gray-400 hover:text-white cursor-pointer bg-transparent border-none"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="flex-1 overflow-visible lg:overflow-y-auto max-h-none lg:max-h-[500px] space-y-3 bg-[#0A0A0A] p-4 border border-[#333] custom-scrollbar rounded-xl">
              {words.length === 0 ? (
                <p className="text-sm text-[#888888] text-center py-12">Upload a video to populate transcript</p>
              ) : (
                sentences.map((s) => {
                  // Determine if this sentence block is currently active in the play head
                  const isSentenceActive = s.words.some((sw) => {
                    const idx = words.indexOf(sw);
                    return idx === activeIndex;
                  });

                  const isCurrentlyEditing = editingSentenceId === s.id;

                  return (
                    <div 
                      key={s.id} 
                      onClick={() => onSeek(s.start_time)}
                      className={`group p-3.5 rounded-xl flex flex-col gap-2.5 transition-colors cursor-pointer border-l-4 ${
                        isSentenceActive 
                          ? 'bg-fuchsia-600/90 text-white border-fuchsia-800' 
                          : 'bg-[#1f1f1f] text-white/90 border-[#2a2a2a] hover:bg-[#252525]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2">
                          <button 
                            title="Play sentence"
                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                              isSentenceActive ? 'bg-white text-fuchsia-600' : 'bg-[#333] text-white hover:bg-fuchsia-600'
                            }`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                          </button>
                          <span className={`text-[9px] font-mono ${isSentenceActive ? 'text-fuchsia-200' : 'text-[#888888]'}`}>
                            {s.start_time.toFixed(2)}s - {s.end_time.toFixed(2)}s
                          </span>
                        </div>

                        {!isCurrentlyEditing && (
                          <div className="flex gap-1.5">
                            {/* Sentence edit button: nicely sized for mobile tapping */}
                            <button
                              onClick={(e) => handleStartSentenceEdit(s.id, s.text, e)}
                              className="p-1.5 rounded-lg bg-[#333] hover:bg-fuchsia-500 text-white transition-all shrink-0 flex items-center gap-1 text-[9px] font-bold uppercase"
                              title="Edit entire sentence"
                              style={{ minHeight: '32px' }}
                            >
                              <Edit3 className="w-3 h-3" /> Edit Sentence
                            </button>
                          </div>
                        )}
                      </div>

                      {isCurrentlyEditing ? (
                        <div className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                          <textarea 
                            value={editingSentenceText}
                            onChange={e => setEditingSentenceText(e.target.value)}
                            className="w-full bg-black border border-fuchsia-500 rounded-lg p-2 text-xs text-white font-extrabold focus:outline-none resize-none h-16"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSaveSentenceEdit(s.id, s.words);
                              }
                            }}
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setEditingSentenceId(null)}
                              className="px-2 py-1 rounded bg-[#333] text-[10px] font-bold text-[#aaa] uppercase"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => handleSaveSentenceEdit(s.id, s.words)}
                              className="px-2.5 py-1 rounded bg-fuchsia-600 text-[10px] font-black text-white uppercase flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" /> Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {s.words.map((w) => {
                            const isWordActive = words.indexOf(w) === activeIndex;
                            const isWordEditing = editingWordId === w.id;
                            const isSelected = selectedWordIds.has(w.id);

                            if (isWordEditing) {
                              return (
                                <div key={w.id} className="flex items-center gap-1 bg-black border border-fuchsia-500 rounded px-1.5 py-0.5" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={editingWordText}
                                    onChange={e => setEditingWordText(e.target.value)}
                                    className="bg-transparent text-[12px] font-bold text-white w-14 focus:outline-none"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveWordEdit(w.id);
                                    }}
                                  />
                                  <button onClick={() => handleSaveWordEdit(w.id)} className="text-fuchsia-400">
                                    <Check className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            }

                            if (isBulkMode) {
                              return (
                                <span 
                                  key={w.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = new Set(selectedWordIds);
                                    if (next.has(w.id)) {
                                      next.delete(w.id);
                                    } else {
                                      next.add(w.id);
                                    }
                                    setSelectedWordIds(next);
                                  }}
                                  className={`px-2 py-1 rounded text-[13px] font-black tracking-wide border transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1 ${
                                    isSelected
                                      ? 'bg-fuchsia-600 text-white border-fuchsia-400 shadow-md ring-2 ring-fuchsia-500/30'
                                      : 'bg-[#2a2a2a] text-[#ddd] border-[#3a3a3a] hover:border-fuchsia-500/50 hover:text-white'
                                  }`}
                                >
                                  {isSelected && <span className="text-[10px] text-fuchsia-200">✓</span>}
                                  {w.word}
                                </span>
                              );
                            }

                            return (
                              <span 
                                key={w.id}
                                onClick={(e) => handleStartWordEdit(w, e)}
                                className={`px-2 py-1 rounded text-[13px] font-black tracking-wide border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                                  isWordActive 
                                    ? 'bg-yellow-300 text-black border-yellow-400 font-extrabold shadow-sm' 
                                    : 'bg-[#2a2a2a] text-zinc-100 border-[#3a3a3a] hover:border-fuchsia-500/50'
                                }`}
                              >
                                {w.word}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {words.length > 0 && (
              <div className="bg-[#1f1f1f] border border-[#333] rounded-xl p-4 shrink-0 flex flex-col gap-3">
                <div className="text-[11px] font-extrabold uppercase text-[#888888] tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-fuchsia-500 animate-pulse" /> Offline Subtitle Export (100% Free)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      const content = exportToSRT(words, styleSettings.maxWordsPerScreen || 3);
                      triggerDownload(content, 'subtitles.srt', 'text/plain');
                    }}
                    className="py-2.5 px-3 rounded-lg bg-[#2c2c2c] hover:bg-fuchsia-600 text-white font-black text-[10px] uppercase tracking-wide transition-all active:scale-95 border border-[#333] hover:border-transparent cursor-pointer flex items-center justify-center"
                  >
                    Get SRT
                  </button>
                  <button
                    onClick={() => {
                      const content = exportToVTT(words, styleSettings.maxWordsPerScreen || 3);
                      triggerDownload(content, 'subtitles.vtt', 'text/vtt');
                    }}
                    className="py-2.5 px-3 rounded-lg bg-[#2c2c2c] hover:bg-fuchsia-600 text-white font-black text-[10px] uppercase tracking-wide transition-all active:scale-95 border border-[#333] hover:border-transparent cursor-pointer flex items-center justify-center"
                  >
                    Get VTT
                  </button>
                  <button
                    onClick={() => {
                      const content = exportToASS(words, styleSettings.maxWordsPerScreen || 3);
                      triggerDownload(content, 'subtitles.ass', 'text/plain');
                    }}
                    className="py-2.5 px-3 rounded-lg bg-[#2c2c2c] hover:bg-fuchsia-600 text-white font-black text-[10px] uppercase tracking-wide transition-all active:scale-95 border border-[#333] hover:border-transparent cursor-pointer flex items-center justify-center"
                  >
                    Get ASS
                  </button>
                </div>
                <p className="text-[10px] text-[#666] font-semibold text-center uppercase tracking-wide">
                  instant offline download • no upload needed
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
