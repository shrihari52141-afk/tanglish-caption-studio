export interface PresetStyle {
  id: string;
  name: string;
  emoji: string;
  category: string;
  settings: {
    preset: string;
    fontFamily: string;
    textColor: string;
    highlightColor: string;
    capitalization: 'all' | 'lower' | 'sentence' | 'none';
    showBackground: boolean;
    showSpotlight: boolean;
    showBacklight: boolean;
    rotation: number;
    maxWordsPerScreen: number;
  };
}

export const STYLE_CATEGORIES = [
  { id: 'all', name: 'All Styles 📱' },
  { id: 'viral', name: 'Viral Shorts 🔥' },
  { id: 'gamer', name: 'Gamer 🎮' },
  { id: 'creative', name: 'Creative ✨' },
  { id: 'clean', name: 'Minimal 📝' },
  { id: 'cinematic', name: 'Cinematic 🎬' },
  { id: 'anime', name: 'Anime & Pop 🌸' },
  { id: 'remotion', name: 'Remotion 🎯' }
];

export const PRESETS: PresetStyle[] = [
  // --- VIRAL SHORTS CATEGORY (10 Presets) ---
  {
    id: 'mrbeast',
    name: 'Beast Mode',
    emoji: '🔥',
    category: 'viral',
    settings: {
      preset: 'beast',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: -3,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'hormozi',
    name: 'Hormozi Punch',
    emoji: '💪',
    category: 'viral',
    settings: {
      preset: 'pop',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#00FF00',
      capitalization: 'all',
      showBackground: true,
      showSpotlight: true,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'pineda',
    name: 'Ryan Pineda',
    emoji: '🏠',
    category: 'viral',
    settings: {
      preset: 'bounce',
      fontFamily: 'Fredoka',
      textColor: '#FFFFFF',
      highlightColor: '#F472B6', // pink highlight as default
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 2,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'abdaal',
    name: 'Ali Abdaal',
    emoji: '☕',
    category: 'viral',
    settings: {
      preset: 'reveal',
      fontFamily: 'Space Grotesk',
      textColor: '#F4F4F5',
      highlightColor: '#38BDF8',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: true,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'cardone',
    name: '10X Cardone',
    emoji: '📈',
    category: 'viral',
    settings: {
      preset: 'skew',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: -5,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'garyvee',
    name: 'Hustle Gary',
    emoji: '📢',
    category: 'viral',
    settings: {
      preset: 'shake',
      fontFamily: 'Inter',
      textColor: '#FFFFFF',
      highlightColor: '#F472B6',
      capitalization: 'all',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      rotation: 4,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'gadzhi',
    name: 'Iman Wealth',
    emoji: '👑',
    category: 'viral',
    settings: {
      preset: 'zoom',
      fontFamily: 'Space Grotesk',
      textColor: '#E4E4E7',
      highlightColor: '#FB7185',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: true,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'mfm',
    name: 'Millionaire Pod',
    emoji: '🎙️',
    category: 'viral',
    settings: {
      preset: 'jelly',
      fontFamily: 'Fredoka',
      textColor: '#FFFFFF',
      highlightColor: '#F97316',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: -2,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'stephan',
    name: 'Graham Coffee',
    emoji: '💵',
    category: 'viral',
    settings: {
      preset: 'pop',
      fontFamily: 'Inter',
      textColor: '#FFFFFF',
      highlightColor: '#00FF00',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'viral_hook',
    name: 'Sema Viral',
    emoji: '⚡',
    category: 'viral',
    settings: {
      preset: 'beast',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#F472B6',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 3,
      maxWordsPerScreen: 3
    }
  },

  // --- GAMER CATEGORY (10 Presets) ---
  {
    id: 'cyber_glitch',
    name: 'Cyber Glitch',
    emoji: '🤖',
    category: 'gamer',
    settings: {
      preset: 'glitch',
      fontFamily: 'Courier',
      textColor: '#FFFFFF',
      highlightColor: '#00FF00',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'fortnite',
    name: 'Battle Royale',
    emoji: '🔫',
    category: 'gamer',
    settings: {
      preset: 'zoom',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#C026D3',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 4,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'minecraft',
    name: 'Block Craft',
    emoji: '🧱',
    category: 'gamer',
    settings: {
      preset: 'basic',
      fontFamily: 'Courier',
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      capitalization: 'all',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'gta_v',
    name: 'San Andreas',
    emoji: '🚗',
    category: 'gamer',
    settings: {
      preset: 'skew',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#00FF00',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: -4,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'warzone',
    name: 'Gulag Combat',
    emoji: '🪖',
    category: 'gamer',
    settings: {
      preset: 'shake',
      fontFamily: 'Courier',
      textColor: '#D4D4D8',
      highlightColor: '#FB7185',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: true,
      showBacklight: false,
      rotation: 1,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'retro_arcade',
    name: '8-Bit Arcade',
    emoji: '👾',
    category: 'gamer',
    settings: {
      preset: 'glitch',
      fontFamily: 'Courier',
      textColor: '#00FFFF',
      highlightColor: '#FF00FF',
      capitalization: 'all',
      showBackground: true,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'twitch_active',
    name: 'Twitch Sub',
    emoji: '🟣',
    category: 'gamer',
    settings: {
      preset: 'jelly',
      fontFamily: 'Space Grotesk',
      textColor: '#FFFFFF',
      highlightColor: '#C026D3',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'esport_pro',
    name: 'Esport Arena',
    emoji: '🏆',
    category: 'gamer',
    settings: {
      preset: 'skew',
      fontFamily: 'Space Grotesk',
      textColor: '#FFFFFF',
      highlightColor: '#38BDF8',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: -3,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'valorant',
    name: 'Radiant Glow',
    emoji: '🎯',
    category: 'gamer',
    settings: {
      preset: 'fire',
      fontFamily: 'Space Grotesk',
      textColor: '#F43F5E',
      highlightColor: '#FFFFFF',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'speedrun',
    name: 'Speed Runner',
    emoji: '🏃',
    category: 'gamer',
    settings: {
      preset: 'shake',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#FF9900',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: -2,
      maxWordsPerScreen: 2
    }
  },

  // --- CREATIVE CATEGORY (10 Presets) ---
  {
    id: 'super_bounce',
    name: 'Super Bounce',
    emoji: '✨',
    category: 'creative',
    settings: {
      preset: 'bounce',
      fontFamily: 'Fredoka',
      textColor: '#FFFFFF',
      highlightColor: '#F472B6',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'cosmic_glow',
    name: 'Cosmic Glow',
    emoji: '🌌',
    category: 'creative',
    settings: {
      preset: 'neon',
      fontFamily: 'Space Grotesk',
      textColor: '#FFFFFF',
      highlightColor: '#38BDF8',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'rainbow_magic',
    name: 'Rainbow Wave',
    emoji: '🌈',
    category: 'creative',
    settings: {
      preset: 'shimmer',
      fontFamily: 'Fredoka',
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'lava_flow',
    name: 'Lava Glow',
    emoji: '🌋',
    category: 'creative',
    settings: {
      preset: 'fire',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#FF3300',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: -2,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'fireworks',
    name: 'Boom Flash',
    emoji: '🎆',
    category: 'creative',
    settings: {
      preset: 'pop',
      fontFamily: 'Impact',
      textColor: '#FFFF00',
      highlightColor: '#FF00FF',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 3,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'jelly_bean',
    name: 'Jelly Candy',
    emoji: '🍬',
    category: 'creative',
    settings: {
      preset: 'jelly',
      fontFamily: 'Fredoka',
      textColor: '#FFFFFF',
      highlightColor: '#00FFCC',
      capitalization: 'sentence',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      rotation: 2,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'magic_wand',
    name: 'Magic Fairy',
    emoji: '🪄',
    category: 'creative',
    settings: {
      preset: 'reveal',
      fontFamily: 'Space Grotesk',
      textColor: '#FFFFFF',
      highlightColor: '#F472B6',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'liquid_gold',
    name: 'Liquid Gold',
    emoji: '⚜️',
    category: 'creative',
    settings: {
      preset: 'zoom',
      fontFamily: 'Impact',
      textColor: '#FACC15',
      highlightColor: '#FFFFFF',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'toxic_green',
    name: 'Acid Toxic',
    emoji: '☣️',
    category: 'creative',
    settings: {
      preset: 'glitch',
      fontFamily: 'Courier',
      textColor: '#00FF00',
      highlightColor: '#FFFF00',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: -1,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'pink_dream',
    name: 'Pink Dream',
    emoji: '🦄',
    category: 'creative',
    settings: {
      preset: 'bounce',
      fontFamily: 'Fredoka',
      textColor: '#FFFFFF',
      highlightColor: '#FF66CC',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },

  // --- MINIMAL CATEGORY (10 Presets) ---
  {
    id: 'minimal_slate',
    name: 'Minimal Slate',
    emoji: '📝',
    category: 'clean',
    settings: {
      preset: 'basic',
      fontFamily: 'Inter',
      textColor: '#A1A1AA',
      highlightColor: '#FFFFFF',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: true,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'editorial_serif',
    name: 'Editorial Serif',
    emoji: '📰',
    category: 'clean',
    settings: {
      preset: 'reveal',
      fontFamily: 'Inter',
      textColor: '#D4D4D8',
      highlightColor: '#FFFFFF',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'modern_helvetica',
    name: 'Helvetica Pro',
    emoji: '📐',
    category: 'clean',
    settings: {
      preset: 'pop',
      fontFamily: 'Inter',
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'medium_sans',
    name: 'Medium Clean',
    emoji: '💬',
    category: 'clean',
    settings: {
      preset: 'basic',
      fontFamily: 'Space Grotesk',
      textColor: '#E4E4E7',
      highlightColor: '#38BDF8',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'dark_mode',
    name: 'Oled Dark',
    emoji: '🖤',
    category: 'clean',
    settings: {
      preset: 'basic',
      fontFamily: 'Inter',
      textColor: '#52525B',
      highlightColor: '#FFFFFF',
      capitalization: 'none',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'paper_sheet',
    name: 'Notebook Desk',
    emoji: '📄',
    category: 'clean',
    settings: {
      preset: 'reveal',
      fontFamily: 'Courier',
      textColor: '#888888',
      highlightColor: '#000000',
      capitalization: 'none',
      showBackground: true,
      showSpotlight: true,
      showBacklight: false,
      rotation: 1,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'subtitle_pro',
    name: 'Subtitle Pro',
    emoji: '📺',
    category: 'clean',
    settings: {
      preset: 'basic',
      fontFamily: 'Inter',
      textColor: '#FFFFFF',
      highlightColor: '#FFFF00',
      capitalization: 'none',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 5
    }
  },
  {
    id: 'mono_tech',
    name: 'Terminal Tech',
    emoji: '💻',
    category: 'clean',
    settings: {
      preset: 'basic',
      fontFamily: 'Courier',
      textColor: '#00FF00',
      highlightColor: '#FFFFFF',
      capitalization: 'lower',
      showBackground: false,
      showSpotlight: true,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'std_white',
    name: 'Classic White',
    emoji: '⚪',
    category: 'clean',
    settings: {
      preset: 'basic',
      fontFamily: 'Inter',
      textColor: '#FFFFFF',
      highlightColor: '#FFFFFF',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'soft_pastel',
    name: 'Soft Lavender',
    emoji: '🪻',
    category: 'clean',
    settings: {
      preset: 'reveal',
      fontFamily: 'Space Grotesk',
      textColor: '#A78BFA',
      highlightColor: '#F472B6',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },

  // --- CINEMATIC CATEGORY (10 Presets) ---
  {
    id: 'movie_trailer',
    name: 'Blockbuster',
    emoji: '🎥',
    category: 'cinematic',
    settings: {
      preset: 'zoom',
      fontFamily: 'Impact',
      textColor: '#E4E4E7',
      highlightColor: '#FFD700',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'classic_yellow',
    name: 'Cinema Yellow',
    emoji: '🟡',
    category: 'cinematic',
    settings: {
      preset: 'basic',
      fontFamily: 'Inter',
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'letterbox',
    name: 'Widescreen',
    emoji: '🎞️',
    category: 'cinematic',
    settings: {
      preset: 'reveal',
      fontFamily: 'Inter',
      textColor: '#CCCCCC',
      highlightColor: '#E2E8F0',
      capitalization: 'sentence',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 5
    }
  },
  {
    id: 'neon_noir',
    name: 'Neon Noir',
    emoji: '🌃',
    category: 'cinematic',
    settings: {
      preset: 'neon',
      fontFamily: 'Space Grotesk',
      textColor: '#E2E8F0',
      highlightColor: '#EC4899',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'director_cut',
    name: 'Directors Cut',
    emoji: '🎬',
    category: 'cinematic',
    settings: {
      preset: 'pop',
      fontFamily: 'Courier',
      textColor: '#FFFFFF',
      highlightColor: '#E11D48',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: true,
      showBacklight: false,
      rotation: -1,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'vintage_film',
    name: 'Vintage Film',
    emoji: '🎞️',
    category: 'cinematic',
    settings: {
      preset: 'shake',
      fontFamily: 'Courier',
      textColor: '#D4AF37',
      highlightColor: '#F5F5DC',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 1,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'true_crime',
    name: 'True Crime',
    emoji: '🕵️',
    category: 'cinematic',
    settings: {
      preset: 'glitch',
      fontFamily: 'Impact',
      textColor: '#B91C1C',
      highlightColor: '#FFFFFF',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: true,
      showBacklight: false,
      rotation: -3,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'documentary',
    name: 'History Doc',
    emoji: '🏛️',
    category: 'cinematic',
    settings: {
      preset: 'reveal',
      fontFamily: 'Inter',
      textColor: '#E5E7EB',
      highlightColor: '#F59E0B',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'sepia',
    name: 'Sepia Nostalgia',
    emoji: '🤎',
    category: 'cinematic',
    settings: {
      preset: 'basic',
      fontFamily: 'Courier',
      textColor: '#C2593F',
      highlightColor: '#F5DEB3',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'cyberpunk_city',
    name: 'Neon Cyber',
    emoji: '🌆',
    category: 'cinematic',
    settings: {
      preset: 'neon',
      fontFamily: 'Space Grotesk',
      textColor: '#FFFF00',
      highlightColor: '#00FFFF',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },

  // --- ANIME & POP CATEGORY (10 Presets) ---
  {
    id: 'kawaii_pink',
    name: 'Kawaii Pink',
    emoji: '🌸',
    category: 'anime',
    settings: {
      preset: 'bounce',
      fontFamily: 'Fredoka',
      textColor: '#FFFFFF',
      highlightColor: '#F472B6',
      capitalization: 'sentence',
      showBackground: true,
      showSpotlight: false,
      showBacklight: true,
      rotation: 3,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'manga_ink',
    name: 'Manga Ink',
    emoji: '✒️',
    category: 'anime',
    settings: {
      preset: 'skew',
      fontFamily: 'Impact',
      textColor: '#000000',
      highlightColor: '#FFFFFF',
      capitalization: 'all',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      rotation: -4,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'comic_book',
    name: 'Comic Pow',
    emoji: '💥',
    category: 'anime',
    settings: {
      preset: 'shake',
      fontFamily: 'Impact',
      textColor: '#FFFF00',
      highlightColor: '#FF0000',
      capitalization: 'all',
      showBackground: true,
      showSpotlight: false,
      showBacklight: true,
      rotation: 5,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'pixel_art',
    name: 'Pixel Quest',
    emoji: '👾',
    category: 'anime',
    settings: {
      preset: 'basic',
      fontFamily: 'Courier',
      textColor: '#38BDF8',
      highlightColor: '#FACC15',
      capitalization: 'lower',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'holo_glim',
    name: 'Holo Sparkle',
    emoji: '✨',
    category: 'anime',
    settings: {
      preset: 'shimmer',
      fontFamily: 'Space Grotesk',
      textColor: '#FFFFFF',
      highlightColor: '#F472B6',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'disco_fever',
    name: 'Disco Pop',
    emoji: '🪩',
    category: 'anime',
    settings: {
      preset: 'jelly',
      fontFamily: 'Fredoka',
      textColor: '#FACC15',
      highlightColor: '#EC4899',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 4,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'graffiti_tag',
    name: 'Graffiti Tag',
    emoji: '🎨',
    category: 'anime',
    settings: {
      preset: 'skew',
      fontFamily: 'Impact',
      textColor: '#00FF00',
      highlightColor: '#C026D3',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: -5,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'cotton_candy',
    name: 'Cotton Candy',
    emoji: '☁️',
    category: 'anime',
    settings: {
      preset: 'bounce',
      fontFamily: 'Fredoka',
      textColor: '#E0F2FE',
      highlightColor: '#FCE7F3',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: 2,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'pastel_wave',
    name: 'Pastel Wave',
    emoji: '🌊',
    category: 'anime',
    settings: {
      preset: 'wave',
      fontFamily: 'Fredoka',
      textColor: '#F3E8FF',
      highlightColor: '#CCFBF1',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      rotation: -2,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'shonen_power',
    name: 'Shonen Strike',
    emoji: '⚔️',
    category: 'anime',
    settings: {
      preset: 'beast',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#FF6600',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      rotation: -3,
      maxWordsPerScreen: 2
    }
  },
  // ── Remotion Caption Themes (from vshukla7/remotion-captions-themes) ──
  {
    id: 'remotion_pop',
    name: 'Remotion Pop',
    emoji: '🎯',
    category: 'remotion',
    settings: {
      preset: 'pop',
      fontFamily: 'Inter',
      textColor: '#FFFFFF',
      highlightColor: '#F59E0B',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      showShadow: true,
      rotation: 0,
      maxWordsPerScreen: 6
    }
  },
  {
    id: 'remotion_karaoke',
    name: 'Karaoke',
    emoji: '🎤',
    category: 'remotion',
    settings: {
      preset: 'bounce',
      fontFamily: 'Inter',
      textColor: '#CCCCCC',
      highlightColor: '#F472B6',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: true,
      showBacklight: false,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 5
    }
  },
  {
    id: 'remotion_hustle',
    name: 'Hustle',
    emoji: '💼',
    category: 'remotion',
    settings: {
      preset: 'bounce',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#22C55E',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      showShadow: true,
      rotation: 2,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'remotion_grape',
    name: 'Grape',
    emoji: '🍇',
    category: 'remotion',
    settings: {
      preset: 'bounce',
      fontFamily: 'Inter',
      textColor: '#111827',
      highlightColor: '#A855F7',
      capitalization: 'all',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 5
    }
  },
  {
    id: 'remotion_beast',
    name: 'MrBeast Bold',
    emoji: '🦁',
    category: 'remotion',
    settings: {
      preset: 'beast',
      fontFamily: 'Impact',
      textColor: '#FFFFFF',
      highlightColor: '#FFD700',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      showShadow: true,
      rotation: -2,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'remotion_poppin',
    name: 'Poppin',
    emoji: '💜',
    category: 'remotion',
    settings: {
      preset: 'basic',
      fontFamily: 'Inter',
      textColor: '#FFFFFF',
      highlightColor: '#EC4899',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      showShadow: true,
      rotation: 0,
      maxWordsPerScreen: 6
    }
  },
  {
    id: 'remotion_aarit',
    name: 'Aarit Cinematic',
    emoji: '🎬',
    category: 'remotion',
    settings: {
      preset: 'neon',
      fontFamily: 'Playfair Display',
      textColor: '#FFFFFF',
      highlightColor: '#FBBF24',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'remotion_soft_ai',
    name: 'Soft AI',
    emoji: '🌫️',
    category: 'remotion',
    settings: {
      preset: 'neon',
      fontFamily: 'Inter',
      textColor: '#E2E8F0',
      highlightColor: '#93C5FD',
      capitalization: 'none',
      showBackground: true,
      showSpotlight: false,
      showBacklight: true,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 5
    }
  },
  {
    id: 'remotion_gaming_stream',
    name: 'Gaming Stream',
    emoji: '🎮',
    category: 'remotion',
    settings: {
      preset: 'glitch',
      fontFamily: 'Inter',
      textColor: '#00FF00',
      highlightColor: '#FF4500',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'remotion_simple_one_word',
    name: 'One Word',
    emoji: '👁️',
    category: 'remotion',
    settings: {
      preset: 'basic',
      fontFamily: 'Fredoka',
      textColor: '#FFFFFF',
      highlightColor: '#F59E0B',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 1
    }
  },
  {
    id: 'remotion_kinetic01',
    name: 'Kinetic Flow',
    emoji: '🌀',
    category: 'remotion',
    settings: {
      preset: 'bounce',
      fontFamily: 'Space Grotesk',
      textColor: '#E2E8F0',
      highlightColor: '#06B6D4',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'remotion_kinetic02',
    name: 'Kinetic Pulse',
    emoji: '⚡',
    category: 'remotion',
    settings: {
      preset: 'pop',
      fontFamily: 'Space Grotesk',
      textColor: '#FFFFFF',
      highlightColor: '#F97316',
      capitalization: 'none',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      showShadow: true,
      rotation: 1,
      maxWordsPerScreen: 5
    }
  },
  {
    id: 'remotion_podcast',
    name: 'Podcast',
    emoji: '🎙️',
    category: 'remotion',
    settings: {
      preset: 'basic',
      fontFamily: 'Inter',
      textColor: '#F8FAFC',
      highlightColor: '#A78BFA',
      capitalization: 'none',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 6
    }
  }
];
