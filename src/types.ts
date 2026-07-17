export interface CaptionWord {
  id: string;
  word: string;
  start_time: number;
  end_time: number;
}

export type CaptionStyle = string;

export interface SubtitleStyleSettings {
  preset: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  highlightColor: string;
  capitalization: 'all' | 'lower' | 'sentence' | 'none';
  showBackground: boolean;
  showSpotlight: boolean;
  showBacklight: boolean;
  showShadow: boolean;
  alignment: 'left' | 'center' | 'right';
  positionX: number;
  positionY: number;
  rotation: number;
  maxWordsPerScreen: number;
  showEmojis: boolean;
  showPunctuation: boolean;
  emojiStyle: 'none' | 'emotions' | 'vibes' | 'objects' | 'energetic' | 'minimal' | 'custom' | 'auto';
}

export interface AppState {
  videoUrl: string | null;
  videoFile: File | null;
  serverFilename?: string | null;
  words: CaptionWord[];
  activeStyle: CaptionStyle;
  isTransliterating: boolean;
  isProcessing: boolean;
  currentTime: number;
  uploadProgress: number;
  logs: string[];
  styleSettings: SubtitleStyleSettings;
  hasFailed?: boolean;
  lastUploadParams?: {
    file: File;
    language: string;
    useEmojis: boolean;
    translationMode: string;
    usePunctuation: boolean;
    emojiStyle: any;
    preExtractedAudioBlob?: Blob | null;
  } | null;
}