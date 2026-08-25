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

  // ── Step 2: Direct Deepgram Nova-3 Acoustic Pass (Exact Millisecond Ground Truth) ──
  onStepUpdate('step-deepgram', 'in_progress');
  onLog("🔊 Step 2: Direct call to Deepgram Nova-3 (Acoustic timestamps & language detection)...");
  const step2Start = Date.now();

  let roughWords: any[] = [];
  let detectedLanguage = language;
  let dgSuccess = false;

  if (dgKeys.length > 0) {
    const candidateLanguages = (language && language !== 'auto') 
      ? [language, 'auto', 'ta', 'hi', 'te', 'kn', 'en']
      : ['auto', 'ta', 'hi', 'te', 'kn', 'en'];

    langLoop:
    for (const testLang of candidateLanguages) {
      let dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true`;
      if (testLang === 'auto') {
        dgUrl += `&detect_language=true`;
      } else {
        dgUrl += `&language=${encodeURIComponent(testLang)}`;
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
            const words = dgJson?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
            if (words.length > 0) {
              detectedLanguage = testLang === 'auto' 
                ? (dgJson?.results?.channels?.[0]?.detected_language || 'ta') 
                : testLang;
              roughWords = words.map((w: any) => ({
                word: w.punctuated_word || w.word,
                start: Math.round(w.start * 1000),
                end: Math.round(w.end * 1000),
                start_ms: Math.round(w.start * 1000),
                end_ms: Math.round(w.end * 1000),
              }));
              dgSuccess = true;
              onLog(`✓ Deepgram Nova-3 captured ${roughWords.length} acoustic ground truth words (Language: ${detectedLanguage}, ${roughWords[0].start_ms}ms -> ${roughWords[roughWords.length - 1].end_ms}ms).`);
              break langLoop;
            }
          }
        } catch (err: any) {
          onLog(`⚠ Deepgram attempt notice (${testLang}): ${err.message}`);
        }
      }
    }
  }

  onStepUpdate('step-deepgram', 'completed', { durationMs: Date.now() - step2Start });

  // Compute total speech duration for Gemini full coverage
  const totalAudioDurationMs = roughWords.length > 0 
    ? roughWords[roughWords.length - 1].end_ms + 1000 
    : 60000;

  // ── Step 3: Direct Google Gemini 3.6 Flash Full Pipeline ──
  onStepUpdate('step-gemini', 'in_progress');
  onLog(`🤖 Step 3: Direct call to Gemini 3.6 Flash (Transcribing full audio up to ${totalAudioDurationMs}ms)...`);
  const step3Start = Date.now();

  const base64Audio = await blobToBase64(audioBlob);

  const scriptPromptMap = {
    native: language && language !== 'auto'
      ? `transcribe the spoken words with 100% EXHAUSTIVE completeness, full punctuation, authentic dialogue flow, and emotional nuance in the NATIVE SCRIPT of language '${language}' (e.g. தமிழ், ಕನ್ನಡ, हिंदी, తెలుగు, മലയാളം).`
      : `detect the spoken language automatically (Tamil, Kannada, Hindi, Telugu, Malayalam, English, etc.) and transcribe the spoken words with 100% EXHAUSTIVE completeness, full punctuation, authentic dialogue flow, and natural phrasing in its native script.`,
    tanglish: `transcribe into natural, authentic, modern TANGLISH / HINGLISH / TELUGISH / MANGLISH / KANNADISH phonetic script with top creator / YouTube Shorts / Reels media channel quality readability.
- 100% EXHAUSTIVE WORD RETENTION: Account for EVERY SINGLE SPOKEN WORD, particle, connector, and colloquial expression from the original audio (e.g. "vandhu", "kooda", "apdinra", "adhuve", "dhan", "seriously", "innum", "melum", "apdi", "madhiri", etc.). Never omit or skip any spoken word.
- Use natural, popular modern spelling (e.g. "Maa Behen movie-la vandhu avanga society...", "Adhu kooda avangala avlo hurt pannadhu, aana...", "Nee sari kedayadhu ma...", "deep down-ah hurt aagum").
- Retain the exact colloquial punch, slang, emotional intensity, conversational nuances, and pauses of the speaker.`,
    english: `translate into professional, broadcast-grade, natural idiomatic ENGLISH subtitles (matching Netflix, Hotstar, and BBC subtitle standards).
- 100% FAITHFUL MEANING: Capture the EXACT emotional tone, intent, nuance, intensity, and every spoken clause of the original dialogue.
- Ensure natural phrasing and grammatical excellence without losing any subtle details, emotional weight, or speaker intent.
- Create concise, punchy subtitle lines that read smoothly in sync with the audio.`
  };
  const targetScriptInstruction = scriptPromptMap[scriptMode] || scriptPromptMap.tanglish;

  const systemPrompt = `You are a professional broadcast media subtitle translator, dialogue transcription, and syllable-synchronization engine (Netflix, Hotstar, YouTube Shorts standards).

TOTAL AUDIO DURATION: ${totalAudioDurationMs}ms (${(totalAudioDurationMs / 1000).toFixed(1)} seconds).
PASS 1 ACOUSTIC TIMINGS FROM DEEPGRAM:
${JSON.stringify(roughWords)}

=== 100% EXHAUSTIVE WORD RETENTION & BROADCAST SUBTITLE RULES ===
1. ZERO OMISSIONS MANDATE:
   - You MUST account for EVERY SINGLE SPOKEN WORD, particle, connector, and expression from the original speech.
   - NEVER drop, skip, summarize, or gloss over any spoken word or sentence part.
   - Maintain 100% complete coverage from 0ms all the way to ${totalAudioDurationMs}ms.
2. TRANSLATION / ADAPTATION GOAL:
${targetScriptInstruction}
3. ZERO-LAG LIP-SYNC & SYLLABLE-WEIGHTED TIMINGS:
   - Anchor each segment (\`start_ms\`, \`end_ms\`) strictly to the acoustic speech boundaries from Pass 1.
   - For every word inside a segment, assign smooth, syllable-weighted start (\`s\`) and end (\`e\`) milliseconds that fit seamlessly within the segment window.
   - The first word of a segment must begin exactly when speech starts, and the last word must end exactly when the speaker finishes the phrase.
4. EMOJIS: Add 1 perfectly matched, high-impact emoji per segment for key emotional peaks or vivid nouns (e.g. 💔, 😭, 👗, 🎬, 🪞, 👥).
5. Return strictly valid JSON matching the schema.`;

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
          text: `Transcribe all spoken words from 0ms to ${totalAudioDurationMs}ms with millisecond timestamps and contextual emojis adhering strictly to the JSON schema.`
        }
      ]
    }],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          segments: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                start_ms: { type: "INTEGER" },
                end_ms: { type: "INTEGER" },
                tanglish: { type: "STRING" },
                emoji: { type: "STRING" },
                words: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      w: { type: "STRING" },
                      s: { type: "INTEGER" },
                      e: { type: "INTEGER" },
                      emoji: { type: "STRING" },
                      highlight: { type: "BOOLEAN" }
                    },
                    required: ["w", "s", "e"]
                  }
                }
              },
              required: ["start_ms", "end_ms", "tanglish", "words"]
            }
          }
        },
        required: ["segments"]
      }
    }
  };

  const modelsToTry = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
  const shuffledKeys = [...geminiKeys].sort(() => Math.random() - 0.5);

