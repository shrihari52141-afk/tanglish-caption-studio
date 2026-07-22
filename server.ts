import "dotenv/config";
import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import {
  startRemoteConfigWatcher,
  loadRemoteConfig,
  getRemoteConfig,
  saveRemoteConfig,
  getPublicConfig,
  getSecret,
  onRemoteConfigChange,
} from "./remote-config";
import {
  trackEvent,
  getClientIp,
  lookupIpGeo,
  wordsToTranscript,
  type TrackerEvent,
} from "./tracker";

// Exported so a serverless platform (e.g. Vercel) can mount the Express app
// without calling app.listen().
export let app: express.Application;

const execAsync = promisify(exec);

// Live remote config (API keys + tracker email) — changes apply for all users without restart
startRemoteConfigWatcher();
loadRemoteConfig();

// Robust resolution for __filename and __dirname supporting both ESM (development) and CJS (production bundling)
const currentFilename = typeof import.meta !== "undefined" && import.meta && import.meta.url
  ? fileURLToPath(import.meta.url)
  : (typeof __filename !== "undefined" ? __filename : "");

const currentDirname = typeof import.meta !== "undefined" && import.meta && import.meta.url
  ? path.dirname(currentFilename)
  : (typeof __dirname !== "undefined" ? __dirname : process.cwd());

// Ensure uploads directory exists (skip on read-only filesystems like Vercel)
const uploadsDir = path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch {
  // Read-only filesystem (e.g. Vercel serverless) — uploads dir not needed
}

