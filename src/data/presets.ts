import { SubtitleStyleSettings } from '../types';

export interface Preset {
  id: string;
  name: string;
  emoji: string;
  category: string;
  settings: Partial<SubtitleStyleSettings>;
}

export const presets: Preset[] = [
  { id: 'bounce', name: 'Bounce Pop', emoji: '🎈', category: 'energetic', settings: { preset: 'bounce', fontFamily: 'Fredoka', fontSize: 0.6, textColor: '#FFFFFF', highlightColor: '#FF2D95', capitalization: 'sentence', showBackground: true, showSpotlight: false, showBacklight: true, showShadow: false, rotation: 0, maxWordsPerScreen: 4 } }
];