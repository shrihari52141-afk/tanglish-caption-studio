export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    const requestedModel = formData.get('model') || formData.get('geminiModel') || 'gemini-3.6-flash';
    const translationMode = formData.get('translationMode') || formData.get('scriptMode') || 'transliterate';
    const spokenLang = formData.get('language') || 'auto';
    const useEmojis = formData.get('useEmojis') === 'true';
    const usePunctuation = formData.get('usePunctuation') === 'true';
    const emojiStyle = formData.get('emojiStyle') || 'vibes';

    if (!file) {
      return new Response(JSON.stringify({ error: 'No audio file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- 1. EXTRACT AND RANDOM SHUFFLE DEEPGRAM API KEYS ---
    let rawDgInput = formData.get('deepgramApiKey') || '';
    if (context.env) {
      for (const k in context.env) {
        if (/deepgram/i.test(k) && context.env[k] != null) {
          rawDgInput += ` ${String(context.env[k])}`;
        }
      }
    }
    const dgKeys = rawDgInput.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean);

    if (!dgKeys.length) {
      return new Response(JSON.stringify({ error: 'Missing Deepgram API key. Set DEEPGRAM_API_KEY in Cloudflare Pages environment variables or upload form.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const shuffledDgKeys = [...dgKeys].sort(() => Math.random() - 0.5);

    // --- 2. EXTRACT AND RANDOM SHUFFLE GEMINI API KEYS ---
    let rawGeminiInput = formData.get('geminiApiKey') || '';
    if (context.env) {
      for (const k in context.env) {
        if (/gemini/i.test(k) && context.env[k] != null) {
          rawGeminiInput += ` ${String(context.env[k])}`;
        }
      }
    }
    const geminiKeys = rawGeminiInput.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean);

    if (!geminiKeys.length) {
      return new Response(JSON.stringify({ error: 'Missing Gemini API key. Set GEMINI_API_KEYS or GEMINI_API_KEY in Cloudflare Pages environment variables or upload form.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const shuffledGeminiKeys = [...geminiKeys].sort(() => Math.random() - 0.5);

    const arrayBuffer = await file.arrayBuffer();

    // --- 3. DISPATCH PASS 1: DEEPGRAM NOVA-3 WITH KEY ROTATION ---
    let dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true`;
    if (spokenLang && spokenLang !== 'auto') dgUrl += `&language=${encodeURIComponent(spokenLang)}`;

    let dgResult = null;
    let lastDgError = null;

    for (let i = 0; i < shuffledDgKeys.length; i++) {
      const key = shuffledDgKeys[i];
      const authHeader = key.toLowerCase().startsWith('token ') ? key : `Token ${key}`;

      try {
        const dgRes = await fetch(dgUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': file.type || 'audio/webm',
          },
          body: arrayBuffer,
        });

        if (!dgRes.ok) {
          const errText = await dgRes.text();
          throw new Error(`Deepgram Error (${dgRes.status}): ${errText}`);
        }

        dgResult = await dgRes.json();
        break; // Key succeeded
      } catch (err) {
        lastDgError = err;
      }
    }

    if (!dgResult) {
      throw new Error(`All ${shuffledDgKeys.length} Deepgram keys failed: ${lastDgError ? lastDgError.message : 'Unknown'}`);
    }

    const dgWords = dgResult.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    const roughWords = dgWords.map(w => ({
      word: w.punctuated_word || w.word,
      start: Math.round(w.start * 1000),
      end: Math.round(w.end * 1000),
    }));

    // --- 4. CONVERT AUDIO TO BASE64 FOR GEMINI ---
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const base64Audio = btoa(binary);

    // --- 5. BUILD GEMINI PROMPT & PAYLOAD ---
    const prompt = buildPrompt(translationMode, spokenLang, useEmojis, usePunctuation, dgWords, emojiStyle);

    const geminiReqBody = {
      contents: [{
        parts: [
          { inlineData: { mimeType: file.type || "audio/mp3", data: base64Audio } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.9,
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              word: { type: "STRING" },
              start: { type: "INTEGER" },
              end: { type: "INTEGER" },
              highlight: { type: "BOOLEAN" },
              emoji: { type: "STRING" }
            },
            required: ["word", "start", "end"]
          }
        }
      }
    };

    // --- 6. DISPATCH PASS 2: GEMINI FLASH REFINER WITH RANDOM SHUFFLED KEYS ---
    const modelsToTry = [requestedModel, 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']
      .filter((v, idx, self) => self.indexOf(v) === idx);

    let geminiWords = null;
    let lastGeminiError = null;

    outerLoop:
    for (const m of modelsToTry) {
      for (const k of shuffledGeminiKeys) {
        try {
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiReqBody),
          });

          if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            throw new Error(`Gemini Error (${m}, ${geminiRes.status}): ${errText}`);
          }

          const geminiData = await geminiRes.json();
          const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!candidateText) throw new Error(`No text generated by Gemini (${m})`);

          const parsed = JSON.parse(candidateText);
          geminiWords = Array.isArray(parsed) ? parsed : (parsed.words || parsed.transcript || []);
          if (geminiWords && geminiWords.length > 0) break outerLoop;
        } catch (err) {
          lastGeminiError = err;
        }
      }
    }

    if (!geminiWords) {
      // If Gemini completely fails, fallback directly to Deepgram Nova-3 acoustic words
      geminiWords = roughWords.map(w => ({
        word: w.word,
        start: w.start,
        end: w.end,
        highlight: false,
        emoji: ''
      }));
    }

    // --- 7. PASS 3: CONTINUOUS PIECEWISE ALIGNMENT GUARDRAIL ---
    const alignedWords = continuousPiecewiseAlignment(geminiWords, dgWords);

    const words = alignedWords.map((w, idx, arr) => {
      const sMs = Math.round(w.start);
      const eMs = Math.round(w.end);
      const nextSMs = idx < arr.length - 1 ? Math.round(arr[idx + 1].start) : eMs;
      const pauseAfterMs = Math.max(0, nextSMs - eMs);

      return {
        word: w.word,
        start: sMs,
        end: eMs,
        start_ms: sMs,
        end_ms: eMs,
        start_time: sMs / 1000,
        end_time: eMs / 1000,
        pause_after_ms: pauseAfterMs,
        highlight: !!w.highlight,
        emoji: w.emoji || '',
        is_hotword: !!w.is_hotword || !!w.highlight,
      };
    });

    const jobId = `job-${Date.now()}`;
    return new Response(
      JSON.stringify({
        words,
        alignedWords: words,
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
    translate_korean: `translate the audio accurately into HANGUL script (Korean).`,
    translate_chinese: `translate the audio accurately into CHINESE words.`,
    keep_script: `transcribe the spoken words in their NATIVE SCRIPT. Do NOT transliterate or translate.`,
    auto_roman: `AUTO-DETECT the spoken language, then transcribe it in ROMANIZED phonetic script using English letters (e.g., Tamil → Tanglish, Hindi → Hinglish, Telugu → Teluglish). Do NOT translate - only romanize the detected language.`,
    'Romanize (Auto Roman Script)': `AUTO-DETECT the spoken language, then transcribe it in ROMANIZED phonetic script using English letters (e.g., Tamil → Tanglish, Hindi → Hinglish). Do NOT translate.`,
  };

  let extraInstructions = '';
  if (usePunctuation) {
    extraInstructions += `\n- Include natural punctuation (commas, periods, question marks).`;
  } else {
    extraInstructions += `\n- OMIT all punctuation.`;
  }

  if (useEmojis) {
    extraInstructions += `\n- SMART CONTEXTUAL EMOJIS: Append 1 relevant emoji ONLY to key emotive words or main nouns. OMIT emojis for routine words.`;
  } else {
    extraInstructions += `\n- NO EMOJIS.`;
  }

  const roughWordsJson = JSON.stringify(dgWords.map(w => ({
    word: w.punctuated_word || w.word,
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

Return ONLY a JSON array of objects with keys "word" (string), "start" (integer ms), "end" (integer ms), and "highlight" (boolean).`;
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
      is_hotword: !!w.is_hotword || !!w.highlight,
    };
  });
}