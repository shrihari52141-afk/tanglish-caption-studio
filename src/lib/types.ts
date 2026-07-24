export interface WordTiming {
  id: string
  text: string
  start_time: number
  end_time: number
  start_ms: number
  end_ms: number
  pause_after_ms: number
  holdUntil: number
  is_sentence_end: boolean
  is_hotword: boolean
  emoji: string
}

export interface TranscriptionResult {
  language: string
  duration_seconds: number
  words: WordTiming[]
}

export interface CaptionLine {
  id: string
  words: WordTiming[]
  startTime: number
  endTime: number
}

export interface StyleSettings {
  preset: string
  textColor: string
  highlightColor: string
  fontFamily: string
  fontSize: number
  fontScale: number
  showBackground: boolean
  showBacklight: boolean
  showShadow: boolean
  capitalization: 'sentence' | 'UPPERCASE' | 'lowercase' | 'Title Case'
  offsetX: number
  offsetY: number
  rotation: number
}

export interface ProjectState {
  words: WordTiming[]
  style: StyleSettings
  sourceLanguage: string
  scriptMode: string
  translationTarget: string
  useEmojis: boolean
  emojiStyle: string
  usePunctuation: boolean
  model: string
  videoName: string
}

export const PRESETS = ['bounce', 'pop', 'beast', 'glitch', 'neon'] as const
export const FONTS = ['Inter', 'Montserrat', 'Outfit', 'Bungee', 'Permanent Marker', 'Roboto'] as const
export const CAPITALIZATIONS = ['sentence', 'UPPERCASE', 'lowercase', 'Title Case'] as const

export const LANGUAGES = [
  'Auto Detect', 'Tamil', 'Hindi', 'English', 'Kannada', 'Telugu', 'Malayalam',
  'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Odia', 'Assamese', 'Urdu',
  'Sanskrit', 'Korean', 'Japanese', 'Chinese', 'Spanish', 'French', 'German',
  'Portuguese', 'Italian', 'Russian', 'Arabic', 'Turkish'
] as const

export const TRANSLATION_MODES = [
  'Keep Original',
  'Translate to English',
  'Translate to Tamil',
  'Translate to Hindi',
  'Translate to Kannada',
  'Translate to Telugu',
  'Translate to Malayalam',
  'Translate to Spanish',
  'Translate to French',
  'Translate to German'
] as const

export const SCRIPT_MODES = ['TRANSLITERATION_ROMAN', 'TRANSCRIPTION_NATIVE', 'TRANSLATION'] as const
export const EMOJI_STYLES = ['Vibes', 'Minimal', 'Hype', 'Sarcastic'] as const
export const MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview'
] as const

export const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5] as const

export const DEFAULT_STYLE: StyleSettings = {
  preset: 'bounce',
  textColor: '#ffffff',
  highlightColor: '#6c5ce7',
  fontFamily: 'Inter',
  fontSize: 36,
  fontScale: 1.0,
  showBackground: true,
  showBacklight: true,
  showShadow: false,
  capitalization: 'sentence',
  offsetX: 0,
  offsetY: 0,
  rotation: 0
}