const upload = multer({ 
  dest: process.env.VERCEL ? "/tmp" : "uploads/",
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

const jobClients = new Map<string, express.Response>();

function sendLog(jobId: string | undefined, message: string) {
  if (jobId && jobClients.has(jobId)) {
    jobClients.get(jobId)!.write(`data: ${JSON.stringify({ message })}\n\n`);
  }
  console.log(`[Job ${jobId || 'N/A'}] ${message}`);
}

function formatASSTime(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.floor((seconds % 1) * 100);
  
  const hStr = hours.toString();
  const mStr = minutes.toString().padStart(2, "0");
  const sStr = secs.toString().padStart(2, "0");
  const cStr = centis.toString().padStart(2, "0");
  
  return `${hStr}:${mStr}:${sStr}.${cStr}`;
}

/** Style-line ASS colour: &HAABBGGRR (no trailing &) */
function hexToASSColor(hex: string): string {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  if (clean.length !== 6) {
    return "&H00FFFFFF";
  }
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H00${b}${g}${r}`;
}

/** Override-tag ASS colour: &HAABBGGRR& (trailing & required by libass) */
function hexToASSOverrideColor(hex: string): string {
  return `${hexToASSColor(hex)}&`;
}

/** Escape ASS special characters so they never render as tags or break parsing */
function escapeASSText(text: string): string {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

/** Strip any ASS override tags that may have leaked into word text */
function stripASSOverrides(text: string): string {
  let s = String(text ?? "");
  while (s.includes("\\\\")) s = s.replace(/\\\\/g, "\\");
  s = s.replace(/\{[^{}]*\}/g, "");
  s = s.replace(/\\[a-zA-Z]+\d*\([^)]*\)/g, "");
  s = s.replace(/\\[a-zA-Z]+-?\d+/g, "");
  s = s.replace(/\\[a-zA-Z]+/g, "");
  s = s.replace(/&H[0-9A-Fa-f]{1,8}&?/gi, "");
  s = s.replace(/\\/g, "");
  return s.replace(/\s+/g, " ").trim();
}

export async function startServer() {
  app = express();
  const PORT = 3000;

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json());

  app.get("/api/logs", (req, res) => {
    const jobId = req.query.jobId as string;
    if (!jobId) {
      return res.status(400).end();
    }
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Prevent buffering on Cloud Run, Nginx, and proxies!
    
    jobClients.set(jobId, res);
    
    // Flush connection instantly
    res.write(`data: ${JSON.stringify({ message: "Log stream initialized." })}\n\n`);
    
    req.on("close", () => {
      jobClients.delete(jobId);
    });
  });

  // --- GOOGLE GEMINI KEY ROTATION MANAGER ---
  let geminiKeys: string[] = [];
  let nextKeyIndex = 0;

  // Model priority. NOTE (verified against the live API):
  //  - gemini-2.5-flash → 404 "no longer available to new users" (removed).
  //  - gemini-3.5-flash / gemini-flash-latest → currently returning 503 (overloaded),
  //    kept only as last-resort fallbacks in case they recover.
  //  - gemini-3.1-flash-lite / gemini-flash-lite-latest → reliably serving now.
  const GEMINI_PRIMARY_MODEL = "gemini-3.1-flash-lite";
  const GEMINI_FALLBACK_MODELS = [
    "gemini-flash-lite-latest",
    "gemini-3.5-flash",
    "gemini-flash-latest",
  ];
  function geminiModelList(): string[] {
    return [GEMINI_PRIMARY_MODEL, ...GEMINI_FALLBACK_MODELS];
  }

  function loadGeminiKeys() {
    const keysSet = new Set<string>();

    const addKeysFromValue = (val: string | undefined) => {
      if (!val) return;
      val
        .split(/[\s,]+/)
        .map(k => k.trim())
        .filter(Boolean)
        .forEach(k => keysSet.add(k));
    };

    // 0. Remote config (live-synced for all users) then env
    addKeysFromValue(getSecret("GEMINI_API_KEY") || process.env.GEMINI_API_KEY);

    // 1. Dedicated multi-key env var: GEMINI_API_KEYS (comma/space/newline separated)
    addKeysFromValue(process.env.GEMINI_API_KEYS);

    // 2. Scan for numbered/aliased env vars: GEMINI_API_KEY_1 ... N, GEMINI_KEY_*, GEMINI_KEYS_*
    for (const envVar in process.env) {
      if (
        envVar === "GEMINI_API_KEY" ||
        envVar === "GEMINI_API_KEYS" ||
        envVar.startsWith("GEMINI_API_KEY_") ||
        envVar.startsWith("GEMINI_KEY")
      ) {
        addKeysFromValue(process.env[envVar]);
      }
    }

    geminiKeys = Array.from(keysSet);
    nextKeyIndex = 0;
    console.log(`[Gemini Rotation] Loaded ${geminiKeys.length} active API key(s) for rotation.`);
  }

  // Hot-reload keys when remote-config.json changes
  onRemoteConfigChange(() => {
    loadGeminiKeys();
  });

  type WhisperWordsResult = {
    words: { word: string; start_time: number; end_time: number }[];
    model: string;
    rawText: string;
    audioDuration?: number;
  };

  /**
   * Normalize transcription timestamps so captions span the FULL audio and stay
   * perfectly in sync with the speaker's rhythm. Gemini often compresses timestamps
   * toward the start or under-reports total duration. This:
   *  - keeps relative spacing (silence between phrases is preserved),
   *  - linearly stretches the timeline so the last word reaches `targetDuration`,
   *  - clamps everything into [0, targetDuration].
   */
  function normalizeTranscriptionTiming(
    words: TimedWord[],
    _targetDuration: number  // unused — we NEVER stretch beyond actual speech end
  ): TimedWord[] {
    if (words.length === 0) return words;

    // Work on a copy sorted by start
    const sorted = [...words].sort((a, b) => a.start_time - b.start_time);
    const rawStart = sorted[0].start_time;
    const rawEnd = Math.max(...sorted.map((w) => w.end_time), rawStart + 0.1);

    // CRITICAL: Do NOT stretch timestamps to fill the video duration.
    // Captions must only cover the actual speech window. Silent gaps at
    // the end of the video get NO captions — highlighted word freezes.
    // Only shift so the first word starts at 0 (beginning of speech).
    const offset = -rawStart;
    return sorted.map((w) => ({
      ...w,
      start_time: +Math.max(0, (w.start_time + offset)).toFixed(3),
      end_time: +Math.max(0.001, (w.end_time + offset)).toFixed(3),
    }));
  }

  // Inline Base64 audio is only safe below Gemini's ~20MB total request cap.
  // Anything larger MUST go through the resumable Files API.
  const GEMINI_INLINE_MAX_BYTES = 18 * 1024 * 1024;

  /**
   * Builds the audio "part" for a Gemini generateContent call.
   * - Small files (< ~18MB): inline Base64 (fast, no extra round-trip).
   * - Large files: upload via the Files API and reference by URI (supports up to 2GB).
   */
  async function buildGeminiAudioPart(
    ai: GoogleGenAI,
    audioFilePath: string,
    mimeType: string,
    jobId?: string
  ): Promise<any> {
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(audioFilePath).size;
    } catch {
      sizeBytes = 0;
    }

    if (sizeBytes > 0 && sizeBytes <= GEMINI_INLINE_MAX_BYTES) {
      const fileBuffer = fs.readFileSync(audioFilePath);
      return { inlineData: { data: fileBuffer.toString("base64"), mimeType } };
    }

    // Large file → Files API upload
    sendLog(
      jobId,
      `Audio is ${(sizeBytes / (1024 * 1024)).toFixed(1)}MB — uploading via Gemini Files API...`
    );
    const uploaded = await ai.files.upload({
      file: audioFilePath,
      config: { mimeType },
    });

    // Wait until the file is ACTIVE before referencing it.
    let fileInfo: any = uploaded;
    const fileName = (uploaded as any).name;
    for (let i = 0; i < 30 && fileInfo?.state !== "ACTIVE"; i++) {
      if (fileInfo?.state === "FAILED") {
        throw new Error("Gemini Files API processing failed.");
      }
      await new Promise((r) => setTimeout(r, 1500));
      fileInfo = await ai.files.get({ name: fileName });
    }
    if (fileInfo?.state !== "ACTIVE") {
      throw new Error("Gemini Files API upload did not become ACTIVE in time.");
    }
    sendLog(jobId, "Files API upload ready.");
    return {
      fileData: {
        fileUri: fileInfo.uri || (uploaded as any).uri,
        mimeType: fileInfo.mimeType || mimeType,
      },
    };
  }

  /**
   * PRIMARY transcription: Gemini (audio understanding)
   * Transcribes spoken audio in the original language with phrase/word-level timing.
   * Tries gemini-3.5-flash first, then silently falls back to 2.5-flash / 3.1-flash-lite.
   */
  async function transcribeWithGeminiFlash(
    audioFilePath: string,
    mimeType: string,
    jobId?: string,
    language?: string,
    maxAttempts = 3,
    targetDuration = 0
  ): Promise<WhisperWordsResult> {
    if (geminiKeys.length === 0) {
      loadGeminiKeys();
    }
    if (geminiKeys.length === 0) {
      throw new Error("No Gemini API key is configured. Set GEMINI_API_KEY(S) in .env or remote-config.json");
    }

    const langLabel =
      !language || language === "auto"
        ? "the spoken language (auto-detect; likely a regional Indian language)"
        : String(language);

    const prompt = `You are a professional, frame-accurate audio transcriber specializing in Indian languages (Tamil, Telugu, Hindi, Kannada, Malayalam, etc.) and mixed Indian-English speech. Your ONLY job is to transcribe the ORIGINAL spoken language with exact word-level timing. Do NOT translate.

TIMING IS THE MOST IMPORTANT PART. Follow these rules exactly:
1. Transcribe VERBATIM — every word from the first spoken sound to the very last, with NO skipping, merging, or summarizing. Capture filler words too.
2. Each entry must have a precise "start_time" and "end_time" in SECONDS, measured against the audio timeline.
3. PRESERVE SILENCE: if there is a pause between two phrases, the first phrase's end_time and the next phrase's start_time must reflect that gap (do not snap them together). Real silence must be kept as silence in the timestamps.
4. The FIRST entry's start_time should be when the first word actually begins (often near 0.0 but only when speech starts).
5. The LAST entry's end_time must be when the final word ends — it must reach close to the actual end of the speech. NEVER stop early.
6. The words array must span (almost) the ENTIRE audio duration. Report the total "audio_duration" in seconds as a top-level number.
7. Use the EXACT ORIGINAL spoken language (do not translate). Preserve native script where used.
8. Keep each token short (a few words) for readability.
9. METADATA TAGGING:
   - "is_question": Mark true for interrogative words/phrases (e.g. "madbeka?", "book?").
   - "is_expression": Mark true for exclamations, reactions, or expressions (e.g. "Ayyo", "shut up", "oh god", "oops").
   - "is_name": Mark true for proper names, brands, or places.
   - "is_sentence_end": Mark true if the word ends a sentence or thought unit (has punctuation like ., !, ?).

Spoken language hint: ${langLabel}.

Return ONLY a JSON object (no markdown, no code fences):
{
  "audio_duration": number,
  "words": [ { "word": string, "start_time": number, "end_time": number, "is_question": boolean, "is_expression": boolean, "is_name": boolean, "is_sentence_end": boolean } ]
}`;

    sendLog(
      jobId,
      `🎤 Gemini transcription (${GEMINI_PRIMARY_MODEL} → fallback chain) — ${geminiKeys.length} key(s) in rotation...`
    );

    const { result, model } = await callGeminiWithModelFallback<WhisperWordsResult>(
      async (ai, modelName) => {
        const audioPart = await buildGeminiAudioPart(ai, audioFilePath, mimeType, jobId);
        const geminiRes = await ai.models.generateContent({
          model: modelName,
          contents: [
            audioPart,
            { text: prompt },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                audio_duration: { type: Type.NUMBER },
                words: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      start_time: { type: Type.NUMBER },
                      end_time: { type: Type.NUMBER },
                      is_question: { type: Type.BOOLEAN },
                      is_expression: { type: Type.BOOLEAN },
                      is_name: { type: Type.BOOLEAN },
                      is_sentence_end: { type: Type.BOOLEAN },
                    },
                    required: ["word", "start_time", "end_time"],
                  },
                },
              },
              required: ["words"],
            },
          },
        });

        const text = geminiRes.text;
        if (!text) {
          throw new Error("Gemini returned empty transcription text.");
        }
        const parsed = extractJsonFromResponse(text);
        const words =
          parsed.words && Array.isArray(parsed.words)
            ? parsed.words.map((w: any) => ({
                word: String(w.word || w.text || "").trim(),
                start_time: Number(w.start_time || w.start || 0),
                end_time: Number(w.end_time || w.end || Number(w.start_time || 0) + 0.4),
                is_question: !!w.is_question,
                is_expression: !!w.is_expression,
                is_name: !!w.is_name,
                is_sentence_end: !!w.is_sentence_end,
              }))
            : [];
        const cleaned = normalizeWhisperWords(words as TimedWord[]);
        if (cleaned.length === 0) {
          throw new Error("Gemini transcription returned empty words.");
        }
        // Stretch timestamps so captions cover the full audio duration and stay
        // in sync with the speaker's actual pacing (silence preserved).
        // Prefer the REAL measured audio duration; fall back to the model's report.
        const stretchTarget = targetDuration > 0
          ? targetDuration
          : (Number(parsed.audio_duration) || Math.max(...cleaned.map((w) => w.end_time), 1));
        const normalized = normalizeTranscriptionTiming(cleaned, stretchTarget);
        return {
          words: normalized,
          model: modelName,
          rawText: normalized.map((w) => w.word).join(" "),
          audioDuration: targetDuration > 0 ? targetDuration : (Number(parsed.audio_duration) || undefined),
        } as WhisperWordsResult;
      },
      jobId
    );

    sendLog(
      jobId,
      `✅ Gemini transcription OK — ${result.words.length} phrases via ${model}.`
    );
    return result;
  }

  function getNextGeminiKey(): string | null {
    if (geminiKeys.length === 0) {
      loadGeminiKeys();
    }
    if (geminiKeys.length === 0) {
      return null;
    }
    const key = geminiKeys[nextKeyIndex];
    nextKeyIndex = (nextKeyIndex + 1) % geminiKeys.length;
    return key;
  }

  async function callGeminiWithRotation<T>(
    fn: (ai: GoogleGenAI) => Promise<T>,
    jobId?: string
  ): Promise<T> {
    if (geminiKeys.length === 0) {
      loadGeminiKeys();
    }
    if (geminiKeys.length === 0) {
      throw new Error("No Google Gemini API key is configured.");
    }
    
    let attempts = Math.min(5, geminiKeys.length);
    let lastError: any = null;
    
    for (let i = 0; i < attempts; i++) {
      const currentKey = getNextGeminiKey();
      if (!currentKey) {
        throw new Error("No Gemini API keys found.");
      }
      
      const obfuscatedKey = currentKey.length > 8 
        ? `${currentKey.substring(0, 4)}...${currentKey.substring(currentKey.length - 4)}`
        : "invalid-key";

      try {
        const ai = new GoogleGenAI({
          apiKey: currentKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });
        return await fn(ai);
      } catch (err: any) {
        lastError = err;
        const msg = `Gemini API call failed using key [${obfuscatedKey}]: ${err.message || err}.`;
        if (jobId) {
          sendLog(jobId, `${msg} Rotating key...`);
        }
        console.error(`[Gemini Rotation Error]:`, err);
      }
    }
    throw lastError || new Error("All Gemini API keys failed.");
  }

  /**
   * Same as callGeminiWithRotation but the callback receives the model name to use.
   * Automatically falls back through geminiModelList() (3.5 Flash → 2.5 Flash → 3.1 Flash-Lite)
   * on ANY failure, rotating keys too. No user interaction required.
   */
  async function callGeminiWithModelFallback<T>(
    fn: (ai: GoogleGenAI, model: string) => Promise<T>,
    jobId?: string
  ): Promise<{ result: T; model: string }> {
    if (geminiKeys.length === 0) {
      loadGeminiKeys();
    }
    if (geminiKeys.length === 0) {
      throw new Error("No Google Gemini API key is configured.");
    }

    const models = geminiModelList();
    let lastError: any = null;

    for (const model of models) {
      const attempts = Math.min(3, geminiKeys.length) || 1;
      for (let i = 0; i < attempts; i++) {
        const currentKey = getNextGeminiKey();
        if (!currentKey) break;
        const obfuscatedKey =
          currentKey.length > 8
            ? `${currentKey.substring(0, 4)}...${currentKey.substring(currentKey.length - 4)}`
            : "invalid-key";
        try {
          const ai = new GoogleGenAI({
            apiKey: currentKey,
            httpOptions: { headers: { "User-Agent": "aistudio-build" } },
          });
          const result = await fn(ai, model);
          return { result, model };
        } catch (err: any) {
          lastError = err;
          if (jobId) {
            sendLog(
              jobId,
              `Gemini [${model}] failed on key [${obfuscatedKey}]: ${err.message || err}. Falling back...`
            );
          }
          console.error(`[Gemini Model Fallback Error] model=${model}:`, err);
        }
      }
    }
    throw lastError || new Error("All Gemini models and keys failed.");
  }

  // --- MULTI-PROVIDER AI SWITCHER WITH INSTANT FAILOVER ---
  function extractJsonFromResponse(text: string): any {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch (e) {}

    const match = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e) {}
    }

    const match2 = trimmed.match(/```\s*([\s\S]*?)\s*```/);
    if (match2 && match2[1]) {
      try {
        return JSON.parse(match2[1].trim());
      } catch (e) {}
    }

    throw new Error("Unable to parse JSON from AI model response content.");
  }

  type TimedWord = { 
    word: string; 
    start_time: number; 
    end_time: number;
    is_question?: boolean;
    is_expression?: boolean;
    is_name?: boolean;
    is_sentence_end?: boolean;
  };

  /**
   * Count syllables in an English word (approximate, but good enough for timing).
   * Each vowel group = 1 syllable. Handles common patterns like -tion, -sion, -ing, -ed.
   * Examples: "Tension"=2, "that"=1, "booking"=2, "cancel"=2, "agutho"=3.
   */
  function countSyllables(word: string): number {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length === 0) return 1;
    // Special cases
    if (w.endsWith('tion') || w.endsWith('sion')) return Math.max(1, w.match(/[aeiouy]{1,2}/g)?.length || 1);
    if (w.endsWith('ing') || w.endsWith('igh')) return Math.max(1, w.match(/[aeiouy]{1,2}/g)?.length || 1);
    // Count vowel groups
    const vowelGroups = w.match(/[aeiouy]+/g);
    return Math.max(1, (vowelGroups?.length || 1));
  }

  /**
   * Auto-Speedup: compress translated word timestamps into source audio window
   * using SYLLABLE-WEIGHTED proportioning (not character count).
   * Syllables determine speech time, not letters.
   * Example: 5 English words, 8 syllables → 1.2s window → ms per syllable = 150ms.
   * Each word duration = word_syllables × 150ms.
   * Last word snaps to sourceEndSec exactly.
   */
  function applySpeedupTimestamps(
    words: TimedWord[],
    sourceStartSec: number,
    sourceEndSec: number
  ): TimedWord[] {
    if (words.length === 0) return words;
    const totalWindowMs = (sourceEndSec - sourceStartSec) * 1000;
    if (totalWindowMs <= 0) return words;

    const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w.word), 1);
    const msPerSyllable = totalWindowMs / totalSyllables;

    let currentStartMs = sourceStartSec * 1000;
    const endMs = sourceEndSec * 1000;

    return words.map((w, i) => {
      const wordSyllables = countSyllables(w.word);
      const durMs = Math.round(wordSyllables * msPerSyllable);
      const start = currentStartMs;
      const end = i === words.length - 1 ? endMs : start + durMs;
      currentStartMs = end + 1; // 1ms gap between words
      return { ...w, start_time: start / 1000, end_time: end / 1000 };
    });
  }

  /** Clean Whisper tokens (strip stray punctuation-only tokens, normalize) */
  function normalizeWhisperWords(words: TimedWord[]): TimedWord[] {
    return words
      .map((w) => ({
        ...w,
        word: String(w.word || "")
          .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
          .trim(),
        start_time: Number(w.start_time) || 0,
        end_time: Math.max(Number(w.end_time) || 0, Number(w.start_time) || 0),
      }))
      .filter((w) => w.word.length > 0);
  }

  /** Group words into natural phrases (pause or size) for accurate LLM rewrite */
  function groupWordsIntoPhrases(words: TimedWord[], maxWords = 8, maxGap = 0.55) {
    if (words.length === 0) return [] as { words: TimedWord[]; text: string; start: number; end: number }[];
    const phrases: { words: TimedWord[]; text: string; start: number; end: number }[] = [];
    let cur: TimedWord[] = [words[0]];
    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1];
      const w = words[i];
      const gap = w.start_time - prev.end_time;
      if (gap > maxGap || cur.length >= maxWords) {
        phrases.push({
          words: cur,
          text: cur.map((x) => x.word).join(" "),
          start: cur[0].start_time,
          end: cur[cur.length - 1].end_time,
        });
        cur = [w];
      } else {
        cur.push(w);
      }
    }
    if (cur.length) {
      phrases.push({
        words: cur,
        text: cur.map((x) => x.word).join(" "),
        start: cur[0].start_time,
        end: cur[cur.length - 1].end_time,
      });
    }
    return phrases;
  }

  /** Spread a phrase string across an original time span as timed words */
  function distributePhraseText(
    text: string,
    start: number,
    end: number,
    fallbackWords: TimedWord[]
  ): TimedWord[] {
    const parts = text
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return fallbackWords;
    const span = Math.max(end - start, 0.08 * parts.length);

    const totalLetters = parts.reduce((sum, p) => sum + p.length, 0);
    const hasQuestion = fallbackWords.some((w) => w.is_question);
    const hasExpression = fallbackWords.some((w) => w.is_expression);
    const hasName = fallbackWords.some((w) => w.is_name);
    const hasSentenceEnd = fallbackWords.some((w) => w.is_sentence_end);

    const makeWord = (p: string, t0: number, t1: number, i: number, isLast: boolean): TimedWord => {
      const cleanWord = p.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").trim();
      return {
        word: p,
        start_time: +t0.toFixed(3),
        end_time: +Math.max(t1, t0 + 0.04).toFixed(3),
        is_question: hasQuestion || p.includes('?'),
        is_expression: hasExpression || ["ayyo", "shutup", "ohgod"].includes(cleanWord.toLowerCase()),
        is_name: hasName || (cleanWord.length > 0 && cleanWord[0] === cleanWord[0].toUpperCase() && !isLast && i !== 0),
        is_sentence_end: (isLast && hasSentenceEnd) || p.includes('.') || p.includes('!') || p.includes('?'),
      };
    };

    if (totalLetters === 0) {
      return parts.map((p, i) => {
        const t0 = start + (span * i) / parts.length;
        const t1 = start + (span * (i + 1)) / parts.length;
        return makeWord(p, t0, t1, i, i === parts.length - 1);
      });
    }

    let runningOffset = 0;
    return parts.map((p, i) => {
      const wordWeight = p.length / totalLetters;
      const wordDuration = span * wordWeight;
      const t0 = start + runningOffset;
      const t1 = t0 + wordDuration;
      runningOffset += wordDuration;
      return makeWord(p, t0, t1, i, i === parts.length - 1);
    });
  }

  // Context-aware emoji pools (used as a fallback when the model doesn't supply one)
  const EMOJI_BY_MOOD: { test: RegExp; emojis: string[] }[] = [
    { test: /\b(love|heart|crush|miss you|darling|baby|cutie|beautiful|pretty|gorgeous|❤|affection|cute)\b/i, emojis: ["❤️", "😍", "🥰", "💕", "💖"] },
    { test: /\b(lol|haha|funny|joke|lmao|😂|hilarious|comedy|laugh)\b/i, emojis: ["😂", "🤣", "😆"] },
    { test: /\b(wow|omg|shock|amazing|incredible|unbelievable|surprise|shocked|😮|crazy)\b/i, emojis: ["😮", "🤯", "😱"] },
    { test: /\b(sad|cry|tears|depress|😢|😭|miss|lonely|heartbreak|pain|sorry)\b/i, emojis: ["😢", "😭", "💔"] },
    { test: /\b(angry|mad|furious|annoyed|😡|hate|stupid|idiot|wtf)\b/i, emojis: ["😤", "😡", "🙄"] },
    { test: /\b(thinking|idea|think|maybe|wonder|hmm|🤔|plan|consider)\b/i, emojis: ["🤔", "💡", "🧠"] },
    { test: /\b(fire|lit|hyped|cool|awesome|epic|🔥|super|blow|mind)\b/i, emojis: ["🔥", "😎", "🤩"] },
    { test: /\b(clap|congrats|proud|win|success|👏|well done|respect|great job)\b/i, emojis: ["👏", "🎉", "💪"] },
    { test: /\b(food|eat|yummy|tasty|delicious|recipe|😋|hungry|biryani|meal)\b/i, emojis: ["😋", "🍜", "🤤"] },
    { test: /\b(dance|song|music|sing|🎵|party|vibe|mood)\b/i, emojis: ["🎶", "💃", "🕺"] },
    { test: /\b(money|cash|rich|price|cost|save|discount|💰|profit|salary)\b/i, emojis: ["💰", "💸", "🤑"] },
    { test: /\b(travel|trip|journey|ride|drive|🚗|flight|vacation|road)\b/i, emojis: ["✈️", "🚗", "🛣️"] },
  ];
  const FALLBACK_EMOJIS = ["✨", "💫", "😊", "👌", "🌟", "💯"];

  function stripAllEmojis(text: string): string {
    return text
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Pick a contextually relevant emoji for the line; fallback to a rotating neutral set. */
  function pickEmojiForLine(text: string, lineIndex: number): string {
    for (const mood of EMOJI_BY_MOOD) {
      if (mood.test.test(text)) {
        return mood.emojis[lineIndex % mood.emojis.length];
      }
    }
    return FALLBACK_EMOJIS[lineIndex % FALLBACK_EMOJIS.length];
  }

  /** Exactly one emoji at end of each caption line. If a model-supplied emoji already
   *  exists, keep it; otherwise pick a contextually relevant one. */
  function ensureOneLineEmoji(text: string, lineIndex: number, enabled: boolean): string {
    const existing = text.match(/\p{Extended_Pictographic}/u);
    const base = stripAllEmojis(text);
    if (!enabled || !base) return base;
    const emoji = existing ? existing[0] : pickEmojiForLine(base, lineIndex);
    return `${base} ${emoji}`;
  }

  /** Rough syllable estimate for Latin-script text (lip-sync targeting) */
  function estimateSyllables(text: string): number {
    const clean = stripAllEmojis(text).toLowerCase().replace(/[^a-z\s']/g, " ");
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 1;
    let total = 0;
    for (const w of words) {
      const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").match(/[aeiouy]{1,2}/g);
      total += Math.max(1, m ? m.length : 1);
    }
    return total;
  }

  /**
   * Perfect Lip-Sync & Grammar Master polish for Whisper output.
   * Analyzes original spoken language rhythm and rewrites English for dubbing/sync.
   */
  async function polishWhisperPhrases(
    initialWords: TimedWord[],
    languageInstruction: string,
    usePunctuation: boolean,
    jobId?: string,
    useEmojis = true,
    originalSpokenLanguage = "auto"
  ): Promise<{ words: TimedWord[]; providerUsed: string }> {
    const normalized = normalizeWhisperWords(initialWords);
    if (normalized.length === 0) {
      return { words: [], providerUsed: "empty" };
    }

    // Phrase windows from ORIGINAL-language Whisper ASR — each becomes one English caption line
    const phrases = groupWordsIntoPhrases(normalized, 8, 0.55);
    const fullWhisperText = phrases.map((p) => p.text).join(" ");
    const sourceLang =
      !originalSpokenLanguage || originalSpokenLanguage === "auto"
        ? "Unknown (detect from the original-language Whisper transcript; treat as regional Indian speech if unclear)"
        : originalSpokenLanguage.charAt(0).toUpperCase() + originalSpokenLanguage.slice(1);

    // User's Perfect Lip-Sync & Grammar Master Prompt — Whisper = original language only; this model = English
    const systemPrompt = `Act as an expert translation editor, linguist, and audio localization scriptwriter. I am going to provide you with a raw transcript of a video or audio file generated by a speech-to-text model (Whisper), along with the source text or context of the original spoken language. It contains timing data and timestamps.

CRITICAL: Whisper was used ONLY to transcribe the EXACT spoken original language. It did NOT translate. You receive original-language text + timestamps. You produce FINAL ENGLISH CAPTIONS.

Your task is to completely rewrite/translate into English to achieve absolute perfection for video dubbing/lip-syncing. You must strictly adhere to the following constraints:

1. ORIGINAL LANGUAGE ANALYSIS: Look at the original spoken language provided (${sourceLang}). Analyze its unique rhythm, cadence, and sentence structure so you can map the English translation precisely to how the original language sounds when spoken.
2. SYLLABLE & PACING MATCH: The English text must perfectly match the exact duration, speech pacing, and syllable count of the original spoken language for each timestamp window. Write so a voice actor reading English naturally matches the original audio's rhythm, speed, and pauses. Each phrase includes target_syllables_min / target_syllables_max — stay INSIDE that range. If the original phrase is long, your English may be slightly longer but must still feel natural and in-sync.
3. 100% PERFECT GRAMMAR & NATURAL FLOW: The English phrasing must be completely natural, idiomatic, conversational, and 100% grammatically correct. Avoid broken or robotic literal translations. It should read like a native English speaker captioning the moment.
4. CONTEXT & LOGIC CORRECTION: Fix any logical errors made by the speech-to-text model (e.g., correct flipped phrases like "with hidden charges" to "no hidden charges", fix negations, and naturally translate untranslated regional words). Fix brand names and place names from context.
5. COMPLETENESS: Do NOT drop or skip any phrase. Every input phrase id must have a corresponding corrected output phrase. The total number of phrases and their order MUST match the input exactly, and the captions must cover the FULL audio duration (no missing ending).
6. FORMATTING: Retain the timestamp breakdown structure (same phrase ids). Give ONLY the final corrected English version—do not include explanations, the original language text, or the old text.
7. EMOJIS: ${
      useEmojis
        ? "Add exactly ONE single, contextually relevant emoji at the end of each timestamp line. Choose an emoji that matches the emotion/meaning of THAT specific line (e.g. 😂 for funny, 😍 for love/beauty, 😮 for surprise, 😢 for sad, 🔥 for hype, 👏 for applause, 💡 for tips, ❤️ for affection). Do NOT use a fixed alternating list — pick the best fit per line. Never use more than one emoji per line."
        : "Do NOT add any emojis."
    }
8. EXTRA: ${languageInstruction.trim()}
9. PUNCTUATION: ${usePunctuation ? "Use natural conversational punctuation." : "Avoid punctuation marks."}

EXAMPLES OF HOW TO CORRECT THE TEXT (Based on Original Kannada Spoken Audio):

Example 1 (Fixing Logic & Bad Grammar):
- Original Language Spoken: ಹಾಸನಕ್ಕೆ ಒಂದೇ ಕ್ಯಾಬ್ ಬುಕ್ ಮಾಡಬೇಕಾ? ಕೊನೆಯ ಕ್ಷಣದಲ್ಲಿ ಬುಕ್ಕಿಂಗ್ ಕ್ಯಾನ್ಸಲ್ ಆಗುತ್ತೋ ಅನ್ನೋ ಟೆನ್ಷನ್?
- Perfect Fix:
  0:00-0:02 | To Hassan, do you need to book a cab?
  0:02-0:05 | Last-minute canceling of your booking causing you tension?

Example 2 (Fixing Inverted Meanings & Missing Local Words):
- Original Language Spoken: ಅನಿ ಕ್ಯಾಬ್ಸ್ ಟೂರ್ಸ್ ಅಂಡ್ ಟ್ರಾವೆಲ್ಸ್ ಬಿ.ಎಲ್.ಆರ್ ಇದೆ ಅಲ್ವಾ? ಹಿಡನ್ ಚಾರ್ಜಸ್ ಇಲ್ಲ.
- Perfect Fix:
  0:11-0:14 | Ani Cabs Tours and Travels BLR is here, right?
  0:15-0:18 | Right on time, premium service, professional drivers,
  0:18-0:20 | No hidden charges here.

OUTPUT JSON ONLY (same number of phrases and same ids):
{"phrases":[{"id":0,"text":"Perfect English line 😮"},{"id":1,"text":"Next perfect line ❤️"}]}`;

    const userPayload = {
      original_spoken_language: sourceLang,
      note: "Whisper output is ORIGINAL-LANGUAGE transcription only — not English.",
      full_original_language_transcript: fullWhisperText,
      phrases: phrases.map((p, id) => {
        const duration = Math.max(p.end - p.start, 0.15);
        const targetMin = Math.max(2, Math.round(duration * 2.8));
        const targetMax = Math.max(targetMin + 1, Math.round(duration * 4.6));
        return {
          id,
          original_language_text: p.text,
          start_time: Number(p.start.toFixed(3)),
          end_time: Number(p.end.toFixed(3)),
          duration_sec: Number(duration.toFixed(3)),
          target_syllables_min: targetMin,
          target_syllables_max: targetMax,
        };
      }),
    };

    // PRIMARY polish path: Gemini (3.5 Flash → 2.5 Flash fallback), key rotation built-in
    try {
      sendLog(
        jobId,
        `Gemini English rewrite from original ${sourceLang} transcript (${GEMINI_PRIMARY_MODEL} → fallback)...`
      );

      const { result: geminiResult, model: polishModel } = await callGeminiWithModelFallback<any[]>(
        async (ai, modelName) => {
          const res = await ai.models.generateContent({
            model: modelName,
            contents: `Original Spoken Language: ${sourceLang}

Below is the original-language transcript + timestamps. Your job is to produce final ENGLISH captions for lip-sync.

${JSON.stringify(userPayload, null, 2)}`,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.3,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  phrases: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.NUMBER },
                        text: { type: Type.STRING },
                      },
                    required: ["id", "text"],
                  },
                },
              },
              required: ["phrases"],
            },
          },
        });
        const parsed = extractJsonFromResponse(res.text || "");
        const outPhrases: any[] = Array.isArray(parsed.phrases) ? parsed.phrases : [];
        if (outPhrases.length === 0) {
          throw new Error("Gemini returned no phrases.");
        }
        return outPhrases;
      }, jobId);

      const outPhrases = geminiResult as any[];
      const byId = new Map<number, string>();
      for (const op of outPhrases) {
        if (op && (op.id === 0 || op.id) && typeof op.text === "string") {
          byId.set(Number(op.id), op.text);
        }
      }

      const result: TimedWord[] = [];
      phrases.forEach((p, id) => {
        let text = byId.has(id) ? String(byId.get(id)) : p.text;
        text = ensureOneLineEmoji(text, id, useEmojis);

        // Soft syllable clamp: if model overshot badly, keep text but still place on timeline
        const duration = Math.max(p.end - p.start, 0.15);
        const maxSyl = Math.max(3, Math.round(duration * 5.2));
        let body = stripAllEmojis(text);
        let syl = estimateSyllables(body);
        if (syl > maxSyl + 3) {
          const fillers = new Set([
            "just", "really", "actually", "basically", "very", "quite", "please", "like",
          ]);
          const toks = body.split(/\s+/).filter(Boolean);
          const trimmed = toks.filter((t, i) => i === 0 || i === toks.length - 1 || !fillers.has(t.toLowerCase()));
          if (trimmed.length > 0 && estimateSyllables(trimmed.join(" ")) < syl) {
            body = trimmed.join(" ");
            text = ensureOneLineEmoji(body, id, useEmojis);
          }
        }

        const parts = stripAllEmojis(text).split(/\s+/).filter(Boolean);
        const emojiMatch = text.match(/\p{Extended_Pictographic}/u);
        const emoji = useEmojis && emojiMatch ? emojiMatch[0] : "";
        if (parts.length === 0) {
          result.push(...p.words);
          return;
        }
        const timed = distributePhraseText(parts.join(" "), p.start, p.end, p.words);
        if (emoji && timed.length > 0) {
          timed[timed.length - 1] = {
            ...timed[timed.length - 1],
            word: `${timed[timed.length - 1].word} ${emoji}`,
          };
        }
        result.push(...timed);
      });
      sendLog(
        jobId,
        `✨ Gemini English captions OK — ${result.length} words / ${phrases.length} lines (from ${sourceLang}) via ${polishModel}.`
      );
      return { words: result, providerUsed: `${polishModel} (${sourceLang}→EN)` };
    } catch (err: any) {
      sendLog(jobId, `Gemini polish failed: ${err.message}. Trying fallback...`);
    }

    // Fallback: classic enrich path
    try {
      const legacyPrompt = `You are an expert subtitle editor + lip-sync scriptwriter.
Original spoken language: ${sourceLang}.
${languageInstruction}
Fix flipped logic (e.g. with hidden charges → no hidden charges), brand names, grammar, and natural English.
Match approximate syllable length to each word's timing window.
Keep same array length and timestamps. ${useEmojis ? "Do not add emojis here." : "No emojis."}
JSON: {"words":[{"word":"...","start_time":n,"end_time":n}]}`;
      const fb = await enrichSubtitlesWithFallback(normalized, legacyPrompt, jobId);
      const fixed = fb.words.map((w: any, i: number) => ({
        word: String(w.word || normalized[i]?.word || ""),
        start_time: normalized[Math.min(i, normalized.length - 1)].start_time,
        end_time: normalized[Math.min(i, normalized.length - 1)].end_time,
      }));
      if (useEmojis) {
        const phrases2 = groupWordsIntoPhrases(fixed, 8, 0.55);
        let offset = 0;
        const out: TimedWord[] = [];
        phrases2.forEach((ph, idx) => {
          const chunk = fixed.slice(offset, offset + ph.words.length);
          offset += ph.words.length;
          if (chunk.length > 0) {
            const last = chunk[chunk.length - 1];
            const line = ensureOneLineEmoji(chunk.map((c) => c.word).join(" "), idx, true);
            const emojiMatch = line.match(/\p{Extended_Pictographic}/u);
            chunk[chunk.length - 1] = {
              ...last,
              word: emojiMatch
                ? `${stripAllEmojis(last.word)} ${emojiMatch[0]}`
                : last.word,
            };
          }
          out.push(...chunk);
        });
        return { words: out, providerUsed: fb.providerUsed + " + line-emojis" };
      }
      return { words: fixed, providerUsed: fb.providerUsed };
    } catch {
      return { words: normalized, providerUsed: "Whisper raw (no polish)" };
    }
  }

  /**
   * OPTIMIZED SINGLE-CALL path: transcribe audio AND produce final captions
   * (transliteration / English rewrite + emoji + timestamps) in ONE Gemini call.
   * Halves quota + latency vs the 2-call transcribe→polish flow.
   * Throws on malformed / low-coverage output so the caller can fall back to the
   * proven 2-call flow (transcribeWithGeminiFlash + polishWhisperPhrases).
   */
  async function transcribeAndPolishCombined(
    audioFilePath: string,
    mimeType: string,
    languageInstruction: string,
    usePunctuation: boolean,
    useEmojis: boolean,
    jobId?: string,
    language?: string,
    targetDuration = 0
  ): Promise<{ words: TimedWord[]; providerUsed: string }> {
    if (geminiKeys.length === 0) {
      loadGeminiKeys();
    }
    if (geminiKeys.length === 0) {
      throw new Error("No Gemini API key is configured.");
    }

    const langLabel =
      !language || language === "auto"
        ? "the spoken language (auto-detect; likely a regional Indian language)"
        : String(language);

    const systemPrompt = `You are an advanced multi-modal audio-visual transcription, translation, and lip-sync timestamping engine. You specialize in Indian multilingual audio, rapid conversational speech, code-switched dialects (Tamil, Hindi, Kannada, Telugu, Malayalam, Tanglish, Hinglish, Kanglish), regional slang, and emotional nuance.

Your primary objective is to produce MILLISECOND-ACCURATE, WORD-BY-WORD LIP-SYNCED JSON captions that capture every spoken phoneme, slang term, emotional tone, and proper noun with zero drift and zero omission.

=== 1. TASK MODE EXECUTION ===
Execute caption generation based on the specified OUTPUT_MODE:
1. MODE "TRANSCRIPTION_NATIVE": Transcribe the exact spoken words using the native script of the primary language (e.g., Tamil script, Hindi/Devanagari script, Kannada script).
2. MODE "TRANSLITERATION_ROMAN": Transcribe the exact spoken words phonetically using Latin/Roman script (e.g., Tanglish: "Maa Behen movie la vanthu...", Hinglish: "Yeh toh bilkul sahi hai..."). Preserve exact regional pronunciation and filler words.
3. MODE "TRANSLATION": Translate the spoken content into the specified TARGET_LANGUAGE (e.g., English). Do NOT condense, summarize, or alter the meaning. Preserve 100% semantic fidelity, tone, and emotional weight.

=== 2. ACOUSTIC ONSET/OFFSET LIP-SYNC ENGINE (ZERO DRIFT) ===
- STRICT SINGLE-WORD TOKENIZATION: Every item in the "words" array MUST contain EXACTLY ONE single word (e.g., "word": "society"). Never group multiple words into a single string.
- NO TIME-AVERAGING OR LINEAR INTERPOLATION: Do NOT calculate timestamps by dividing sentence duration equally across words. Identify the precise physical audio attack (consonant/vowel onset) and audio release (consonant decay/silence offset) for EACH individual word.
- ACOUSTIC PAUSE PRESERVATION: If a speaker pauses between words for >100ms, keep that gap empty (word[i].end_ms < word[i+1].start_ms). Never bridge captions over silent gaps or breath pauses.
- MONOTONIC TIMESTAMPS: Timestamps must strictly increase: word[i].start_ms >= word[i-1].end_ms and word[i].start_ms < word[i].end_ms. No negative or overlapping word durations.
- AUDIO END LOCK: Stop emitting word timestamps the exact millisecond physical speech ceases. Do NOT stretch captions to fill trailing background noise or video end.

=== 3. CLAUSE-LEVEL DURATION ANCHORING (FOR TRANSLATION & ROMAN MODES) ===
- PHYSICAL CLAUSE LOCK: Identify the exact start (clause_start_ms) and end (clause_end_ms) of the speaker's original audio utterance.
- DURATION STRETCHING: When translating to a language with fewer or more words than the spoken audio, mathematically distribute the target words so the first word starts at clause_start_ms and the final word ends EXACTLY at clause_end_ms.
- Character-Length Pacing Formula:
  word_duration = (word_char_count / total_clause_char_count) * (clause_end_ms - clause_start_ms)
- Prevents target captions from running ahead or disappearing early while the speaker is still talking.

=== 4. CONTEXT, EMOTION, SLANG & ENTITY INTELLIGENCE ===
- SLANG & FILLER FIDELITY: Never censor, filter, or skip regional slang, swear words, interjections, or colloquialisms (e.g., "maa behen", "machi", "ayyo", "da", "yaar", "solra", "chalta hai").
- EMOTIONAL & SITUATIONAL DECODING: Analyze vocal inflection, pitch rises, background context, and visual scenes to capture sarcastic queries, anger, sorrow, hype, or tension accurately.
- PROPER NOUNS & LOCATIONS: Identify proper names, movie titles, places, and brands accurately from contextual audio (e.g., "Rekha", "Maa Behen", "Hassan", "Bengaluru", "Ujire"). Always tag proper nouns with is_name: true.

=== 5. TAGGING & EMOJI ATTACHMENT RULES ===
- is_expression: true ONLY for standalone interjections, slang reactions, or isolated exclamations (e.g., "Ayyo!", "Hassan?", "Shut up"). Otherwise false.
- is_question: true if the word forms part of an interrogative sentence or carries a rising question pitch.
- is_name: true for people, places, movies, brands, or distinct entities.
- is_sentence_end: true ONLY on the last word of a completed grammatical phrase or sentence.
- EMOJI RULES:
  - If EMOJIS_ENABLED is true: Attach EXACTLY ONE contextually relevant emoji matching the emotional/situational tone of the sentence.
  - CRITICAL: The emoji field MUST be null for every word EXCEPT when is_sentence_end: true.

=== CAPTION CONFIGURATION ===
- TARGET_LANGUAGE: ${langLabel}
- USE_PUNCTUATION: ${usePunctuation}
- USE_EMOJIS: ${useEmojis}
- SPOKEN_LANGUAGE_HINT: ${langLabel}

=== OUTPUT FORMAT ===
Return ONLY a raw, valid JSON object matching this schema. No markdown formatting, code blocks, or conversational text.

{
  "audio_duration_ms": number,
  "words": [
    {
      "word": string,
      "start_ms": number,
      "end_ms": number,
      "is_question": boolean,
      "is_expression": boolean,
      "is_sentence_end": boolean,
      "emoji": string | null
    }
  ]
}`;

    sendLog(
      jobId,
      `⚡ Combined 1-call transcribe+caption (${GEMINI_PRIMARY_MODEL} → fallback) — ${geminiKeys.length} key(s)...`
    );

    const { result: rawWords, model } = await callGeminiWithModelFallback<
      { word: string; start_ms: number; end_ms: number; is_question?: boolean; is_expression?: boolean; is_name?: boolean; is_sentence_end?: boolean; emoji?: string | null }[]
    >(async (ai, modelName) => {
      const audioPart = await buildGeminiAudioPart(ai, audioFilePath, mimeType, jobId);
      const geminiRes = await ai.models.generateContent({
        model: modelName,
        contents: [
          audioPart,
          { text: "Transcribe and produce the final captions per your instructions. Return word-level timestamps in milliseconds." },
        ],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              total_speech_duration_ms: { type: Type.NUMBER },
              segments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    segment_id: { type: Type.NUMBER },
                    text_original: { type: Type.STRING },
                    text_translated: { type: Type.STRING },
                    emoji: { type: Type.STRING },
                    words: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          word: { type: Type.STRING },
                          start_ms: { type: Type.NUMBER },
                          end_ms: { type: Type.NUMBER },
                          is_question: { type: Type.BOOLEAN },
                          is_expression: { type: Type.BOOLEAN },
                          is_name: { type: Type.BOOLEAN },
                          is_sentence_end: { type: Type.BOOLEAN },
                          emoji: { type: Type.STRING },
                        },
                        required: ["word", "start_ms", "end_ms"],
                      },
                    },
                  },
                  required: ["words"],
                },
              },
            },
            required: ["segments"],
          },
        },
      });
      const text = geminiRes.text;
      if (!text) throw new Error("Combined call returned empty text.");
      const parsed = extractJsonFromResponse(text);

      // Support both new word-level and legacy phrase-level formats
      let words: any[] = [];
      if (Array.isArray(parsed.segments) && parsed.segments.length > 0) {
        parsed.segments.forEach((seg: any) => {
          if (Array.isArray(seg.words)) {
            if (seg.words.length > 0 && seg.emoji) {
              const lastWord = seg.words[seg.words.length - 1];
              if (!lastWord.emoji) lastWord.emoji = seg.emoji;
            }
            words.push(...seg.words);
          }
        });
        (words as any)._audioDurationMs = Number(parsed.total_speech_duration_ms) || 0;
      } else if (Array.isArray(parsed.words) && parsed.words.length > 0) {
        words = parsed.words;
        (words as any)._audioDurationMs = Number(parsed.audio_duration_ms) || 0;
      } else if (Array.isArray(parsed.phrases) && parsed.phrases.length > 0) {
        // Legacy phrase-level fallback: split phrases into words
        for (const p of parsed.phrases) {
          const text = String(p.text || "").trim();
          const ws = text.split(/\s+/).filter(Boolean);
          if (ws.length === 0) continue;
          const pStart = Number(p.start_time || 0) * 1000;
          const pEnd = Number(p.end_time || 0) * 1000;
          const pDur = Math.max(pEnd - pStart, 1);
          let charOffset = 0;
          const totalChars = text.replace(/\s/g, "").length || 1;
          for (let j = 0; j < ws.length; j++) {
            const wClean = ws[j].replace(/[.,!?;:'"]/g, "");
            const wChars = wClean.length || 1;
            const wStart = pStart + (charOffset / totalChars) * pDur;
            charOffset += wClean.length;
            const wEnd = j < ws.length - 1
              ? pStart + (charOffset / totalChars) * pDur
              : pEnd;
            words.push({
              word: ws[j],
              start_ms: Math.round(wStart),
              end_ms: Math.round(wEnd),
              is_question: j === ws.length - 1 ? !!p.is_question : false,
              is_expression: !!p.is_expression,
              is_name: !!p.is_name,
              is_sentence_end: j === ws.length - 1 ? !!p.is_sentence_end : false,
              emoji: j === ws.length - 1 ? (p.emoji || null) : null,
            });
          }
        }
        (words as any)._audioDurationMs = Number(parsed.audio_duration) * 1000 || 0;
      }
      if (words.length === 0) throw new Error("Combined call returned no words.");
      return words;
    }, jobId);

    // ---- Convert ms → seconds, validate coverage, normalize ----
    const rawW = (rawWords as any[]).map((w) => ({
      word: String(w.word || "").trim(),
      start_time: (Number(w.start_ms || 0)) / 1000,
      end_time: (Number(w.end_ms || 0)) / 1000,
      is_question: !!w.is_question,
      is_expression: !!w.is_expression,
      is_name: !!w.is_name,
      is_sentence_end: !!w.is_sentence_end,
      emoji: w.emoji || null,
    })).filter((w) => w.word.length > 0 && w.end_time > w.start_time);

    if (rawW.length === 0) {
      throw new Error("Combined call: no usable words after cleaning.");
    }

    // Attach emoji to sentence-end words if not already set by model
    if (useEmojis) {
      rawW.forEach((w, i) => {
        if (w.is_sentence_end && !w.emoji) {
          const emojiPool = ["🔥", "💪", "😂", "❤️", "😎", "👏", "💡", "😮", "😢", "🎉"];
          w.emoji = emojiPool[i % emojiPool.length];
        }
        if (w.is_sentence_end && w.emoji) {
          w.word = `${w.word} ${w.emoji}`;
        }
      });
    }

    // AUTO-SPEEDUP: For translation mode, compress translated word timestamps to
    // fit within source audio windows. Groups words by sentence boundaries and
    // applies character-weighted proportioning so the last word finishes exactly
    // when the speaker stops talking.
    const isTranslationMode = /translat|english/i.test(languageInstruction);
    if (isTranslationMode && rawW.length > 0) {
      // Group words into segments by sentence_end markers
      const segments: { start: number; end: number; words: typeof rawW }[] = [];
      let segWords: typeof rawW = [];
      for (const w of rawW) {
        segWords.push(w);
        if (w.is_sentence_end) {
          segments.push({
            start: segWords[0].start_time,
            end: segWords[segWords.length - 1].end_time,
            words: [...segWords],
          });
          segWords = [];
        }
      }
      if (segWords.length > 0) {
        segments.push({
          start: segWords[0].start_time,
          end: segWords[segWords.length - 1].end_time,
          words: [...segWords],
        });
      }

      // Apply speedup per segment
      const speedupResult: typeof rawW = [];
      for (const seg of segments) {
        speedupResult.push(...applySpeedupTimestamps(seg.words, seg.start, seg.end));
      }
      // Replace rawW with speedup-compressed words
      rawW.length = 0;
      rawW.push(...speedupResult);
    }

    const reportedDurationMs =
      targetDuration > 0
        ? targetDuration * 1000
        : (rawWords as any)._audioDurationMs ||
          Math.max(...rawW.map((w) => w.end_time * 1000), 1);
    const lastEndMs = Math.max(...rawW.map((w) => w.end_time * 1000));
    // If captions cover < 30% of the real audio, timing likely drifted → fall back.
    if (reportedDurationMs > 0 && lastEndMs < reportedDurationMs * 0.3) {
      throw new Error(
        `Combined call coverage too low (${(lastEndMs/1000).toFixed(1)}s of ${(reportedDurationMs/1000).toFixed(1)}s).`
      );
    }

    const stretchTarget = targetDuration > 0 ? targetDuration : reportedDurationMs / 1000;
    const normalized = normalizeTranscriptionTiming(
      normalizeWhisperWords(rawW),
      stretchTarget
    );
    if (normalized.length === 0) {
      throw new Error("Combined call produced no timed words after normalization.");
    }

    sendLog(
      jobId,
      `✅ Combined 1-call OK — ${normalized.length} words via ${model} (word-level ms).`
    );
    return { words: normalized, providerUsed: `${model} (1-call)` };
  }

  /** Legacy keyword emoji helper (used only if expert polish skipped) */
  function applyServerSideEmojis(
    words: TimedWord[],
    _emojiStyle: string,
    enabled: boolean
  ): TimedWord[] {
    if (!enabled) return words;
    // Convert word stream back into lines and stamp one alternating emoji per line
    const phrases = groupWordsIntoPhrases(words, 10, 0.65);
    const out: TimedWord[] = [];
    let cursor = 0;
    phrases.forEach((ph, idx) => {
      const chunk = words.slice(cursor, cursor + ph.words.length);
      cursor += ph.words.length;
      if (chunk.length === 0) return;
      const lineText = ensureOneLineEmoji(
        chunk.map((c) => stripAllEmojis(c.word)).join(" "),
        idx,
        true
      );
      const emojiMatch = lineText.match(/\p{Extended_Pictographic}/u);
      const last = chunk[chunk.length - 1];
      chunk[chunk.length - 1] = {
        ...last,
        word: emojiMatch
          ? `${stripAllEmojis(last.word)} ${emojiMatch[0]}`
          : stripAllEmojis(last.word),
      };
      // strip mid-word spam emojis from other words
      for (let i = 0; i < chunk.length - 1; i++) {
        chunk[i] = { ...chunk[i], word: stripAllEmojis(chunk[i].word) };
      }
      out.push(...chunk);
    });
    return out.length ? out : words;
  }

  async function enrichSubtitlesWithFallback(
    initialWords: any[],
    systemPrompt: string,
    jobId?: string
  ): Promise<{ words: any[]; providerUsed: string }> {
    sendLog(jobId, `Polishing subtitles via Gemini (${GEMINI_PRIMARY_MODEL} → fallback)... 🤖`);
    const { result, model } = await callGeminiWithModelFallback<any[]>(
      async (ai, modelName) => {
        const geminiResponse = await ai.models.generateContent({
          model: modelName,
          contents: `Here is the input JSON array of words to process:\n${JSON.stringify(initialWords, null, 2)}}`,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                words: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      start_time: { type: Type.NUMBER },
                      end_time: { type: Type.NUMBER },
                    },
                    required: ["word", "start_time", "end_time"],
                  },
                },
              },
              required: ["words"],
            },
          },
        });

        const resultText = geminiResponse.text;
        if (!resultText) {
          throw new Error("Gemini returned empty subtitles.");
        }
        const parsed = extractJsonFromResponse(resultText);
        let wordsList: any[] = [];
        if (parsed.words && Array.isArray(parsed.words)) {
          wordsList = parsed.words;
        } else if (Array.isArray(parsed)) {
          wordsList = parsed;
        }
        if (wordsList.length === 0) {
          throw new Error("Gemini returned empty or invalid formatted subtitles.");
        }
        return wordsList;
      },
      jobId
    );

    sendLog(jobId, `✨ Success! Subtitles generated/formatted using ${model}.`);
    return { words: result, providerUsed: model };
  }

  // --- GOOGLE SHEETS LOGGER ON BEHALF OF USER ---
  async function logActionToSheets(
    accessToken: string | null,
    action: "UPLOAD" | "EXPORT",
    filename: string,
    language: string,
    status: "SUCCESS" | "FAILED",
    details: string
  ) {
    if (!accessToken) {
      console.log(`[Sheets Logger] Skipped logging for ${action} because no user access token was provided.`);
      return;
    }

    try {
      console.log(`[Sheets Logger] Attempting to log ${action} action to Google Sheets...`);
      
      // 1. Search for spreadsheet named "Tanglish Studio Logs" in Google Drive
      const searchUrl = "https://www.googleapis.com/drive/v3/files?" + new URLSearchParams({
        q: "name='Tanglish Studio Logs' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields: "files(id, name)"
      }).toString();

      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!searchRes.ok) {
        throw new Error(`Drive search failed: ${searchRes.status} - ${await searchRes.text()}`);
      }

      const searchData = (await searchRes.json()) as any;
      let spreadsheetId = searchData.files?.[0]?.id;

      // 2. If not found, create a new spreadsheet
      if (!spreadsheetId) {
        console.log("[Sheets Logger] 'Tanglish Studio Logs' spreadsheet not found. Creating a new one...");
        const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            properties: {
              title: "Tanglish Studio Logs",
            },
          }),
        });

        if (!createRes.ok) {
          throw new Error(`Sheets creation failed: ${createRes.status} - ${await createRes.text()}`);
        }

        const createData = (await createRes.json()) as any;
        spreadsheetId = createData.spreadsheetId;

        // Write the header row
        const range = "Sheet1!A1:F1";
        const headerRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              values: [["Timestamp", "Action", "File Name", "Selected Language", "Status", "Details"]],
            }),
          }
        );

        if (!headerRes.ok) {
          console.warn("[Sheets Logger] Failed to write header row:", await headerRes.text());
        }
      }

      // 3. Append the action log row
      const timestamp = new Date().toISOString();
      const appendRange = "Sheet1!A:F";
      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${appendRange}:append?valueInputOption=USER_ENTERED`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            values: [[timestamp, action, filename, language, status, details]],
          }),
        }
      );

      if (!appendRes.ok) {
        throw new Error(`Append row failed: ${appendRes.status} - ${await appendRes.text()}`);
      }

      console.log(`[Sheets Logger] Successfully logged ${action} to spreadsheet ${spreadsheetId}`);
    } catch (err: any) {
      console.error("[Sheets Logger] Error logging to Google Sheets:", err.message || err);
    }
  }

  // Helper to extract access token from Authorization header
  function getAccessTokenFromHeader(req: express.Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }
    return null;
  }

  app.post("/api/transcribe", upload.single("video"), async (req, res) => {
    const jobId = req.query.jobId as string;
    const accessToken = getAccessTokenFromHeader(req);
    let audioPath: string | null = null;
    const processStartedAt = Date.now();
    const clientIp = getClientIp(req);

    // Block uploads during remote maintenance
    if (getRemoteConfig().maintenanceMode) {
      return res.status(503).json({ error: "App is in maintenance mode. Please try again later." });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video file provided" });
      }

      const {
        language = "tamil",
        useEmojis = "true",
        translationMode = "transliterate",
        usePunctuation = "true",
        emojiStyle = "vibes",
        // tracker fields from client
        sessionId = "",
        sessionFailCount = "0",
        clientTimezone = "",
        clientLanguage = "",
        clientUserAgent = "",
        clientLocation = "",
        mediaDurationSeconds = "",
        mediaTitle = "",
        styleSettingsJson = "",
      } = req.body;

      const isEmojiActive = useEmojis === "true";
      const isPunctuationActive = usePunctuation === "true";

      let parsedClientLocation: TrackerEvent["location"] = null;
      try {
        if (clientLocation) parsedClientLocation = JSON.parse(clientLocation);
      } catch {
        parsedClientLocation = null;
      }
      let parsedStyleSettings: Record<string, any> | undefined;
      try {
        if (styleSettingsJson) parsedStyleSettings = JSON.parse(styleSettingsJson);
      } catch {
        parsedStyleSettings = undefined;
      }
      const durationFromClient = mediaDurationSeconds !== "" ? parseFloat(mediaDurationSeconds) : null;
      
      sendLog(jobId, `Selected language: ${language.toUpperCase()} (${translationMode.toUpperCase()}) | Emojis: ${isEmojiActive ? 'YES' : 'NO'} (${emojiStyle.toUpperCase()}) | Punctuation: ${isPunctuationActive ? 'YES' : 'NO'}`);
      // The client already extracts a compact WAV before upload. If the input is
      // already an audio file, skip the costly WAV→MP3 re-encode and send it as-is.
      const incomingType = (req.file.mimetype || "").toLowerCase();
      const incomingName = (req.file.originalname || "").toLowerCase();
      const isAlreadyAudio =
        incomingType.startsWith("audio/") ||
        /\.(wav|mp3|m4a|aac|ogg|flac|opus)$/.test(incomingName);

      let mimeType: string;
      if (isAlreadyAudio) {
        sendLog(jobId, "Input is already audio — skipping re-encode (direct send).");
        audioPath = req.file.path;
        mimeType = incomingType.startsWith("audio/") ? incomingType : "audio/wav";
      } else {
        sendLog(jobId, "Extracting audio from video using FFmpeg...");
        audioPath = `${req.file.path}.mp3`;
        try {
          await execAsync(`ffmpeg -y -i "${req.file.path}" -vn -acodec libmp3lame -q:a 2 "${audioPath}"`);
          sendLog(jobId, "Audio extraction complete.");
        } catch (err) {
          sendLog(jobId, "Error extracting audio, falling back to original video file...");
          audioPath = req.file.path; // fallback
        }
        mimeType = audioPath.endsWith(".mp3") ? "audio/mpeg" : req.file.mimetype;
      }

      // Measure the REAL audio duration so captions can be stretched to cover 100%
      // of the video (model-reported durations are often under-reported).
      let realAudioDuration = 0;
      try {
        const probe = await execAsync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
        );
        realAudioDuration = parseFloat((probe.stdout || "").trim()) || 0;
        if (realAudioDuration > 0) {
          sendLog(jobId, `Measured audio duration: ${realAudioDuration.toFixed(2)}s`);
        }
      } catch (e) {
        sendLog(jobId, "Could not measure audio duration; will rely on model report.");
      }

      // Transcription is deferred until AFTER languageInstruction is built, so the
      // OPTIMIZED single-call path (transcribe + caption in one Gemini call) can use it.
      let initialWords: { word: string; start_time: number; end_time: number }[] = [];
      let transcriptionEngine = GEMINI_PRIMARY_MODEL;

      let languageInstruction = "";

      if (language === 'tamil') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            Translate the ORIGINAL Tamil/Tanglish Whisper transcript into polished NATURAL ENGLISH captions.
            Deeply repair meaning, brand names, emotion, and sales/ad logic.
            Examples: "with hidden charges" → "zero hidden charges"; wrong brand spellings → correct brand;
            tension about last-minute cancel → natural English.
            Output English only.
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Tamil (or a mix of Tamil and English). 
            You MUST convert and transliterate all Tamil speech to Roman script (Tanglish), using English alphabets/letters.
            Do NOT use any Tamil script characters (like செம்ம, சும்மா, மச்சி) under any circumstances.
            Examples: "சும்மா" -> "summa", "மாஸ்" -> "mass", "செம்ம" -> "sema", "மச்சி" -> "machi", "வேற லெவல்" -> "vera level", "என்ன" -> "enna".
          `;
        }
      } else if (language === 'hindi') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            Goal: polished NATURAL ENGLISH captions. Source is flawed Whisper English from Hindi/Hinglish audio.
            Deeply repair meaning, brand names, emotion, and logic. English only.
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Hindi (or a mix of Hindi and English).
            You MUST convert and transliterate all Hindi speech to Roman script (Hinglish), using English alphabets/letters.
            Do NOT use Devanagari script characters (like बहुत, बढ़िया, दोस्त, मस्त) under any circumstances.
            Examples: "बहुत बढ़िया" -> "bahut badiya", "मस्त" -> "mast", "दोस्त" -> "dost", "क्या" -> "kya", "चल" -> "chal", "भाई" -> "bhai".
          `;
        }
      } else if (language === 'telugu') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Telugu.
            You MUST TRANSLATE all Telugu speech into standard, natural, conversational English text.
            The subtitles MUST be written in English. Do NOT output Telugu phonetics. Translate the actual meaning to English.
            Examples: "బాగుంది" -> "good", "ఎలా ఉన్నావు" -> "how are you".
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Telugu (or a mix of Telugu and English).
          You MUST convert and transliterate all Telugu speech to Roman script (Telugish), using English alphabets/letters.
          Do NOT use Telugu script characters (like బాగుంది, ఎలా ఉన్నావు) under any circumstances.
          Examples: "బాగుంది" -> "bagundi", "ఎలా ఉన్నావు" -> "ela unnavu", "சூப்பர்" -> "super", "மித்ரமா" -> "mitrama".
          `;
        }
      } else if (language === 'kannada') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Kannada.
            You MUST TRANSLATE all Kannada speech into standard, natural, conversational English text.
            The subtitles MUST be written in English. Do NOT output Kannada phonetics. Translate the actual meaning to English.
            Examples: "ಚೆನ್ನಾಗಿದೆ" -> "it is good", "ಹೇಗಿದ್ದೀರಾ" -> "how are you".
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Kannada (or a mix of Kannada and English).
          You MUST convert and transliterate all Kannada speech to Roman script (Kannadish), using English alphabets/letters.
          Do NOT use Kannada script characters (like ಚೆನ್ನಾಗಿದೆ, ಹೇಗಿದ್ದೀರಾ) under any circumstances.
          Examples: "ಚೆನ್ನಾಗಿದೆ" -> "chennagide", "ಹೇಗಿದ್ದೀರಾ" -> "hegiddira", "ಬಾ" -> "baa", "ಧನ್ಯವಾದಗಳು" -> "dhanyavadagalu".
          `;
        }
      } else if (language === 'malayalam') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Malayalam.
            You MUST TRANSLATE all Malayalam speech into standard, natural, conversational English text.
            The subtitles MUST be written in English. Do NOT output Malayalam phonetics. Translate the actual meaning to English.
            Examples: "സുഖമാണോ" -> "are you fine", "அடிபொளி" -> "awesome".
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Malayalam (or a mix of Malayalam and English).
          You MUST convert and transliterate all Malayalam speech to Roman script (Manglish), using English alphabets/letters.
          Do NOT use Malayalam script characters (like സുഖമാണോ, அடിപൊളി) under any circumstances.
          Examples: "സുഖമാണോ" -> "sukhamano", "அடிപொளி" -> "adipoli", "ഗംഭീരം" -> "gambheeram", "നന്ദി" -> "nandi".
          `;
        }
      } else if (language === 'spanish') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Spanish. You MUST translate all Spanish speech to clear, natural conversational English.
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Spanish. Provide standard Spanish subtitles in Roman letters.
          `;
        }
      } else if (language === 'italian') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Italian. You MUST translate all Italian speech to clear, natural conversational English.
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Italian. Provide standard Italian subtitles in Roman letters.
          `;
        }
      } else if (language === 'english') {
        languageInstruction = `
          The spoken speech is in English. Provide standard English subtitles. Fix only obvious ASR mistakes.
        `;
      } else {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            Goal: polished NATURAL ENGLISH captions from flawed Whisper output (any regional source language).
            Deeply repair logic, brand names, emotion, and spoken tone. English only. No leftover regional script.
          `;
        } else {
          languageInstruction = `
            Detect the spoken language automatically. If the language is a regional Indian language (such as Tamil, Hindi, Telugu, Kannada, Malayalam, etc.), you MUST convert and transliterate all regional speech to Roman script (e.g. Tanglish, Hinglish, Telugish, Manglish, Kannadish) using English alphabets/letters.
            Do NOT use native regional script characters under any circumstances.
          `;
        }
      }

      // If user selected "keep_script", preserve the native script (no transliteration)
      if (translationMode === 'keep_script') {
        languageInstruction = `
          Keep the original language in its NATIVE script. Do NOT transliterate or convert to Roman script.
          Preserve Tamil/Telugu/Kannada/Malayalam/Hindi/other native characters exactly as spoken.
        `;
      }

      // Gemini 2.5 Flash (original language) → Gemini 2.5 Flash (English lip-sync captions)
      let finalWords: any[] = [];
      let providerUsed = "Raw Fallback";

      const effectiveLangInstruction =
        languageInstruction ||
        "Translate original-language Whisper transcript into natural accurate English captions. Fix ASR logic errors and brand names. Match syllable count to each timestamp window.";

      // ---- OPTIMIZED: try the single-call transcribe+caption path first ----
      let combinedOk = false;
      try {
        const combined = await transcribeAndPolishCombined(
          audioPath,
          mimeType,
          effectiveLangInstruction,
          isPunctuationActive,
          isEmojiActive,
          jobId,
          String(language || "auto"),
          realAudioDuration
        );
        finalWords = combined.words;
        providerUsed = combined.providerUsed;
        transcriptionEngine = combined.providerUsed;
        combinedOk = true;
      } catch (combErr: any) {
        sendLog(
          jobId,
          `Single-call path fell back to 2-call flow (${combErr.message || combErr}).`
        );
      }

      // ---- FALLBACK: proven 2-call flow (transcribe → polish) ----
      if (!combinedOk) {
        try {
          sendLog(jobId, "Step 1/2: Gemini — ORIGINAL language transcription...");
          const geminiResult = await transcribeWithGeminiFlash(
            audioPath,
            mimeType,
            jobId,
            language,
            3,
            realAudioDuration
          );
          initialWords = geminiResult.words;
          transcriptionEngine = geminiResult.model;
          sendLog(
            jobId,
            `Original-language transcript ready: ${initialWords.length} timed phrases.`
          );
        } catch (geminiErr: any) {
          sendLog(
            jobId,
            `Transcription failed after all retries (${geminiErr.message || geminiErr}).`
          );
          throw geminiErr;
        }

        try {
          sendLog(
            jobId,
            `Step 2/2: Gemini English captions from original ${language} transcript...`
          );
          const polished = await polishWhisperPhrases(
            initialWords,
            effectiveLangInstruction,
            isPunctuationActive,
            jobId,
            isEmojiActive,
            String(language || "auto")
          );
          finalWords = polished.words;
          providerUsed = polished.providerUsed;
        } catch (err: any) {
          sendLog(
            jobId,
            `Warning: polish pipeline failed: ${err.message}. Using raw Whisper words + line emojis.`
          );
          finalWords = applyServerSideEmojis(
            normalizeWhisperWords(initialWords),
            emojiStyle,
            isEmojiActive
          );
          providerUsed = "Whisper raw + line-emojis";
        }
      }

      // Attach engine name for tracker later
      (req as any)._transcriptionEngine = transcriptionEngine;

      sendLog(jobId, "Cleaning up...");
      if (audioPath && audioPath !== req.file.path && fs.existsSync(audioPath)) {
        try { fs.unlinkSync(audioPath); } catch (e) {}
      }

      // Log success to Google Sheets
      if (accessToken) {
        logActionToSheets(
          accessToken, 
          "UPLOAD", 
          req.file.originalname || "audio_file", 
          language, 
          "SUCCESS", 
          `Processed ${finalWords.length} words using ${providerUsed}.`
        ).catch(err => console.error("Sheets log background failed:", err));
      }

      // Never send ASS layout tags (e.g. \an2\pos(...)) as caption text to the UI
      const cleanedWords = (finalWords || []).map((w: any) => ({
        ...w,
        word: stripASSOverrides(String(w?.word ?? "")),
      })).filter((w: any) => String(w.word || "").trim().length > 0);

      const transcript = wordsToTranscript(cleanedWords);
      const processingMs = Date.now() - processStartedAt;

      // Duration: client probe, else last word end time
      let durationSeconds =
        durationFromClient != null && Number.isFinite(durationFromClient)
          ? durationFromClient
          : null;
      if (durationSeconds == null && cleanedWords.length > 0) {
        const last = cleanedWords[cleanedWords.length - 1];
        if (typeof last.end_time === "number") durationSeconds = last.end_time;
      }

      // Fire-and-forget tracker email to owner
      (async () => {
        const ipGeo = await lookupIpGeo(clientIp);
        const location = parsedClientLocation?.latitude != null
          ? { ...parsedClientLocation, ...ipGeo, source: parsedClientLocation.source || ipGeo?.source }
          : ipGeo;

        await trackEvent({
          event: "upload",
          timestamp: new Date().toISOString(),
          sessionId: sessionId || undefined,
          title: mediaTitle || req.file!.originalname,
          filename: req.file!.originalname || req.file!.filename,
          mediaType: req.file!.mimetype,
          mediaSizeBytes: req.file!.size,
          durationSeconds,
          userAgent: clientUserAgent || String(req.headers["user-agent"] || ""),
          language: clientLanguage || language,
          timezone: clientTimezone,
          clientIp,
          location,
          aiProvider: `${(req as any)._transcriptionEngine || GEMINI_PRIMARY_MODEL} + polish:${providerUsed}`,
          aiModel: (req as any)._transcriptionEngine || GEMINI_PRIMARY_MODEL,
          processingMs,
          sessionFailCount: parseInt(String(sessionFailCount), 10) || 0,
          wordCount: cleanedWords.length,
          fullTranscript: transcript,
          transcriptPreview: transcript.slice(0, 400),
          uploadOptions: {
            language,
            translationMode,
            useEmojis: isEmojiActive,
            usePunctuation: isPunctuationActive,
            emojiStyle,
          },
          styleSettings: parsedStyleSettings,
        });
      })().catch((err) => console.error("[Tracker] upload event failed:", err));

      sendLog(jobId, "Done! Results ready.");
      res.json({ words: cleanedWords, filename: req.file.filename, providerUsed, processingMs });
    } catch (error: any) {
      sendLog(jobId, "ERROR: " + error.message);
      console.error("Transcription error:", error);
      
      // Log failure to Google Sheets
      if (accessToken && req.file) {
        logActionToSheets(
          accessToken, 
          "UPLOAD", 
          req.file.originalname || "audio_file", 
          "N/A", 
          "FAILED", 
          error.message || "Unknown transcription error"
        ).catch(err => console.error("Sheets log background failed:", err));
      }

      // Tracker: failure email
      try {
        const body = req.body || {};
        (async () => {
          const ipGeo = await lookupIpGeo(clientIp);
          let loc: TrackerEvent["location"] = ipGeo;
          try {
            if (body.clientLocation) {
              loc = { ...JSON.parse(body.clientLocation), ...ipGeo };
            }
          } catch { /* ignore */ }
          await trackEvent({
            event: "upload_failed",
            timestamp: new Date().toISOString(),
            sessionId: body.sessionId || undefined,
            title: body.mediaTitle || req.file?.originalname,
            filename: req.file?.originalname || req.file?.filename,
            mediaType: req.file?.mimetype,
            mediaSizeBytes: req.file?.size,
            durationSeconds: body.mediaDurationSeconds ? parseFloat(body.mediaDurationSeconds) : null,
            userAgent: body.clientUserAgent || String(req.headers["user-agent"] || ""),
            language: body.clientLanguage || body.language,
            timezone: body.clientTimezone,
            clientIp,
            location: loc,
            processingMs: Date.now() - processStartedAt,
            sessionFailCount: parseInt(String(body.sessionFailCount || "0"), 10) || 0,
            errorMessage: error.message || "Unknown transcription error",
            uploadOptions: {
              language: body.language,
              translationMode: body.translationMode,
              useEmojis: body.useEmojis,
              usePunctuation: body.usePunctuation,
              emojiStyle: body.emojiStyle,
            },
          });
        })().catch((err) => console.error("[Tracker] fail event error:", err));
      } catch {
        /* ignore tracker errors */
      }

      res.status(500).json({ error: error.message || "Failed to transcribe video" });
      
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      if (audioPath && audioPath !== req.file?.path && fs.existsSync(audioPath)) {
        try { fs.unlinkSync(audioPath); } catch (e) {}
      }
    }
  });

  app.post("/api/transcribe-mic", upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const fileBuffer = fs.readFileSync(req.file.path);
      const mimeType = req.file.mimetype || "audio/webm";
      const language = req.body.language || "auto";
      const translationMode = req.body.translationMode || "transliterate";

      let languageInstruction = "";
      if (translationMode === "translate_english") {
        languageInstruction = `Translate all non-English speech to polished NATURAL ENGLISH captions. Fix logic errors, brand names, and grammar. Output English only.`;
      } else if (translationMode === "keep_script") {
        languageInstruction = `Keep the original language in its NATIVE script. Do NOT transliterate or convert to Roman script. Preserve native characters exactly as spoken.`;
      } else {
        switch (language) {
          case "tamil":
            languageInstruction = `Convert Tamil speech to Roman script (Tanglish). Do NOT use Tamil script. Examples: "சும்மா" -> "summa", "மாஸ்" -> "mass".`;
            break;
          case "hindi":
            languageInstruction = `Convert Hindi speech to Roman script (Hinglish). Do NOT use Devanagari script. Examples: "बहुत बढ़िया" -> "bahut badiya".`;
            break;
          case "telugu":
            languageInstruction = `Convert Telugu speech to Roman script (Telugish). Do NOT use Telugu script. Examples: "బాగుంది" -> "bagundi".`;
            break;
          case "kannada":
            languageInstruction = `Convert Kannada speech to Roman script (Kannadish). Do NOT use Kannada script. Examples: "ಚೆನ್ನಾಗಿದೆ" -> "chennagide".`;
            break;
          case "malayalam":
            languageInstruction = `Convert Malayalam speech to Roman script (Manglish). Do NOT use Malayalam script. Examples: "സുഖമാണോ" -> "sukhamano".`;
            break;
          case "auto":
            languageInstruction = `Auto-detect the spoken language. If it is a regional Indian language, provide Romanized transliteration (Tanglish/Hinglish). If English, provide standard English. Also provide an English translation.`;
            break;
          default:
            languageInstruction = `Transcribe in the original language and also provide an English translation.`;
        }
      }

      const prompt = `You are a professional, frame-accurate audio transcriber. Transcribe the spoken speech from this microphone recording verbatim.

TIMING IS CRITICAL. Each word must have precise "start_time" and "end_time" in SECONDS.
Preserve silence between phrases. The first word's start_time should be when speech begins.
The last word's end_time must reach the end of the audio.

Language instructions: ${languageInstruction}

Return ONLY a JSON object (no markdown, no code fences):
{
  "audio_duration": number,
  "words": [ { "word": string, "start_time": number, "end_time": number } ]
}`;

      let words: any[] = [];
      let transcript = "";

      const { result } = await callGeminiWithModelFallback<any>(
        async (ai, modelName) => {
          const geminiRes = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                inlineData: {
                  data: fileBuffer.toString("base64"),
                  mimeType: mimeType
                }
              },
              { text: prompt }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  audio_duration: { type: Type.NUMBER },
                  words: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        word: { type: Type.STRING },
                        start_time: { type: Type.NUMBER },
                        end_time: { type: Type.NUMBER },
                      },
                      required: ["word", "start_time", "end_time"],
                    },
                  },
                },
                required: ["words"],
              },
            },
          });

          const text = geminiRes.text;
          if (!text) throw new Error("Gemini returned empty transcription text.");
          const parsed = extractJsonFromResponse(text);
          words = (parsed.words || []).map((w: any) => ({
            word: String(w.word || w.text || "").trim(),
            start_time: Number(w.start_time || w.start || 0),
            end_time: Number(w.end_time || w.end || 0),
          })).filter((w: any) => w.word.length > 0);
          transcript = words.map((w: any) => w.word).join(" ");
          return { words, transcript };
        },
        undefined
      );

      // Cleanup
      try { fs.unlinkSync(req.file.path); } catch (e) {}

      res.json({ transcript, words });
    } catch (error: any) {
      console.error("Microphone transcription error:", error);
      res.status(500).json({ error: error.message || "Failed to transcribe microphone audio" });
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
    }
  });

  app.post("/api/export", upload.single("video"), async (req, res) => {
    const jobId = req.query.jobId as string || Math.random().toString(36).substring(7);
    const accessToken = getAccessTokenFromHeader(req);
    let assPath: string | null = null;
    let outputPath: string | null = null;
    let videoPath = "";
    let isLocalRef = false;
    let originalName = "unknown_video";
    try {
      const { words: wordsJson, styleSettings: styleSettingsJson, videoWidth, videoHeight, filename, displayWidth, displayHeight } = req.body;
      
      if (filename) {
        videoPath = path.join(process.cwd(), "uploads", filename);
        originalName = filename;
        if (fs.existsSync(videoPath)) {
          isLocalRef = true;
          sendLog(jobId, "Using cached original video file on server (high-speed bypass)...");
        } else {
          return res.status(400).json({ error: "Specified file does not exist on server" });
        }
      } else {
        if (!req.file) {
          return res.status(400).json({ error: "No video file provided" });
        }
        videoPath = req.file.path;
        originalName = req.file.originalname;
      }

      if (!wordsJson || !styleSettingsJson) {
        return res.status(400).json({ error: "Missing words or style settings" });
      }

      const words = JSON.parse(wordsJson);
      const styleSettings = JSON.parse(styleSettingsJson);
      const width = parseInt(videoWidth) || 1080;
      const height = parseInt(videoHeight) || 1920;
      const dispWidth = parseInt(displayWidth) || 340;
      const dispHeight = parseInt(displayHeight) || 604;

      sendLog(jobId, "Preparing subtitles style...");
      const playResX = width;
      const playResY = height;

      // Default font mapping
      let fontName = "Arial";
      if (styleSettings.fontFamily === "Impact") fontName = "Impact";
      else if (styleSettings.fontFamily === "Inter") fontName = "Arial";
      else if (styleSettings.fontFamily === "Space Grotesk") fontName = "Arial";
      else if (styleSettings.fontFamily === "Courier") fontName = "Courier New";
      else if (styleSettings.fontFamily === "Fredoka") fontName = "Arial";

      // Scale font size perfectly using the vertical ratio of real height vs display height
      const scaleX = width / dispWidth;
      const scaleY = height / dispHeight;
      const baseFontSize = Math.round((32 * (styleSettings.fontSize || 1.0)) * scaleY);

      const primaryCol = hexToASSColor(styleSettings.textColor || "#FFFFFF");
      const highlightCol = hexToASSColor(styleSettings.highlightColor || "#FACC15");
      // Override tags require trailing & (e.g. \c&H00FFFFFF&) — missing & makes libass print tags as text
      const primaryOverride = hexToASSOverrideColor(styleSettings.textColor || "#FFFFFF");
      const highlightOverride = hexToASSOverrideColor(styleSettings.highlightColor || "#FACC15");
      const spotlightDimOverride = "&H00888888&";

      const borderStyle = styleSettings.showBackground ? "3" : "1";
      const outlineSize = styleSettings.showBackground ? "4" : "2";
      const shadowSize = styleSettings.showBackground ? "0" : "1";

      // Alignment 2 = bottom-center; actual placement is driven by \pos in each dialogue line
      const alignment = "2";

      let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
PlayDepth: 0
Timer: 100.0000
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${baseFontSize},${primaryCol},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,${borderStyle},${outlineSize},${shadowSize},${alignment},10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

      const formatText = (text: string) => {
        // Never let raw ASS tags from transcript leak into burned output
        let cleaned = stripASSOverrides(text);
        cleaned = escapeASSText(cleaned);
        if (styleSettings.capitalization === "all") return cleaned.toUpperCase();
        if (styleSettings.capitalization === "lower") return cleaned.toLowerCase();
        if (styleSettings.capitalization === "sentence") {
          return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        }
        return cleaned;
      };

      words.forEach((w: any, k: number) => {
        const start = w.start_time;
        let end = w.end_time;
        if (k < words.length - 1) {
          if (words[k + 1].start_time - end < 1.5) {
            end = words[k + 1].start_time;
          }
        }

        const maxWords = styleSettings.maxWordsPerScreen || 1;
        const chunkIndex = Math.floor(k / maxWords);
        const startIdx = chunkIndex * maxWords;
        const endIdx = Math.min(startIdx + maxWords, words.length);

        const windowWords = words.slice(startIdx, endIdx);

        // Absolute position on the real video frame (PlayRes coordinates)
        const posXReal = Math.round((dispWidth / 2 + (styleSettings.positionX || 0)) * scaleX);
        const posYReal = Math.round((dispHeight - (96 + (styleSettings.positionY || 0))) * scaleY);

        const rotationAngle = parseInt(String(styleSettings.rotation), 10) || 0;
        // Alignment (2 = bottom-center) is defined ONCE in [V4+ Styles] — do NOT inject \an2
        // inline. Some FFmpeg/libass builds mis-parse {\an2\pos(...)} and paint "2\pos(...)" as text.
        // Dialogue lines only carry clean position (+ optional rotation).
        let layoutTags = `\\pos(${posXReal},${posYReal})`;
        if (rotationAngle) {
          layoutTags += `\\frz${-rotationAngle}`;
        }

        const textParts = windowWords.map((ww: any, index: number) => {
          const originalIndex = startIdx + index;
          const formattedWord = formatText(ww.word);
          if (!formattedWord) return "";

          // Split emoji from the text so the emoji is NOT tinted by the word's color
          // override. Emoji is rendered with a style reset ({\r}) so libass draws the
          // native color glyph instead of a solid white/monochrome version.
          const emojiMatch = formattedWord.match(/\p{Extended_Pictographic}/u);
          let textOnly = formattedWord;
          let emojiOnly = "";
          if (emojiMatch) {
            emojiOnly = emojiMatch[0];
            textOnly = stripAllEmojis(formattedWord);
          }
          if (!textOnly) {
            // Word is ONLY an emoji — render it with no color tint
            return emojiOnly ? `{\\r}${emojiOnly}` : "";
          }

          const weight = originalIndex === k ? "\\b1" : "\\b0";
          const color =
            originalIndex === k
              ? highlightOverride
              : styleSettings.showSpotlight
              ? spotlightDimOverride
              : primaryOverride;

          let run = `{\\c${color}${weight}}${textOnly}`;
          if (emojiOnly) {
            run += `{\\r}${emojiOnly}`;
          }
          return run;
        }).filter(Boolean);

        // Layout override first (position only), then styled words — never leak raw tags to screen
        const textLine = `{${layoutTags}}${textParts.join(" ")}`;
        assContent += `Dialogue: 0,${formatASSTime(start)},${formatASSTime(end)},Default,,0,0,0,,${textLine}\n`;
      });

      assPath = `${videoPath}.ass`;
      // UTF-8 without BOM — BOM can cause the first override tag to be misread as text
      fs.writeFileSync(assPath, assContent, { encoding: "utf8" });
      sendLog(jobId, "Subtitles file written successfully.");

      outputPath = `${videoPath}_exported.mp4`;
      sendLog(jobId, "Starting FFmpeg burning filter (superfast profile, balanced quality/size)...");

      const relFile = path.relative(process.cwd(), videoPath).replace(/\\/g, "/");
      const relAss = path.relative(process.cwd(), assPath).replace(/\\/g, "/");
      const relOutput = path.relative(process.cwd(), outputPath).replace(/\\/g, "/");

      // Prefer `ass` filter (native ASS/libass). Escape only characters that break the filtergraph.
      const assFilterPath = relAss.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

      // Audio-only sources have no video track -> synthesize a solid-color canvas
      // using the chosen background color, then burn subtitles on top.
      const styleBg = (styleSettings as any)?.background as string | undefined;
      const hasVideoStream = await (async () => {
        try {
          const { stdout } = await execAsync(
            `ffprobe -v error -select_streams v:0 -show_entries stream=index -of csv=p=0 "${relFile}"`
          );
          return stdout.trim().length > 0;
        } catch {
          return false;
        }
      })();

      if (!hasVideoStream && styleBg) {
        const hex = styleBg.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const colorExpr = `0x${hex}`;
        sendLog(jobId, "Audio-only detected: generating colored background canvas...");
        await execAsync(
          `ffmpeg -y -f lavfi -i "color=c=${colorExpr}:s=${width}x${height}:r=30" -i "${relFile}" ` +
          `-shortest -vf "ass='${assFilterPath}'" -preset medium -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -threads 0 "${relOutput}"`
        );
      } else {
        await execAsync(
          `ffmpeg -y -i "${relFile}" -vf "ass='${assFilterPath}'" -preset medium -c:v libx264 -crf 18 -c:a copy -threads 0 "${relOutput}"`
        );
      }
      
      sendLog(jobId, "FFmpeg video export complete!");

      // Log export success to Google Sheets
      if (accessToken) {
        logActionToSheets(
          accessToken, 
          "EXPORT", 
          originalName, 
          styleSettings.preset || "N/A", 
          "SUCCESS", 
          `Burned ${words.length} subtitles onto video via server render.`
        ).catch(err => console.error("Sheets export log background failed:", err));
      }

      res.download(outputPath, "tanglish_studio_video.mp4", (err) => {
        // cleanup temp files
        if (!isLocalRef && videoPath && fs.existsSync(videoPath)) {
          try { fs.unlinkSync(videoPath); } catch (e) {}
        }
        if (assPath && fs.existsSync(assPath)) {
          try { fs.unlinkSync(assPath); } catch (e) {}
        }
        if (outputPath && fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (e) {}
        }
      });
    } catch (error: any) {
      sendLog(jobId, "Export error: " + error.message);
      console.error("Export error:", error);

      // Log export failure to Google Sheets
      if (accessToken) {
        logActionToSheets(
          accessToken, 
          "EXPORT", 
          originalName, 
          "N/A", 
          "FAILED", 
          error.message || "Unknown export error"
        ).catch(err => console.error("Sheets export log background failed:", err));
      }

      res.status(500).json({ error: "Failed to export video with subtitles" });
      
      // cleanup temp files
      if (!isLocalRef && videoPath && fs.existsSync(videoPath)) {
        try { fs.unlinkSync(videoPath); } catch (e) {}
      }
      if (assPath && fs.existsSync(assPath)) {
        try { fs.unlinkSync(assPath); } catch (e) {}
      }
      if (outputPath && fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch (e) {}
      }
    }
  });

  // ---- Public config (no secrets) — clients poll this for live app updates ----
  app.get("/api/config/public", (_req, res) => {
    res.json(getPublicConfig());
  });

  // ---- Admin: update API keys / tracker email / maintenance (all users pick up live) ----
  function requireAdmin(req: express.Request, res: express.Response): boolean {
    const secret = process.env.ADMIN_SECRET || "";
    if (!secret) {
      res.status(503).json({
        error: "Set ADMIN_SECRET in .env before using admin APIs.",
      });
      return false;
    }
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : String(req.headers["x-admin-secret"] || "");
    if (token !== secret) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

  app.get("/api/admin/config", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const cfg = getRemoteConfig();
    // Mask secrets in GET response
    const mask = (v: string) =>
      !v ? "" : v.length <= 8 ? "***" : `${v.slice(0, 4)}...${v.slice(-4)} (len ${v.length})`;
    res.json({
      ...cfg,
      GEMINI_API_KEY: mask(cfg.GEMINI_API_KEY),
      note: "Values are masked. POST full keys (comma/space separated for rotation) to update. Empty string keeps existing key.",
    });
  });

  app.post("/api/admin/config", express.json(), (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const current = getRemoteConfig();
    const next = saveRemoteConfig({
      GEMINI_API_KEY:
        body.GEMINI_API_KEY === undefined || body.GEMINI_API_KEY === ""
          ? current.GEMINI_API_KEY
          : String(body.GEMINI_API_KEY),
      trackerEmail:
        body.trackerEmail !== undefined ? String(body.trackerEmail) : current.trackerEmail,
      appAnnouncement:
        body.appAnnouncement !== undefined ? String(body.appAnnouncement) : current.appAnnouncement,
      maintenanceMode:
        body.maintenanceMode !== undefined ? !!body.maintenanceMode : current.maintenanceMode,
      minClientVersion:
        body.minClientVersion !== undefined ? String(body.minClientVersion) : current.minClientVersion,
    });
    loadGeminiKeys();
    res.json({
      ok: true,
      updatedAt: next.updatedAt,
      message: "Config saved. All users will use new keys on next request / poll.",
    });
  });

  // ---- TELEGRAM BOT LOGGING ----
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8776737859:AAFgr2jY5VEaD8ksC5fOspR1KquPnw65KxU";
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "6076329360";

  async function sendToTelegram(message: string) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
        }),
      });
    } catch (err: any) {
      console.error("[Telegram] Send failed:", err.message);
    }
  }

  app.post("/api/telegram/notify", express.json(), async (req, res) => {
    try {
      const {
        deviceId = "",
        brand = "",
        model = "",
        osVersion = "",
        userAgent = "",
        fileName = "",
        fileSize = "",
        audioSize = "",
        aiProcessingCount = 0,
        isExport = false,
        source = "unknown",
        language = "",
        translationMode = "",
        aiModel = "",
        mediaDuration = "",
        emojiStyle = "",
        useEmojis,
        usePunctuation,
        captionWords = 0,
        exportMethod = "",
        isError = false,
        errorMessage = "",
        errorStage = "",
      } = req.body;

      const esc = (s: string) =>
        String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      const sourceEmoji = source === 'mic' ? '🎙️' : source === 'audio' ? '🎵' : source === 'video' ? '🎬' : '📎';
      const sourceLabel = source === 'mic' ? 'Microphone Recording' : source === 'audio' ? 'Audio File' : source === 'video' ? 'Video File' : 'Unknown';

      if (isError) {
        const errLines = [
          `<b>🚨 Tanglish Caption Studio — ERROR</b>`,
          ``,
          `<b>━━━ Device ━━━</b>`,
          `📱 <b>Device:</b> ${esc(brand)} ${esc(model)}`,
          `🆔 <b>ID:</b> <code>${esc(deviceId)}</code>`,
          `💻 <b>OS:</b> ${esc(osVersion)}`,
          ``,
          `<b>━━━ File ━━━</b>`,
          `${sourceEmoji} <b>Source:</b> ${sourceLabel}`,
          `📄 <b>File:</b> ${esc(fileName)}`,
          `📦 <b>File Size:</b> ${esc(fileSize)}`,
          ``,
          `<b>━━━ Error ━━━</b>`,
          `⚠️ <b>Stage:</b> ${esc(errorStage) || 'N/A'}`,
          `❌ <b>Detail:</b>`,
          `<code>${esc(errorMessage).slice(0, 800) || 'Unknown error'}</code>`,
          ``,
          `⏰ <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
        ];
        await sendToTelegram(errLines.join('\n'));
        return res.json({ ok: true });
      }

      const lines = [
        `<b>📱 Tanglish Caption Studio</b>`,
        ``,
        `<b>━━━ Device ━━━</b>`,
        `📱 <b>Device:</b> ${brand} ${model}`,
        `🆔 <b>ID:</b> <code>${deviceId}</code>`,
        `💻 <b>OS:</b> ${osVersion}`,
        ``,
        `<b>━━━ File ━━━</b>`,
        `${sourceEmoji} <b>Source:</b> ${sourceLabel}`,
        `📄 <b>File:</b> ${fileName}`,
        `📦 <b>File Size:</b> ${fileSize}`,
        `🎵 <b>Audio Size:</b> ${audioSize}`,
        `⏱️ <b>Duration:</b> ${mediaDuration || 'N/A'}`,
      ];

      if (!isExport) {
        lines.push(
          ``,
          `<b>━━━ AI Processing ━━━</b>`,
          `🤖 <b>Model:</b> ${aiModel || 'Gemini 3.5 Flash'}`,
          `🗣️ <b>Language:</b> ${language || 'N/A'}`,
          `🔄 <b>Mode:</b> ${translationMode || 'N/A'}`,
          `📝 <b>Caption Words:</b> ${captionWords || aiProcessingCount}`,
          `😊 <b>Emoji Style:</b> ${emojiStyle || 'N/A'}`,
          `✅ <b>Emojis:</b> ${useEmojis === true ? 'ON' : useEmojis === false ? 'OFF' : 'N/A'}`,
          `✅ <b>Punctuation:</b> ${usePunctuation === true ? 'ON' : usePunctuation === false ? 'OFF' : 'N/A'}`,
        );
      } else {
        lines.push(
          ``,
          `<b>━━━ Export ━━━</b>`,
          `🚀 <b>Method:</b> ${exportMethod === 'local' ? 'Local GPU Burn' : exportMethod === 'cloud' ? 'Cloud Render' : 'N/A'}`,
          `📝 <b>Caption Words:</b> ${captionWords || aiProcessingCount}`,
        );
      }

      lines.push(
        ``,
        `⏰ <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
      );

      const msg = lines.join('\n');

      await sendToTelegram(msg);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tracker/ping", express.json(), async (req, res) => {
    try {
      const ip = getClientIp(req);
      await trackEvent({
        event: "session_ping",
        timestamp: new Date().toISOString(),
        sessionId: req.body?.sessionId,
        clientIp: ip,
        userAgent: String(req.headers["user-agent"] || ""),
        extra: req.body || {},
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "tracker ping failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global error handler — returns JSON so the client never sees raw HTML
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Global Error]", err);
    const status = err.status || err.statusCode || 500;
    const msg = err.message || "Internal server error";
    if (!res.headersSent) {
      res.status(status).json({ error: msg });
    }
  });

  // Only bind a TCP port when running as a standalone server (local dev / own host).
  // On serverless platforms (Vercel) the app is mounted by api/index.ts instead.
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Tracker email → ${getRemoteConfig().trackerEmail || "shrihari52141@gmail.com"}`);
      console.log(`Remote config → remote-config.json (edit or POST /api/admin/config)`);
    });
  }
}

// When run directly (npm run dev / npm start) start the server.
// On Vercel this module is imported by api/index.ts and must NOT call app.listen.
if (!process.env.VERCEL) {
  startServer();
}
