import { SubtitleStyleSettings } from '../types';

export interface Preset {
  id: string;
  name: string;
  emoji: string;
  category: string;
  settings: Partial<SubtitleStyleSettings>;
}

export const presets: Preset[] = [
  // BOUNCE & ENERGETIC
  {
    id: 'bounce',
    name: 'Bounce Pop',
    emoji: '🎈',
    category: 'energetic',
    settings: {
      preset: 'bounce',
      fontFamily: 'Fredoka',
      fontSize: 0.6,
      textColor: '#FFFFFF',
      highlightColor: '#FF2D95',
      capitalization: 'sentence',
      showBackground: true,
      showSpotlight: false,
      showBacklight: true,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'jelly',
    name: 'Jelly Pop',
    emoji: '🪼',
    category: 'energetic',
    settings: {
      preset: 'jelly',
      fontFamily: 'Fredoka',
      fontSize: 0.55,
      textColor: '#FFFFFF',
      highlightColor: '#A855F7',
      capitalization: 'sentence',
      showBackground: true,
      showSpotlight: false,
      showBacklight: true,
      showShadow: false,
      rotation: 2,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'shake',
    name: 'Shake It',
    emoji: '💥',
    category: 'energetic',
    settings: {
      preset: 'shake',
      fontFamily: 'Impact',
      fontSize: 0.5,
      textColor: '#FFFFFF',
      highlightColor: '#FF0000',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: true,
      showBacklight: false,
      showShadow: false,
      rotation: -3,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'beast',
    name: 'Beast Mode',
    emoji: '🦁',
    category: 'energetic',
    settings: {
      preset: 'beast',
      fontFamily: 'Impact',
      fontSize: 0.65,
      textColor: '#FFFFFF',
      highlightColor: '#FF6B00',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'wave',
    name: 'Wave Rider',
    emoji: '🌊',
    category: 'energetic',
    settings: {
      preset: 'wave',
      fontFamily: 'Fredoka',
      fontSize: 0.5,
      textColor: '#FFFFFF',
      highlightColor: '#3B82F6',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      showShadow: false,
      rotation: 1,
      maxWordsPerScreen: 4
    }
  },
  {
    id: 'pop',
    name: 'Pop Art',
    emoji: '🎨',
    category: 'energetic',
    settings: {
      preset: 'pop',
      fontFamily: 'Fredoka',
      fontSize: 0.55,
      textColor: '#000000',
      highlightColor: '#FFEB3B',
      capitalization: 'all',
      showBackground: true,
      showSpotlight: false,
      showBacklight: false,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'glitch',
    name: 'Glitch Core',
    emoji: '👾',
    category: 'energetic',
    settings: {
      preset: 'glitch',
      fontFamily: 'Impact',
      fontSize: 0.5,
      textColor: '#00FF9F',
      highlightColor: '#FF00FF',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: true,
      showBacklight: false,
      showShadow: false,
      rotation: -2,
      maxWordsPerScreen: 2
    }
  },
  {
    id: 'skew',
    name: 'Skew Bold',
    emoji: '📐',
    category: 'energetic',
    settings: {
      preset: 'skew',
      fontFamily: 'Impact',
      fontSize: 0.6,
      textColor: '#FFFFFF',
      highlightColor: '#00E5FF',
      capitalization: 'all',
      showBackground: false,
      showSpotlight: false,
      showBacklight: true,
      showShadow: false,
      rotation: 4,
      maxWordsPerScreen: 3
    }
  },
  {
    id: 'shimmer',
    name: 'Shimmer Glow',
    emoji: '✨',
    category: 'energetic',
    settings: {
      preset: 'shimmer',
      fontFamily: 'Space Grotesk',
      fontSize: 0.5,
      textColor: '#FFFFFF',
      highlightColor: '#FFD700',
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
    id: 'reveal',
    name: 'Reveal Slide',
    emoji: '🎭',
    category: 'energetic',
    settings: {
      preset: 'reveal',
      fontFamily: 'Inter',
      fontSize: 0.5,
      textColor: '#FFFFFF',
      highlightColor: '#8B5CF6',
      capitalization: 'sentence',
      showBackground: false,
      showSpotlight: false,
      showBacklight: false,
      showShadow: false,
      rotation: 0,
      maxWordsPerScreen: 5
    }
  },

  // CINEMATIC CATEGORY
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

  // ANIME & POP CATEGORY
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
  }
];
