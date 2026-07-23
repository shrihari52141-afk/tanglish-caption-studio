// src/lib/qwenEngine.ts — Qwen-powered forced aligner + Hold Algorithm
import OpenAI from "openai";

const qwen = new OpenAI({
  apiKey: import.meta.env.VITE_QWEN_API_KEY || "",
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

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

const SYSTEM_PROMPT_V11 = `You are a PHONEME-LEVEL FORCED ALIGNER. You MEASURE sound, you don't guess.

OUTPUT ONLY VALID JSON with TWO arrays sharing the SAME clock:
{ "audio_duration_ms": number, "roman": [Word], "english": [Word] }

Word = {
  "word": string,
  "start_ms": number,
  "end_ms": number,
  "pause_after_ms": number,
  "is_hotword": boolean,
  "is_name": boolean,
  "is_sentence_end": boolean,
  "emotion_tone": "gossip_backstabbing|betrayal_hurt|family_emotional|angry_frustrated|casual_explaining",
  "emoji": string|null
}

PHYSICS LAWS - BREAK = FAIL:
1. MONOTONIC: start_ms[0] >= 100, start_ms[i] >= end_ms[i-1], start_ms[i] < end_ms[i]
2. NO AVERAGING: Every word has unique duration based on how long it was spoken.
3. SINGLE WORD: "society and colony" as one entry = FAIL. Split it.
4. SILENCE HOLD: pause_after_ms is MANDATORY. Last word = 0.
5. HOTWORD QUOTA: 30% must be true.
6. EMOJI LAW: emoji=null if is_sentence_end=false. If true, ONE emoji only.
7. CROSS-LINGUAL LOCK: english[] MUST reuse roman[] start_ms/end_ms/pause_after_ms.

VALIDATE BEFORE OUTPUT: Did I group words? Are timestamps increasing? Did I start first word at 0 when audio has 800ms silence? Fix it.`;

export async function transcribeWithQwen(
  audioBase64: string,
  audioFormat: string = "wav",
  targetLanguage: string = "en",
  useEmojis: boolean = true
): Promise<CaptionData> {
  const models = ["qwen2.5-omni-7b", "qwen-audio-turbo", "qwen2-audio-instruct"];

  for (const model of models) {
    try {
      console.log(`[Qwen] Trying: ${model}`);
      const response = await qwen.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_V11 },
          {
            role: "user",
            content: [
              { type: "text", text: `Transcribe. TARGET=${targetLanguage}, USE_EMOJIS=${useEmojis}. JSON only.` },
              { type: "input_audio", input_audio: { data: audioBase64, format: audioFormat } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Empty response");
      const parsed: CaptionData = JSON.parse(content);
      if (validateTimestamps(parsed.roman)) return parsed;
    } catch (err: any) {
      console.error(`[Qwen] ${model} failed:`, err.message);
    }
  }
  throw new Error("All Qwen models failed");
}

function validateTimestamps(words: Word[]): boolean {
  if (!words?.length) return false;
  if (words[0].start_ms < 0) return false;
  for (let i = 1; i < words.length; i++) {
    if (words[i].start_ms < words[i - 1].end_ms) return false;
    if (words[i].start_ms >= words[i].end_ms) return false;
  }
  return true;
}

// ═══ THE HOLD ALGORITHM — Fixes purple early jump ═══
export function getActiveIndex(track: Word[], timeMs: number): number {
  for (let i = 0; i < track.length; i++) {
    const w = track[i];
    const holdUntil = w.end_ms + w.pause_after_ms;
    if (timeMs >= w.start_ms && timeMs < holdUntil) return i;
  }
  return -1;
}
