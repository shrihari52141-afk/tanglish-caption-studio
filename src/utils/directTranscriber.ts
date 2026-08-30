import { CaptionWord, DubbingSettings, PipelineIntermediateCache, ProcessingStep } from '../types';
import { continuousPiecewiseAlignment, sanitizeCaptionWords, stripASSTags } from './captionFormatter';
import { extractAudioTrackDetails } from './audioExtractor';
import { ensureRomanScript } from './indicTransliterate';
import { 
  getActiveSessionCache, 
  setActiveSessionCache, 
  probeMediaProperties, 
  generateExpressiveDubbedAudio, 
  fitAudioToDuration,
  createBlackVideoCanvasForAudio
} from './dubbingEngine';

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
  dubbingSettings?: DubbingSettings;
  onStepUpdate: (stepId: string, status: 'pending' | 'in_progress' | 'completed' | 'failed', extra?: { durationMs?: number; error?: string }) => void;
  onLog: (message: string) => void;
}

export interface DirectTranscribeResult {
  words: CaptionWord[];
  roughWords: any[];
  detectedLanguage: string;
  modelUsed: string;
  rawGeminiResult: any;
  dubbedAudioBlob?: Blob;
  dubbedAudioUrl?: string;
  isAudioOnly?: boolean;
  videoUrl?: string;
  mediaDurationSeconds?: number;
  sessionCache?: PipelineIntermediateCache;
}

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

  const localGemini = (import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || localStorage.getItem('saved_gemini_api_key') || '').trim();
  const localDg = (import.meta.env?.VITE_DEEPGRAM_API_KEY || import.meta.env?.DEEPGRAM_API_KEY || localStorage.getItem('deepgram_api_key') || localStorage.getItem('saved_deepgram_api_key') || '').trim();

  if (localGemini) geminiKeys.push(...localGemini.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean));
  if (localDg) dgKeys.push(...localDg.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean));

  try {
    const res = await fetch('/api/client-keys');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.geminiKeys)) geminiKeys.push(...data.geminiKeys);
      if (Array.isArray(data.dgKeys)) dgKeys.push(...data.dgKeys);
    }
  } catch {}

  if (!geminiKeys.length) {
    try {
      const remoteRes = await fetch('https://raw.githubusercontent.com/shrihari52141-afk/tanglish-caption-studio/main/remote-config.json');
      if (remoteRes.ok) {
        const remoteJson = await remoteRes.json();
        const str = remoteJson?.GEMINI_API_KEY || remoteJson?.GEMINI_API_KEYS || '';
        if (str) geminiKeys.push(...str.split(/[\s,;]+/).map((k: string) => k.trim()).filter(Boolean));
      }
    } catch {}
  }

  return { 
    geminiKeys: Array.from(new Set(geminiKeys)), 
    dgKeys: Array.from(new Set(dgKeys)) 
  };
}

function safeJSONParse(text: string): any {
  if (!text || typeof text !== 'string') return null;
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {}

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
    return null;
  }
}

