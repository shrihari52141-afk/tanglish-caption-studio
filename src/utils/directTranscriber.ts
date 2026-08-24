import { CaptionWord } from '../types';
import { continuousPiecewiseAlignment, sanitizeCaptionWords, stripASSTags } from './captionFormatter';
import { extractAudioTrack } from './audioExtractor';

export interface DirectTranscribeOptions {
  file: File;
  language?: string;
  scriptMode?: 'tanglish' | 'native' | 'english';
  translationMode?: string;
  useEmojis?: boolean;
  usePunctuation?: boolean;
  emojiStyle?: string;
  enableHotwords?: boolean;
  preExtractedAudioBlob?: Blob | null;
  onStepUpdate: (stepId: string, status: 'pending' | 'in_progress' | 'completed' | 'failed', extra?: { durationMs?: number; error?: string }) => void;
  onLog: (message: string) => void;
}

export interface DirectTranscribeResult {
  words: CaptionWord[];
  roughWords: any[];
  detectedLanguage: string;
  modelUsed: string;
  rawGeminiResult: any;
}

// Convert Blob to Base64 without call stack overflow
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.substring(result.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Fetch active key pool from Cloudflare or env
async function getKeyPool(): Promise<{ geminiKeys: string[]; dgKeys: string[] }> {
  const geminiKeys: string[] = [];
  const dgKeys: string[] = [];

  // 1. Client LocalStorage & Vite Env
  const localGemini = (import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || localStorage.getItem('saved_gemini_api_key') || '').trim();
  const localDg = (import.meta.env?.VITE_DEEPGRAM_API_KEY || import.meta.env?.DEEPGRAM_API_KEY || localStorage.getItem('deepgram_api_key') || localStorage.getItem('saved_deepgram_api_key') || '').trim();

  if (localGemini) geminiKeys.push(...localGemini.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean));
  if (localDg) dgKeys.push(...localDg.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean));

  // 2. Fetch serverless key pool
  try {
    const res = await fetch('/api/client-keys');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.geminiKeys)) geminiKeys.push(...data.geminiKeys);
      if (Array.isArray(data.dgKeys)) dgKeys.push(...data.dgKeys);
    }
  } catch {
    // Fallback to check-env if client-keys not yet cached
    try {
      const res = await fetch('/api/check-env');
      if (res.ok) {
        const data = await res.json();
        if (data.envDetails?.GEMINI_API_KEYS?.prefix) {
          // If env has keys, fetch remote config fallback
        }
      }
    } catch {}
  }

  // 3. Fallback remote config if empty
  if (!geminiKeys.length) {
    try {
      const remoteRes = await fetch("https://raw.githubusercontent.com/shrihari52141-afk/tanglish-caption-studio/main/remote-config.json");
      if (remoteRes.ok) {
        const remoteJson = await remoteRes.json();
        const str = remoteJson?.GEMINI_API_KEY || remoteJson?.GEMINI_API_KEYS || '';
        if (str) geminiKeys.push(...str.split(/[\s,;]+/).map((k: string) => k.trim()).filter(Boolean));
      }
    } catch {}
  }

  // Deduplicate
  const uniqueGemini = Array.from(new Set(geminiKeys));
  const uniqueDg = Array.from(new Set(dgKeys));

  return { geminiKeys: uniqueGemini, dgKeys: uniqueDg };
}

/**
 * Executes a 100% direct client-to-Deepgram and client-to-Gemini transcription pipeline.
 * Zero Cloudflare middleman execution limits, zero 500 upload timeouts.
 */
