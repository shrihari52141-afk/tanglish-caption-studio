// src/lib/captionEngine.ts
// ═══════════════════════════════════════════════════════
//  HOLD ALGORITHM + WORD SYNC ENGINE
//  Fixes: purple early jump, silence hold, hotword glow
//  Works with: Gemini 3.5 Flash output
// ═══════════════════════════════════════════════════════

export interface Word {
  word: string;
  start_ms: number;
  end_ms: number;
  pause_after_ms: number;
  is_hotword: boolean;
  is_name: boolean;
  is_sentence_end: boolean;
  emotion_tone: string;
  emoji: string | null;
}

export interface CaptionData {
  audio_duration_ms: number;
  roman: Word[];
  english: Word[];
}

// ═══════════════════════════════════════════════════════
//  THE HOLD ALGORITHM
//  Replaces: index++ every 500ms (BROKEN)
//  With:     time-based lookup with silence hold (CORRECT)
//
//  Example: "hi" [2sec silence] "my"
//    hi:  start=100, end=350, pause_after=2000
//    → holdUntil = 350 + 2000 = 2350ms
//    → highlight STAYS on "hi" until 2350ms
//    → "my" starts at 2350ms → highlight moves
// ═══════════════════════════════════════════════════════
export function getActiveIndex(track: Word[], timeMs: number): number {
  for (let i = 0; i < track.length; i++) {
    const w = track[i];
    const holdUntil = w.end_ms + w.pause_after_ms;
    if (timeMs >= w.start_ms && timeMs < holdUntil) return i;
  }
  return -1;
}

// ═══════════════════════════════════════════════════════
//  SERVER → v11 CONVERTER
//  Your server returns: { word, start_time, end_time } in SECONDS
//  This converts to v11 Word format with pause_after_ms
// ═══════════════════════════════════════════════════════
export function serverToV11(
  serverWords: Array<{ word: string; start_time: number; end_time: number }>,
  hotwords: string[] = [],
  names: string[] = []
): Word[] {
  return serverWords.map((sw, i) => {
    const start_ms = Math.round(sw.start_time * 1000);
    const end_ms = Math.round(sw.end_time * 1000);
    const nextStart =
      i < serverWords.length - 1
        ? Math.round(serverWords[i + 1].start_time * 1000)
        : end_ms;
    const pause_after_ms =
      i === serverWords.length - 1 ? 0 : Math.max(0, nextStart - end_ms);
    const wl = sw.word.toLowerCase().replace(/[^a-z]/g, "");

    return {
      word: sw.word,
      start_ms,
      end_ms,
      pause_after_ms,
      is_hotword: hotwords.some((h) => wl.includes(h.toLowerCase())),
      is_name: names.some((n) => wl.includes(n.toLowerCase())),
      is_sentence_end: /[.!?]$/.test(sw.word.trim()),
      emotion_tone: "casual_explaining",
      emoji: null,
    };
  });
}

// ═══════════════════════════════════════════════════════
//  EMOJI ASSIGNMENT (Physics Law #6)
// ═══════════════════════════════════════════════════════
const EMOJI_MAP: Record<string, string> = {
  gossip_backstabbing: "🗣️",
  betrayal_hurt: "💔",
  family_emotional: "👨‍👩‍👧",
  angry_frustrated: "😤",
  casual_explaining: "💡",
  question: "🤔",
  torture: "⛓️",
  society: "🏘️",
};

export function assignEmojis(words: Word[]): Word[] {
  return words.map((w) => ({
    ...w,
    emoji: w.is_sentence_end ? EMOJI_MAP[w.emotion_tone] || "💡" : null,
  }));
}

// ═══════════════════════════════════════════════════════
//  TIMESTAMP VALIDATION (Physics Law #1)
// ═══════════════════════════════════════════════════════
export function validateTimestamps(words: Word[]): boolean {
  if (!words?.length) return false;
  if (words[0].start_ms < 0) return false;
  for (let i = 1; i < words.length; i++) {
    if (words[i].start_ms < words[i - 1].end_ms) return false;
    if (words[i].start_ms >= words[i].end_ms) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════
//  HOTWORD LIST — Maa Behen Video
// ═══════════════════════════════════════════════════════
export const MAA_BEHEN_HOTWORDS = [
  "maa", "behen", "society", "colony", "rekha", "hurt",
  "daughters", "sleeve", "family", "torture", "gupta",
  "reflection", "badly",
];

export const MAA_BEHEN_NAMES = [
  "rekha", "gupta", "shri",
];