export async function directTranscribe(options: DirectTranscribeOptions): Promise<DirectTranscribeResult> {
  const {
    file,
    language = 'auto',
    scriptMode = 'tanglish',
    translationMode = 'transliterate',
    useEmojis = true,
    usePunctuation = true,
    emojiStyle = 'vibes',
    enableHotwords = true,
    preExtractedAudioBlob,
    dubbingSettings,
    onStepUpdate,
    onLog
  } = options;

  const isDubbingActive = !!dubbingSettings?.enabled;
  const isRomanTarget = scriptMode === 'tanglish' || scriptMode === 'english' || translationMode === 'auto_roman' || translationMode === 'transliterate' || translationMode === 'translate_english';

  let sessionCache = getActiveSessionCache();
  if (!sessionCache || sessionCache.mediaFile !== file) {
    sessionCache = {
      sessionId: 'session-' + Date.now(),
      mediaFile: file
    };
    setActiveSessionCache(sessionCache);
  }

  // ?? Stage 1: Validation, Media Probing & Background Audio Extraction ??
  onStepUpdate('step-probe', 'in_progress');
  onLog('?? Stage 1: Validating media properties & probing audio track in background...');
  const stage1Start = Date.now();

  const mediaInfo = await probeMediaProperties(file);
  sessionCache.mediaInfo = mediaInfo;
  onLog(`? Probed Media: ${mediaInfo.fileName} (${(mediaInfo.fileSizeBytes / (1024 * 1024)).toFixed(2)}MB, Duration: ${mediaInfo.durationSeconds.toFixed(1)}s, Type: ${mediaInfo.isAudioOnly ? 'Audio Only' : 'Video'}).`);

  let audioBlob: Blob;
  if (sessionCache.extractedAudioBlob) {
    audioBlob = sessionCache.extractedAudioBlob;
    onLog(`? Reusing cached extracted audio buffer (${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB).`);
  } else if (preExtractedAudioBlob) {
    audioBlob = preExtractedAudioBlob;
    sessionCache.extractedAudioBlob = audioBlob;
    onLog(`? Using pre-extracted audio cache (${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB).`);
  } else if (mediaInfo.isAudioOnly) {
    audioBlob = file;
    sessionCache.extractedAudioBlob = audioBlob;
  } else {
    try {
      const details = await extractAudioTrackDetails(file, (msg) => onLog(msg));
      audioBlob = details.blob;
      sessionCache.extractedAudioBlob = audioBlob;
      onLog(`? Background audio extraction complete (${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB).`);
    } catch (e: any) {
      onLog('? Using original media file container as audio source.');
      audioBlob = file;
      sessionCache.extractedAudioBlob = audioBlob;
    }
  }

  onStepUpdate('step-probe', 'completed', { durationMs: Date.now() - stage1Start });

  const { geminiKeys, dgKeys } = await getKeyPool();
  if (!geminiKeys.length && !dgKeys.length) {
    onStepUpdate('step-gemini-transcribe', 'failed', { error: 'No API keys configured' });
    throw new Error('No Gemini or Deepgram API keys found. Please configure API keys.');
  }

  const base64Audio = await blobToBase64(audioBlob);

  // ?? Stage 2: Gemini 3.5 Transcribe (Recognized Words & Source Language Detection) ??
  onStepUpdate('step-gemini-transcribe', 'in_progress');
  onLog('??? Stage 2: Calling Gemini 3.5 Transcribe (Ground truth for words & language detection)...');
  const stage2Start = Date.now();

  let gemini35Words: CaptionWord[] = [];
  let detectedSourceLanguage = language === 'auto' ? 'tamil' : language;
  let fullTranscribedText = '';

  if (sessionCache.gemini35Transcript) {
    gemini35Words = sessionCache.gemini35Transcript.words;
    detectedSourceLanguage = sessionCache.gemini35Transcript.detectedLanguage;
    fullTranscribedText = sessionCache.gemini35Transcript.rawText;
    onLog(`? Reusing cached Gemini 3.5 transcription (${gemini35Words.length} words, detected language: ${detectedSourceLanguage}).`);
  } else {
    const models35 = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'];
    let gemini35Success = false;

    for (const modelName of models35) {
      for (const currentKey of geminiKeys.slice(0, 3)) {
        try {
          const fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(currentKey)}`;
          const prompt35 = `You are the primary ground-truth dialogue transcription engine (Gemini 3.5 Transcribe).
Task:
1. Accurately transcribe EVERY spoken word from the audio with 100% completeness.
2. Identify the exact spoken source language name (e.g. "tamil", "hindi", "telugu", "kannada", "malayalam", "english", "spanish", etc.).
3. Return valid JSON containing "detected_language", "full_transcript", and "words" array with rough start/end ms.`;

          const res = await fetch(fetchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inlineData: { mimeType: audioBlob.type || 'audio/wav', data: base64Audio } },
                  { text: prompt35 }
                ]
              }],
              generationConfig: {
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: 'OBJECT',
                  properties: {
                    detected_language: { type: 'STRING' },
                    full_transcript: { type: 'STRING' },
                    words: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          word: { type: 'STRING' },
                          start_ms: { type: 'INTEGER' },
                          end_ms: { type: 'INTEGER' }
                        },
                        required: ['word']
                      }
                    }
                  },
                  required: ['detected_language', 'words']
                }
              }
            }),
            signal: AbortSignal.timeout(45000)
          });

          if (res.ok) {
            const data = await res.json();
            const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsed = safeJSONParse(textContent);
            if (parsed && Array.isArray(parsed.words) && parsed.words.length > 0) {
              detectedSourceLanguage = parsed.detected_language || detectedSourceLanguage;
              fullTranscribedText = parsed.full_transcript || parsed.words.map((w: any) => w.word).join(' ');
              gemini35Words = parsed.words.map((w: any, idx: number) => ({
                id: `g35-${idx}-${Date.now()}`,
                word: w.word,
                start_time: (w.start_ms || idx * 300) / 1000,
                end_time: (w.end_ms || idx * 300 + 250) / 1000,
                start_ms: w.start_ms || idx * 300,
                end_ms: w.end_ms || idx * 300 + 250
              }));

              sessionCache.gemini35Transcript = {
                words: gemini35Words,
                detectedLanguage: detectedSourceLanguage,
                rawText: fullTranscribedText
              };
              gemini35Success = true;
              onLog(`? Gemini 3.5 Transcribe identified language: "${detectedSourceLanguage.toUpperCase()}" with ${gemini35Words.length} ground-truth recognized words.`);
              break;
            }
          }
        } catch (err: any) {
          onLog(`? Gemini 3.5 Transcribe notice (${modelName}): ${err.message}`);
        }
      }
      if (gemini35Success) break;
    }
  }

  onStepUpdate('step-gemini-transcribe', 'completed', { durationMs: Date.now() - stage2Start });

  // ?? Stage 3: Deepgram Nova 3 on Cached Audio with Detected Source Language ??
  onStepUpdate('step-deepgram-original', 'in_progress');
  onLog(`?? Stage 3: Running Deepgram Nova 3 with detected language (${detectedSourceLanguage}) for precise acoustic timing...`);
  const stage3Start = Date.now();

  let nova3OriginalTimings: any[] = [];
  if (sessionCache.deepgramOriginalTimestamps) {
    nova3OriginalTimings = sessionCache.deepgramOriginalTimestamps.words;
    onLog(`? Reusing cached Deepgram Nova 3 acoustic timestamps (${nova3OriginalTimings.length} acoustic pulses).`);
  } else if (dgKeys.length > 0) {
    const langCodeMap: Record<string, string> = {
      tamil: 'ta', hindi: 'hi', telugu: 'te', kannada: 'kn', malayalam: 'ml', english: 'en', spanish: 'es', french: 'fr', german: 'de'
    };
    const dgLangParam = langCodeMap[detectedSourceLanguage.toLowerCase()] || detectedSourceLanguage.toLowerCase() || 'ta';
    const dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true&language=${encodeURIComponent(dgLangParam)}`;

    for (const key of dgKeys) {
      try {
        const authHeader = key.toLowerCase().startsWith('token ') ? key : `Token ${key}`;
        const dgRes = await fetch(dgUrl, {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': audioBlob.type || 'audio/wav' },
          body: audioBlob,
          signal: AbortSignal.timeout(35000)
        });

        if (dgRes.ok) {
          const dgJson = await dgRes.json();
          const words = dgJson?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
          if (words.length > 0) {
            nova3OriginalTimings = words.map((w: any) => ({
              word: w.punctuated_word || w.word || '',
              start: Math.round(w.start * 1000),
              end: Math.round(w.end * 1000),
              start_ms: Math.round(w.start * 1000),
              end_ms: Math.round(w.end * 1000),
            }));
            sessionCache.deepgramOriginalTimestamps = { words: nova3OriginalTimings, detectedLanguage: detectedSourceLanguage };
            onLog(`? Deepgram Nova 3 captured ${nova3OriginalTimings.length} high-precision acoustic word timestamps.`);
            break;
          }
        }
      } catch (err: any) {
        onLog(`? Deepgram Nova 3 notice: ${err.message}`);
      }
    }
  }

  onStepUpdate('step-deepgram-original', 'completed', { durationMs: Date.now() - stage3Start });

  // ?? Stage 4: Master Word & Timing Alignment ??
  onStepUpdate('step-align', 'in_progress');
  onLog('?? Stage 4: Aligning Gemini 3.5 recognized words with Deepgram Nova 3 acoustic timestamps...');
  const stage4Start = Date.now();

  const wordsToAlign = gemini35Words.length > 0 ? gemini35Words : nova3OriginalTimings;
  const alignedMasterWords = continuousPiecewiseAlignment(wordsToAlign, nova3OriginalTimings);
  sessionCache.alignedMasterTranscript = {
    words: alignedMasterWords,
    detectedLanguage: detectedSourceLanguage
  };

  onLog(`? Master transcription aligned: ${alignedMasterWords.length} synchronized words ready.`);
  onStepUpdate('step-align', 'completed', { durationMs: Date.now() - stage4Start });

  // ?? Stage 5: Gemini 3.6 Flash Unified Orchestration ??
  onStepUpdate('step-gemini-orchestrate', 'in_progress');
  onLog('?? Stage 5: Sending aligned master transcript to Gemini 3.6 Flash (Single Orchestration Pass)...');
  const stage5Start = Date.now();

  const targetLangInstruction = (isDubbingActive && dubbingSettings?.targetLanguage)
    ? `TRANSLATE & ADAPT FOR DUBBING INTO ${dubbingSettings.targetLanguage.toUpperCase()}:
- Translate dialogue into natural, fluent, human-like speech in ${dubbingSettings.targetLanguage}.
- Capture emotional delivery, pauses, and colloquial punch.`
    : (isRomanTarget)
    ? `TRANSLITERATE TO ROMAN / TANGLISH / HINGLISH SCRIPT:
- Strictly output Latin / English letters (A-Z, a-z). No Indic native script.
- Retain all slang and particle words.`
    : `PRESERVE NATIVE SCRIPT:
- Keep the original native characters (${detectedSourceLanguage}).`;

  const wordsSummary = JSON.stringify(alignedMasterWords.map(w => ({ w: w.word, s: w.start_ms, e: w.end_ms })));
  const orchestrationPrompt = `You are the Gemini 3.6 Flash Master Orchestrator.
Input Aligned Words: ${wordsSummary}
Instructions:
${targetLangInstruction}
- Emojis: ${useEmojis ? 'Add 1 high-impact emoji per emotional phrase' : 'No emojis'} (Style: ${emojiStyle})
- Punctuation: ${usePunctuation ? 'Natural punctuation' : 'Clean text without punctuation'}
- Hot Words: ${enableHotwords ? 'Identify brand names, intense emotions, and slang words with highlight=true' : 'Standard'}
Return structured JSON with "translated_text" and "segments" (containing words array with w, s, e, emoji, highlight).`;

  let orchestratedWords: CaptionWord[] = [];
  let translatedTextForDubbing = '';

  for (const currentKey of geminiKeys.slice(0, 3)) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(currentKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: orchestrationPrompt }] }],
          generationConfig: {
            maxOutputTokens: 16384,
            responseMimeType: 'application/json'
          }
        }),
        signal: AbortSignal.timeout(45000)
      });

      if (res.ok) {
        const data = await res.json();
        const candText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = safeJSONParse(candText);
        if (parsed) {
          translatedTextForDubbing = parsed.translated_text || '';
          if (Array.isArray(parsed.segments)) {
            parsed.segments.forEach((seg: any) => {
              const segEmoji = seg.emoji || '';
              (seg.words || []).forEach((w: any, wIdx: number) => {
                const wordText = isRomanTarget ? ensureRomanScript(w.w || w.word || '') : (w.w || w.word || '');
                if (wordText) {
                  orchestratedWords.push({
                    id: `orch-${orchestratedWords.length}-${Date.now()}`,
                    word: wordText,
                    start_time: (w.s || w.start_ms || seg.start_ms || 0) / 1000,
                    end_time: (w.e || w.end_ms || seg.end_ms || 300) / 1000,
                    start_ms: w.s || w.start_ms || seg.start_ms || 0,
                    end_ms: w.e || w.end_ms || seg.end_ms || 300,
                    emoji: w.emoji || (wIdx === (seg.words || []).length - 1 ? segEmoji : ''),
                    highlight: !!w.highlight,
                    is_hotword: !!w.highlight
                  });
                }
              });
            });
          }
          if (orchestratedWords.length > 0) {
            onLog(`? Gemini 3.6 Flash produced ${orchestratedWords.length} structured, formatted caption words.`);
            break;
          }
        }
      }
    } catch (e: any) {
      onLog(`? Gemini 3.6 Flash notice: ${e.message}`);
    }
  }

  if (orchestratedWords.length === 0) {
    orchestratedWords = alignedMasterWords;
  }

  sessionCache.gemini36FlashOutput = {
    words: orchestratedWords,
    translatedText: translatedTextForDubbing || orchestratedWords.map(w => w.word).join(' '),
    detectedLanguage: detectedSourceLanguage
  };

  onStepUpdate('step-gemini-orchestrate', 'completed', { durationMs: Date.now() - stage5Start });

  let finalWords = orchestratedWords;
  let dubbedAudioBlob: Blob | undefined;
  let dubbedAudioUrl: string | undefined;

  // ?? Stage 6 & 7: Expressive Dubbing & Deepgram Nova 3 on Dubbed Audio (If Dubbing Selected) ??
  if (isDubbingActive && dubbingSettings) {
    onStepUpdate('step-dubbing-tts', 'in_progress');
    const stage6Start = Date.now();
    const textToSpeak = sessionCache.gemini36FlashOutput.translatedText || fullTranscribedText;

    const rawDubbedAudio = await generateExpressiveDubbedAudio(
      textToSpeak,
      dubbingSettings.targetLanguage,
      dubbingSettings,
      geminiKeys,
      onLog
    );

    const targetDuration = mediaInfo.durationSeconds || (finalWords[finalWords.length - 1]?.end_time || 60);
    dubbedAudioBlob = await fitAudioToDuration(rawDubbedAudio, targetDuration, onLog);
    dubbedAudioUrl = URL.createObjectURL(dubbedAudioBlob);
    sessionCache.dubbedAudioBlob = dubbedAudioBlob;
    sessionCache.dubbedAudioUrl = dubbedAudioUrl;

    onStepUpdate('step-dubbing-tts', 'completed', { durationMs: Date.now() - stage6Start });

    onStepUpdate('step-deepgram-dubbed', 'in_progress');
    onLog(`?? Stage 7: Running Deepgram Nova 3 on Dubbed Audio (Language: ${dubbingSettings.targetLanguage}) for final lip-sync timing...`);
    const stage7Start = Date.now();

    let dubbedAcousticTimings: any[] = [];
    if (dgKeys.length > 0 && dubbedAudioBlob) {
      const dgDubUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&word_timestamps=true&language=${encodeURIComponent(dubbingSettings.targetLanguage)}`;
      for (const key of dgKeys) {
        try {
          const authHeader = key.toLowerCase().startsWith('token ') ? key : `Token ${key}`;
          const dgDubRes = await fetch(dgDubUrl, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': dubbedAudioBlob.type || 'audio/wav' },
            body: dubbedAudioBlob,
            signal: AbortSignal.timeout(30000)
          });
          if (dgDubRes.ok) {
            const dubJson = await dgDubRes.json();
            const dubWords = dubJson?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
            if (dubWords.length > 0) {
              dubbedAcousticTimings = dubWords.map((w: any) => ({
                word: w.punctuated_word || w.word || '',
                start: Math.round(w.start * 1000),
                end: Math.round(w.end * 1000)
              }));
              sessionCache.deepgramDubbedTimestamps = { words: dubbedAcousticTimings };
              onLog(`? Deepgram Nova 3 captured ${dubbedAcousticTimings.length} dubbed audio word timestamps.`);
              break;
            }
          }
        } catch (e: any) {
          onLog(`? Deepgram Dubbed timing notice: ${e.message}`);
        }
      }
    }

    if (dubbedAcousticTimings.length > 0) {
      finalWords = continuousPiecewiseAlignment(finalWords, dubbedAcousticTimings);
    }
    onStepUpdate('step-deepgram-dubbed', 'completed', { durationMs: Date.now() - stage7Start });
  }

  // ?? Stage 8: Assembly & Editor Routing ??
  onStepUpdate('step-editor', 'in_progress');
  onLog('?? Stage 8: Assembling final synchronized project for video editor...');
  const stage8Start = Date.now();

  let videoUrl: string;
  if (mediaInfo.isAudioOnly) {
    const blackCanvas = await createBlackVideoCanvasForAudio(dubbedAudioBlob || audioBlob, mediaInfo.durationSeconds, onLog);
    videoUrl = blackCanvas.videoUrl;
  } else {
    videoUrl = URL.createObjectURL(file);
  }

  onStepUpdate('step-editor', 'completed', { durationMs: Date.now() - stage8Start });
  onLog('?? Processing successfully finished! Launching main studio editor...');

  return {
    words: sanitizeCaptionWords(finalWords),
    roughWords: nova3OriginalTimings,
    detectedLanguage: detectedSourceLanguage,
    modelUsed: 'Gemini 3.5 Transcribe + Nova 3 + Gemini 3.6 Flash',
    rawGeminiResult: sessionCache.gemini36FlashOutput,
    dubbedAudioBlob,
    dubbedAudioUrl,
    isAudioOnly: mediaInfo.isAudioOnly,
    videoUrl,
    mediaDurationSeconds: mediaInfo.durationSeconds,
    sessionCache
  };
}
