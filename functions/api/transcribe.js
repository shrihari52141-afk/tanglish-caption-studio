export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    const language = formData.get('language') || 'auto';
    const translationMode = formData.get('translationMode') || 'transliterate';
    const useEmojis = formData.get('useEmojis') === 'true';
    const usePunctuation = formData.get('usePunctuation') === 'true';
    const emojiStyle = formData.get('emojiStyle') || 'auto';
    const jobId = formData.get('jobId') || null;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No audio file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const deepgramApiKey = context.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      return new Response(JSON.stringify({ error: 'DEEPGRAM_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const geminiKeysRaw = context.env.GEMINI_API_KEYS || '';
    const geminiKeys = geminiKeysRaw
      .split(/[,;\s]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (geminiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEYS not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = new Uint8Array(arrayBuffer);
    const mimeType = file.type || 'audio/webm';

    // Convert to base64 for Gemini
    let base64Audio;
    if (typeof btoa !== 'undefined') {
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64Audio = btoa(binary);
    } else {
      base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    }

    // PASS 1: Deepgram Nova-3 for ground-truth timestamps
    const dgWords = await callDeepgram(audioBuffer, language, deepgramApiKey);

    // PASS 2: Gemini refiner with Deepgram words as acoustic baseline
    const promptBody = buildPrompt(translationMode, language, useEmojis, usePunctuation, dgWords, emojiStyle);

    let geminiWords;
    try {
      geminiWords = await callGemini(base64Audio, mimeType, promptBody, geminiKeys);
    } catch (geminiErr) {
      // Fallback to Deepgram-only transcription
      return new Response(
        JSON.stringify({
          error: 'Gemini refinement failed, falling back to Deepgram transcription',
          words: dgWords.map((w) => ({
            word: w.word,
            start: Math.round(w.start * 1000),
            end: Math.round(w.end * 1000),
            highlight: false,
            emoji: '',
            is_hotword: false,
          })),
          fallback: true,
          jobId,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Apply continuous piecewise alignment with Deepgram as acoustic guardrail
    const alignedWords = continuousPiecewiseAlignment(geminiWords, dgWords);

    const words = alignedWords.map((w) => ({
      word: w.word,
      start: Math.round(w.start),
      end: Math.round(w.end),
      highlight: w.highlight,
      emoji: w.emoji || '',
      is_hotword: w.is_hotword || false,
    }));

    return new Response(
      JSON.stringify({
        words,
        jobId,
        model: 'nova-3+gemini-dual-pass',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

async function callDeepgram(audioBuffer, language, apiKey) {
  const dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true${language !== 'auto' ? `&language=${encodeURIComponent(language)}` : ''}`;
  
  const authHeader = apiKey.toLowerCase().startsWith('token ') ? apiKey : `Token ${apiKey}`;
  
  const response = await fetch(dgUrl, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'audio/webm',
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Deepgram Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const words = data.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  
  return words.map(w => ({
    word: w.punctuated_word || w.word,
    start: w.start,
    end: w.end,
  }));
}

function buildPrompt(translationMode, language, useEmojis, usePunctuation, dgWords, emojiStyle) {
  const scriptPromptMap = {
    native: `transcribe the spoken words in NATIVE SCRIPT of language code '${language}'.`,
    transliterate: `transcribe the spoken words in ROMANIZED / TANGLISH phonetic script using English letters.`,
    translate_english: `translate the audio accurately into ENGLISH words.`,
    translate_tamil: `translate the audio accurately into TAMIL words (Tamil script).`,
    translate_hindi: `translate the audio accurately into HINDI words (Devanagari script).`,
    translate_kannada: `translate the audio accurately into KANNADA words (Kannada script).`,
    translate_telugu: `translate the audio accurately into TELUGU words (Telugu script).`,
    translate_malayalam: `translate the audio accurately into MALAYALAM words (Malayalam script).`,
    translate_spanish: `translate the audio accurately into SPANISH words.`,
    translate_french: `translate the audio accurately into FRENCH words.`,
    translate_german: `translate the audio accurately into GERMAN words.`,
    translate_portuguese: `translate the audio accurately into PORTUGUESE words.`,
    translate_italian: `translate the audio accurately into ITALIAN words.`,
    translate_russian: `translate the audio accurately into RUSSIAN words (Cyrillic script).`,
    translate_arabic: `translate the audio accurately into ARABIC words (Arabic script).`,
    translate_japanese: `translate the audio accurately into JAPANESE words (Japanese script).`,
    translate_korean: `translate the audio accurately into KOREAN words (Hangul script).`,
    translate_chinese: `translate the audio accurately into CHINESE words (Simplified Chinese).`,
    keep_script: `transcribe the spoken words in their NATIVE SCRIPT. Do NOT transliterate or translate.`,
    auto_roman: `AUTO-DETECT the spoken language, then transcribe it in ROMANIZED phonetic script using English letters (e.g., Tamil → Tanglish, Hindi → Hinglish, Telugu → Teluglish). Do NOT translate - only romanize the detected language.`,
  };

  let extraInstructions = '';
  if (usePunctuation) {
    extraInstructions += `\n- Include natural punctuation (commas, periods, question marks, exclamation).`;
  } else {
    extraInstructions += `\n- OMIT all punctuation (no commas, periods, question marks).`;
  }

  if (useEmojis) {
    const emojiStyleMap = {
      auto: 'Use smart contextual emojis appropriate to the content.',
      emotions: 'Use emotional/feeling emojis (😊, 😢, 😡, 😍, etc.).',
      vibes: 'Use vibe/atmosphere emojis (✨, 🔥, 💯, 🌟, etc.).',
      objects: 'Use object/thing emojis (📱, 🚗, 🏠, 🎮, etc.).',
      energetic: 'Use high-energy emojis (💪, ⚡, 🚀, 💥, etc.).',
      minimal: 'Use only 1-2 subtle emojis per sentence.',
      custom: 'Use creative, expressive emojis.',
    };
    extraInstructions += `\n- SMART CONTEXTUAL EMOJIS: ${emojiStyleMap[emojiStyle] || emojiStyleMap.auto} Append exactly ONE emoji to key emotive words or main nouns. NEVER add emojis to routine words ("and", "the", "is").`;
  } else {
    extraInstructions += `\n- NO EMOJIS.`;
  }

  if (translationMode === 'auto_roman') {
    extraInstructions += `\n- LANGUAGE DETECTION: First detect the spoken language, then romanize it appropriately (e.g., Tamil→Tanglish, Hindi→Hinglish, Telugu→Teluglish, Kannada→Kannadish, Malayalam→Manglish, etc.).`;
  }

  const roughWordsJson = JSON.stringify(dgWords.map(w => ({
    word: w.word,
    start: Math.round(w.start * 1000),
    end: Math.round(w.end * 1000),
  })));

  return `You are an expert speech-to-text acoustic alignment engine and millisecond pronunciation timer.

INPUT DATA:
1. Audio file binary.
2. Pass 1 baseline word timestamps (Deepgram Nova-3): ${roughWordsJson}

STRICT ACOUSTIC PRONUNCIATION & MILLISECOND TIMING DIRECTIVES:
1. Target Script: ${scriptPromptMap[translationMode] || scriptPromptMap.transliterate}
2. ACOUSTIC SOUND BOUNDS: Align each word's "start" and "end" timestamps to when vocal sound actually starts and ends.
3. EXTENDED VOWELS: If a word is drawn out (e.g., "sooooo"), stretch duration to match physical sound length.
4. PAUSES: Preserve natural silence gaps between phrases.
5. Correct wrong/misspelled words from Pass 1 while preserving sound bounds.
${extraInstructions}

Return ONLY a JSON array of objects with keys:
- "word" (string): The corrected/translated/romanized word
- "start" (integer ms): Acoustic start timestamp in milliseconds
- "end" (integer ms): Acoustic end timestamp in milliseconds
- "highlight" (boolean): true for proper names, vocal exclamations, or emphasized words
- "emoji" (string): Single contextual emoji attached to key words (empty string if none)
- "is_hotword" (boolean): true for high-impact/accented words

Example: [{"word": "vanakkam", "start": 800, "end": 1450, "highlight": true, "emoji": "🙏", "is_hotword": true}, {"word": "epdi", "start": 1500, "end": 1900, "highlight": false, "emoji": "", "is_hotword": false}]`;
}

async function callGemini(base64Audio, mimeType, promptBody, geminiKeys) {
  const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
  const shuffledKeys = [...geminiKeys].sort(() => Math.random() - 0.5);
  let lastError;

  for (const model of models) {
    for (const key of shuffledKeys) {
      try {
        const geminiReqBody = {
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64Audio } },
              { text: promptBody },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  word: { type: 'STRING' },
                  start: { type: 'INTEGER' },
                  end: { type: 'INTEGER' },
                  highlight: { type: 'BOOLEAN' },
                  emoji: { type: 'STRING' },
                  is_hotword: { type: 'BOOLEAN' },
                },
                required: ['word', 'start', 'end'],
              },
            },
          },
        };

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiReqBody),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          lastError = new Error(`Gemini Error (${model}, ${response.status}): ${errText}`);
          continue;
        }

        const result = await response.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
          lastError = new Error(`Gemini returned no content (${model})`);
          continue;
        }

        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          lastError = new Error(`Gemini response was not valid JSON (${model})`);
          continue;
        }

        return Array.isArray(parsed) ? parsed : parsed.words || parsed.transcript || [];
      } catch (e) {
        lastError = e;
      }
    }
  }

  throw lastError || new Error('All Gemini keys and models exhausted');
}

function continuousPiecewiseAlignment(geminiWords, deepgramWords) {
  if (!geminiWords || !geminiWords.length) return [];

  return geminiWords.map((w, idx) => {
    let start = w.start;
    let end = w.end;

    // Rule 1: Prevent overlapping with previous word's end timestamp
    if (idx > 0) {
      const prevEnd = geminiWords[idx - 1].end;
      if (start < prevEnd) {
        start = prevEnd;
      }
    }

    // Rule 2: Acoustic Guardrail - Anchor to Deepgram ground-truth if drift > 150ms
    const sttMatch = deepgramWords[idx];
    if (sttMatch) {
      const dgStartMs = Math.round(sttMatch.start * 1000);
      const dgEndMs = Math.round(sttMatch.end * 1000);
      
      if (Math.abs(start - dgStartMs) > 150) {
        const duration = Math.max(40, end - start);
        start = dgStartMs;
        end = Math.min(dgEndMs, start + duration);
      }
    }

    // Rule 3: Reading Duration Floor - clamp minimum duration based on character length
    const charCount = w.word?.trim()?.length || 1;
    const minDuration = Math.max(30, Math.min(350, charCount * 22));
    if (end - start < minDuration) {
      end = start + minDuration;
    }

    if (end <= start) end = start + 40;

    return {
      word: w.word,
      start: Math.round(start),
      end: Math.round(end),
      highlight: !!w.highlight,
      emoji: w.emoji || '',
      is_hotword: !!w.is_hotword,
    };
  });
}