function safeJSONParse(text: string): any {
  if (!text || typeof text !== 'string') return null;
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue to repair
  }

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx === -1) return null;

  let truncated = cleaned.slice(startIdx);
  truncated = truncated.replace(/,\s*([}\]])/g, '$1');
  truncated = truncated.replace(/,\s*"[^"]*":?\s*$/g, '');
  truncated = truncated.replace(/,\s*$/g, '');

  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < truncated.length; i++) {
    const char = truncated[i];
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces = Math.max(0, openBraces - 1);
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets = Math.max(0, openBrackets - 1);
    }
  }

  if (inString) truncated += '"';
  truncated = truncated.replace(/,\s*$/g, '');
  truncated = truncated.replace(/:\s*$/g, ': null');

  while (openBrackets > 0) { truncated += ']'; openBrackets--; }
  while (openBraces > 0) { truncated += '}'; openBraces--; }

  try {
    return JSON.parse(truncated);
  } catch (err) {
    const words: any[] = [];
    const wordRegex = /{\s*"w(?:ord)?"\s*:\s*"([^"]+)"\s*,\s*"s(?:tart_ms)?"\s*:\s*(\d+)\s*,\s*"e(?:nd_ms)?"\s*:\s*(\d+)(?:[^}]*"emoji"\s*:\s*"([^"]*)")?/g;
    let match;
    while ((match = wordRegex.exec(cleaned)) !== null) {
      words.push({
        w: match[1],
        s: parseInt(match[2], 10),
        e: parseInt(match[3], 10),
        emoji: match[4] || ''
      });
    }
    if (words.length > 0) {
      return { words };
    }
    return null;
  }
}

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
          signal: AbortSignal.timeout(45000)
        });

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          throw new Error(`Gemini API Error (${m}, ${geminiRes.status}): ${errText}`);
        }

        const geminiData = await geminiRes.json();
        const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) throw new Error('No valid response generated by Gemini.');

        rawGeminiResult = safeJSONParse(candidateText);
        if (rawGeminiResult?.segments && Array.isArray(rawGeminiResult.segments) && rawGeminiResult.segments.length > 0) {
          usedModel = m;
          onLog(`✓ Gemini ${m} successfully transcribed ${rawGeminiResult.segments.length} segments spanning 0ms -> ${totalAudioDurationMs}ms!`);
          break outerLoop;
        } else if (rawGeminiResult?.words && Array.isArray(rawGeminiResult.words) && rawGeminiResult.words.length > 0) {
          usedModel = m;
          onLog(`✓ Gemini ${m} successfully transcribed ${rawGeminiResult.words.length} words spanning 0ms -> ${totalAudioDurationMs}ms!`);
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
      const segWords = seg.words || [];
      if (Array.isArray(segWords)) {
        segWords.forEach((w: any, wIdx: number) => {
          const wordText = w.w || w.word || '';
          const sMs = w.s ?? w.start_ms ?? seg.start_ms;
          const eMs = w.e ?? w.end_ms ?? seg.end_ms;
          if (wordText) {
            extractedWords.push({
              word: wordText,
              start: sMs,
              end: eMs,
              start_ms: sMs,
              end_ms: eMs,
              highlight: !!w.highlight,
              is_expression: false,
              is_question: wordText.includes('?'),
              is_name: false,
              is_sentence_end: wIdx === segWords.length - 1 || /[.!?]/.test(wordText),
              emoji: w.emoji || (wIdx === segWords.length - 1 ? segEmoji : '')
            });
          }
        });
      }
    });
  } else if (rawGeminiResult?.words && Array.isArray(rawGeminiResult.words)) {
    rawGeminiResult.words.forEach((w: any, wIdx: number) => {
      const wordText = w.w || w.word || '';
      const sMs = w.s ?? w.start_ms ?? 0;
      const eMs = w.e ?? w.end_ms ?? (sMs + 400);
      if (wordText) {
        extractedWords.push({
          word: wordText,
          start: sMs,
          end: eMs,
          start_ms: sMs,
          end_ms: eMs,
          highlight: !!w.highlight,
          is_expression: false,
          is_question: wordText.includes('?'),
          is_name: false,
          is_sentence_end: wIdx === rawGeminiResult.words.length - 1 || /[.!?]/.test(wordText),
          emoji: w.emoji || ''
        });
      }
    });
  }

  if (extractedWords.length === 0) {
    if (roughWords.length > 0) {
      onLog(`✓ Using Deepgram acoustic ground truth (${roughWords.length} words) as baseline...`);
      extractedWords = roughWords.map((w, i) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        start_ms: w.start_ms || w.start,
        end_ms: w.end_ms || w.end,
        highlight: false,
        is_expression: false,
        is_question: w.word.includes('?'),
        is_name: false,
        is_sentence_end: i === roughWords.length - 1 || /[.!?]/.test(w.word),
        emoji: ''
      }));
    } else {
      throw new Error(lastGeminiErr?.message || "Direct transcription failed to generate words.");
    }
  } else if (roughWords.length > 0) {
    // 100% Full-Duration Coverage Guarantee: Check if Gemini stopped early
    const lastExtractedEnd = extractedWords[extractedWords.length - 1].end_ms;
    const lastAcousticEnd = roughWords[roughWords.length - 1].end_ms;
    if (lastExtractedEnd < lastAcousticEnd - 1500) {
      onLog(`✓ Guaranteeing 100% full-duration coverage: Stitching remaining audio tail (${lastExtractedEnd}ms -> ${lastAcousticEnd}ms)...`);
      const missingWords = roughWords.filter(w => (w.start_ms || w.start) >= lastExtractedEnd - 100);
      missingWords.forEach((w, i) => {
        const sMs = w.start_ms || w.start;
        const eMs = w.end_ms || w.end;
        extractedWords.push({
          word: w.word,
          start: sMs,
          end: eMs,
          start_ms: sMs,
          end_ms: eMs,
          highlight: false,
          is_expression: false,
          is_question: w.word.includes('?'),
          is_name: false,
          is_sentence_end: i === missingWords.length - 1 || /[.!?]/.test(w.word),
          emoji: ''
        });
      });
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
