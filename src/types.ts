export interface CaptionWord {
  id: string;
  word: string;
  start_time: number;
  end_time: number;
  start_ms?: number;
  end_ms?: number;
  pause_after_ms?: number;
  is_hotword?: boolean;
  is_question?: boolean;
  is_expression?: boolean;
  is_name?: boolean;
  is_sentence_end?: boolean;
  emotion_tone?: string;
  emoji?: string | null;
  highlight?: boolean;
}

export type CaptionStyle = string;

export interface SubtitleStyleSettings {
  preset: string;
  fontFamily: string;
  fontSize: number; // scaling factor, default 1.0 (equivalent to text-4xl/5xl)
  textColor: string;
  highlightColor: string;
  capitalization: 'all' | 'lower' | 'sentence' | 'none';
  showBackground: boolean;
  showSpotlight: boolean;
  showBacklight: boolean;
  showShadow: boolean;
  alignment: 'left' | 'center' | 'right';
  positionX: number; // pixel offset X from center
  positionY: number; // pixel offset Y from bottom
  rotation: number; // angle in degrees
  maxWordsPerScreen: number; // number of words to show together
  showEmojis: boolean;
  showPunctuation: boolean;
  emojiStyle: 'none' | 'emotions' | 'vibes' | 'objects' | 'energetic' | 'minimal' | 'custom' | 'auto';
}

export interface ProcessingStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime?: number;
  durationMs?: number;
  error?: string;
}

export interface DubbingVoice {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  language: string;
  accent?: string;
  description: string;
  tags: string[];
  emoji: string;
  provider: 'gemini' | 'standard' | 'neural';
  previewAudioUrl?: string;
  pitch?: number;
  rate?: number;
}

export interface DubbingSettings {
  enabled: boolean;
  targetLanguage: string;
  voiceId: string;
  emotion: 'natural' | 'excited' | 'emotional' | 'sad' | 'angry' | 'sarcastic' | 'surprised' | 'storyteller';
  speechRate: number; // 0.5 - 2.0 (1.0 default)
  speechPitch: number; // 0.5 - 2.0 (1.0 default)
  naturalFillers: boolean; // include "umm", "uh", natural pauses
  fitOriginalDuration: boolean; // optimize generated speech to fit original media duration
}

export interface MediaProbeInfo {
  durationSeconds: number;
  durationMs: number;
  isAudioOnly: boolean;
  format: string;
  channels?: number;
  sampleRate?: number;
  fileSizeBytes: number;
  fileName: string;
}

export interface PipelineIntermediateCache {
  sessionId: string;
  mediaFile: File;
  mediaInfo?: MediaProbeInfo;
  extractedAudioBlob?: Blob;
  gemini35Transcript?: {
    words: CaptionWord[];
    detectedLanguage: string;
    rawText: string;
  };
  deepgramOriginalTimestamps?: {
    words: any[];
    detectedLanguage: string;
  };
  alignedMasterTranscript?: {
    words: CaptionWord[];
    detectedLanguage: string;
  };
  gemini36FlashOutput?: {
    words: CaptionWord[];
    translatedText?: string;
    detectedLanguage?: string;
  };
  dubbedAudioBlob?: Blob;
  dubbedAudioUrl?: string;
  deepgramDubbedTimestamps?: {
    words: any[];
  };
}

export interface AppState {
  videoUrl: string | null;
  videoFile: File | null;
  audioFile: File | null;
  isAudioOnly?: boolean;
  serverFilename?: string | null;
  words: CaptionWord[];
  activeStyle: CaptionStyle;
  isTransliterating: boolean;
  isProcessing: boolean;
  currentTime: number;
  uploadProgress: number;
  logs: string[];
  styleSettings: SubtitleStyleSettings;
  dubbingSettings: DubbingSettings;
  activeModel?: string;
  hasFailed?: boolean;
  processingSteps?: ProcessingStep[];
  processingStartTime?: number | null;
  mediaDurationSeconds?: number;
  dubbedAudioUrl?: string | null;
  sessionCache?: PipelineIntermediateCache | null;
  lastUploadParams?: {
    file: File;
    language: string;
    useEmojis: boolean;
    translationMode: string;
    usePunctuation: boolean;
    emojiStyle: any;
    enableHotwords?: boolean;
    preExtractedAudioBlob?: Blob | null;
    dubbingSettings?: DubbingSettings;
  } | null;
}