export async function directTranscribe(options: DirectTranscribeOptions): Promise<DirectTranscribeResult> {
  const {
    file,
    language = 'auto',
    scriptMode = 'tanglish',
    useEmojis = true,
    usePunctuation = true,
    emojiStyle = 'vibes',
    enableHotwords = true,
    preExtractedAudioBlob,
    onStepUpdate,
    onLog
  } = options;

  const totalStart = Date.now();

  // ── Step 1: Audio Extraction ──
  onStepUpdate('step-audio', 'in_progress');
  onLog("🔊 Step 1: Extracting and downsampling 16kHz mono WAV locally...");
  const step1Start = Date.now();
  
  let audioBlob: Blob;
  if (preExtractedAudioBlob) {
    audioBlob = preExtractedAudioBlob;
    onLog(`✓ Using pre-extracted audio track (${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB).`);
  } else {
    try {
      audioBlob = await extractAudioTrack(file, (msg) => onLog(msg));
      onLog(`✓ Audio extraction complete (${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB).`);
    } catch (err: any) {
      onLog(`⚠ Audio extraction fallback: using original file container.`);
      audioBlob = file;
    }
  }
  onStepUpdate('step-audio', 'completed', { durationMs: Date.now() - step1Start });

  // ── Retrieve API Keys ──
  onLog("🔑 Initializing API keys for direct server communication...");
  const { geminiKeys, dgKeys } = await getKeyPool();

  if (!geminiKeys.length && !dgKeys.length) {
    throw new Error("No Gemini or Deepgram API keys found. Please configure API keys.");
  }

  // ── Step 2: Direct Deepgram Nova-3 Acoustic Pass ──
  onStepUpdate('step-deepgram', 'in_progress');
  onLog("🔊 Step 2: Direct call to Deepgram Nova-3 (Acoustic timestamps & language detection)...");
  const step2Start = Date.now();

  let roughWords: any[] = [];
  let detectedLanguage = language;
  let dgSuccess = false;

  if (dgKeys.length > 0) {
    const validLanguages = ['ta', 'kn', 'hi', 'te', 'ml', 'mr', 'bn', 'gu', 'en', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ar', 'ja', 'ko', 'zh'];
    let dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true`;
    if (language && language !== 'auto' && validLanguages.includes(language)) {
      dgUrl += `&language=${encodeURIComponent(language)}`;
    } else {
      dgUrl += `&detect_language=true`;
    }

    for (const key of dgKeys) {
      try {
        const authHeader = key.toLowerCase().startsWith('token ') ? key : `Token ${key}`;
        const dgRes = await fetch(dgUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': audioBlob.type || 'audio/wav',
          },
          body: audioBlob,
          signal: AbortSignal.timeout(12000)
        });

        if (dgRes.ok) {
          const dgJson = await dgRes.json();
          detectedLanguage = dgJson?.results?.channels?.[0]?.detected_language || language;
          const words = dgJson?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
          roughWords = words.map((w: any) => ({
            word: w.punctuated_word || w.word,
            start: Math.round(w.start * 1000),
            end: Math.round(w.end * 1000)
          }));
          dgSuccess = true;
          onLog(`✓ Deepgram Nova-3 detected ${roughWords.length} baseline words (Language: ${detectedLanguage}).`);
          break;
        }
      } catch (err: any) {
        onLog(`⚠ Deepgram attempt notice: ${err.message}`);
      }
    }
  }

  onStepUpdate('step-deepgram', 'completed', { durationMs: Date.now() - step2Start });

  // ── Step 3: Direct Google Gemini 3.6 Flash Multilingual Slang Pass ──
  onStepUpdate('step-gemini', 'in_progress');
  onLog("🤖 Step 3: Direct call to Gemini 3.6 Flash (Tanglish slang, hotwords & contextual emojis)...");
  const step3Start = Date.now();

  const base64Audio = await blobToBase64(audioBlob);

  const scriptPromptMap = {
    native: language && language !== 'auto'
      ? `transcribe the spoken words with full punctuation in the NATIVE SCRIPT of language '${language}' (e.g. தமிழ், ಕನ್ನಡ, हिंदी).`
      : `detect the spoken language automatically (Tamil, Kannada, Hindi, Telugu, Malayalam, English, etc.) and transcribe the spoken words with full punctuation in its native script.`,
    tanglish: `detect the spoken language automatically (Tamil, Kannada, Hindi, Telugu, Malayalam, etc.) and transcribe the spoken words with full punctuation in ROMANIZED / TANGLISH / HINGLISH / TELUGISH / MANGLISH / KANNADISH phonetic script using English letters (e.g. "Maanu", "Thappa", "Nee sari kadaiyathu", "madbeka?", "bhai kaisa hai").`,
    english: `translate the audio accurately into standard, polished, natural ENGLISH words with full punctuation.`
  };
  const targetScriptInstruction = scriptPromptMap[scriptMode] || scriptPromptMap.tanglish;

  const systemPrompt = `You are an ultra-precise audio transcription, translation, multilingual slang recognition, and auto-speedup subtitle alignment engine.

Your primary objective is ZERO-LAG LIP SYNC, EXACT SEMANTIC BREAKING, and PRECISE MULTILINGUAL PRONUNCIATION. The total duration of any translated or transcribed caption MUST strictly equal the acoustic speech duration of the source audio segment.

INPUT DATA:
1. Audio file.
2. Pass 1 baseline word timestamps: ${JSON.stringify(roughWords)}

=== 1. SPEECH DURATION & TIMING LOCK ===
- Detect exact acoustic start (\`start_ms\`) and acoustic end (\`end_ms\`) of each spoken source phrase in milliseconds.
- NEVER stretch timestamps to fill silent audio gaps, pauses, or breath breaks.
- When speech stops, end timestamps immediately.

=== 2. MULTILINGUAL SLANG & ACCURATE PUNCTUATION ===
- Intelligently recognize local slang, code-switching, Tanglish/Kanglish/Hinglish interjections, and colloquial expressions.
- Correct misspelled or mistranscribed words from Pass 1 baseline while preserving exact vocal timing.
- Add accurate punctuation (\`.\`, \`?\`, \`!\`, \`,\`) to words based on speaker tone, cadence, and pause markers.

=== 3. CAPTION TRANSLATION & AUTO-SPEEDUP ===
- Script Target: ${targetScriptInstruction}
- Translate or transliterate speech accurately into the target script while strictly locking phrases inside the acoustic speech window.
- AUTO-SPEEDUP: If target text contains more words/syllables, compress word durations proportionally so that the last word finishes EXACTLY when speech ends.
- Do NOT expand time bounds beyond when the speaker finishes talking.

=== 4. SEMANTIC BREAKING & HOT-WORD OVERRIDES ===
Analyze tone and vocal expressions continuously. Tag special words:
- \`is_expression\`: Set TRUE for sudden vocal interjections, emotional reactions, or tone shifts (e.g., "Ayyo!", "Ahaa!", "Shut up", "Oh god", "Aiyo", "Wow!").
- \`is_question\`: Set TRUE for standalone interrogatives or questions (e.g., "madbeka?", "Hassan?", "book?", "can I book?").
- \`is_name\`: Set TRUE for proper nouns, brand names, or people names (e.g., "Zara", "Shrihari", "Ani Cabs", "Bengaluru").
- \`is_sentence_end\`: Set TRUE when a word ends with a full stop (\`.\`), exclamation mark (\`!\`), or question mark (\`?\`).
- \`highlight\`: Set TRUE if the word is a name, exclamation, or key emotional hot-word.

=== 5. SMART EMOJI MATCHING ===
- Include 1 perfectly matching, contextually relevant emoji per segment matching the exact tone or main noun (e.g., "😟", "😱", "🚕", "🔥").

Return ONLY valid JSON adhering strictly to the provided JSON Schema.`;

  const geminiReqBody = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: audioBlob.type || 'audio/wav',
            data: base64Audio
          }
        },
        {
          text: "Transcribe the audio accurately with zero-lag lip-sync word timestamps in milliseconds adhering strictly to the JSON schema."
        }
      ]
    }],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          source_language: { type: "STRING" },
          target_language: { type: "STRING" },
          total_speech_duration_ms: { type: "INTEGER" },
          segments: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                segment_id: { type: "INTEGER" },
                source_text: { type: "STRING" },
                translated_text: { type: "STRING" },
                emoji: { type: "STRING" },
                speech_window_ms: {
                  type: "OBJECT",
                  properties: {
                    start_ms: { type: "INTEGER" },
                    end_ms: { type: "INTEGER" }
                  },
                  required: ["start_ms", "end_ms"]
                },
                words: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      word: { type: "STRING" },
                      start_ms: { type: "INTEGER" },
                      end_ms: { type: "INTEGER" },
                      highlight: { type: "BOOLEAN" },
                      is_expression: { type: "BOOLEAN" },
                      is_question: { type: "BOOLEAN" },
                      is_name: { type: "BOOLEAN" },
                      is_sentence_end: { type: "BOOLEAN" },
                      emoji: { type: "STRING" }
                    },
                    required: ["word", "start_ms", "end_ms"]
                  }
                }
              },
              required: ["segment_id", "source_text", "translated_text", "speech_window_ms", "words"]
            }
          }
        },
        required: ["source_language", "target_language", "segments"]
      }
    }
  };

  const modelsToTry = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
  const shuffledKeys = [...geminiKeys].sort(() => Math.random() - 0.5);

  let rawGeminiResult: any = null;
  let usedModel = modelsToTry[0];
  let lastGeminiErr: any = null;

  outerLoop:
  for (const m of modelsToTry) {
    const keysToTry = shuffledKeys.slice(0, 4);
    for (const currentKey of keysToTry) {
      try {
        const fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(currentKey)}`;
        const geminiRes = await fetch(fetchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': currentKey
          },
          body: JSON.stringify(geminiReqBody),
          signal: AbortSignal.timeout(28000)
        });

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          throw new Error(`Gemini API Error (${m}, ${geminiRes.status}): ${errText}`);
        }

        const geminiData = await geminiRes.json();
        const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) throw new Error('No valid response generated by Gemini.');

        rawGeminiResult = JSON.parse(candidateText);
        if (rawGeminiResult?.segments && Array.isArray(rawGeminiResult.segments)) {
          usedModel = m;
          onLog(`✓ Gemini ${m} successfully refined captions & timestamps!`);
          break outerLoop;
        }
      } catch (err: any) {
        lastGeminiErr = err;
        onLog(`⚠ Gemini ${m} retry notice: ${err.message}`);
      }
    }
  }

  // Process & Flatten Gemini Output
  let extractedWords: any[] = [];
  if (rawGeminiResult?.segments && Array.isArray(rawGeminiResult.segments)) {
    rawGeminiResult.segments.forEach((seg: any) => {
      const segEmoji = seg.emoji || '';
      if (seg.words && Array.isArray(seg.words)) {
        seg.words.forEach((w: any, wIdx: number) => {
          extractedWords.push({
            word: w.word,
            start: w.start_ms,
            end: w.end_ms,
            start_ms: w.start_ms,
            end_ms: w.end_ms,
            highlight: !!w.highlight,
            is_expression: !!w.is_expression,
            is_question: !!w.is_question,
            is_name: !!w.is_name,
            is_sentence_end: !!w.is_sentence_end,
            emoji: w.emoji || (wIdx === seg.words.length - 1 ? segEmoji : '')
          });
        });
      }
    });
  }

  if (extractedWords.length === 0) {
    if (roughWords.length > 0) {
      extractedWords = roughWords.map((w, i) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        start_ms: w.start,
        end_ms: w.end,
        highlight: false,
        is_expression: false,
        is_question: false,
        is_name: false,
        is_sentence_end: i === roughWords.length - 1,
        emoji: ''
      }));
    } else {
      throw new Error(lastGeminiErr?.message || "Direct transcription failed to generate words.");
    }
  }

  onStepUpdate('step-gemini', 'completed', { durationMs: Date.now() - step3Start });

  // ── Step 4: Continuous Piecewise Alignment Guardrail ──
  onStepUpdate('step-align', 'in_progress');
  onLog("🎯 Step 4: Applying continuous piecewise acoustic alignment & zero drift lock...");
  const step4Start = Date.now();

  const alignedWords = continuousPiecewiseAlignment(extractedWords, roughWords);

  const wordsWithIds: CaptionWord[] = sanitizeCaptionWords(
    alignedWords.map((w: any, idx: number, arr: any[]) => {
      const sMs = Math.round(w.start);
      const eMs = Math.round(w.end);
      const nextSMs = idx < arr.length - 1 ? Math.round(arr[idx + 1].start) : eMs;
      const pauseAfterMs = Math.max(0, nextSMs - eMs);

      return {
        ...w,
        word: stripASSTags(String(w.word ?? '')),
        start_time: sMs / 1000,
        end_time: eMs / 1000,
        start_ms: sMs,
        end_ms: eMs,
        pause_after_ms: pauseAfterMs,
        id: `word-${idx}`,
        emoji: w.emoji || null,
        is_hotword: !!w.highlight || !!w.is_expression || !!w.is_name,
      };
    })
  );

  onStepUpdate('step-align', 'completed', { durationMs: Date.now() - step4Start });
  onLog(`✨ Complete! ${wordsWithIds.length} words synchronized in ${((Date.now() - totalStart) / 1000).toFixed(1)}s.`);

  return {
    words: wordsWithIds,
    roughWords,
    detectedLanguage,
    modelUsed: usedModel,
    rawGeminiResult
  };
}
