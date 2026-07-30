export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    const translationMode = formData.get('translationMode') || formData.get('scriptMode') || 'transliterate';
    const spokenLang = formData.get('language') || formData.get('spokenLang') || 'auto';
    const useEmojis = formData.get('useEmojis') === 'true' || formData.get('enableEmojis') === 'true';
    const usePunctuation = formData.get('usePunctuation') === 'true';
    const emojiStyle = formData.get('emojiStyle') || 'vibes';
    const enableHotwords = formData.get('enableHotwords') === 'true' || formData.get('enableHighlight') === 'true';

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
        if (/deepgram/i.test(k) && context.env[k]) {
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
        if (/gemini/i.test(k) && context.env[k]) {
          const strVal = String(context.env[k]).trim();
          if (strVal) rawGeminiInput += ` ${strVal}`;
        }
      }
    }
    let geminiKeys = rawGeminiInput.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean);

    // Fallback: If Cloudflare environment variable is empty, fetch remote-config key pool
    if (!geminiKeys.length) {
      try {
        const remoteRes = await fetch("https://raw.githubusercontent.com/shrihari52141-afk/tanglish-caption-studio/main/remote-config.json");
        if (remoteRes.ok) {
          const remoteJson = await remoteRes.json();
          const remoteKeyStr = remoteJson?.GEMINI_API_KEY || remoteJson?.GEMINI_API_KEYS || '';
          if (remoteKeyStr) {
            geminiKeys = remoteKeyStr.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean);
          }
        }
      } catch (err) {
        console.warn("Remote key pool fetch failed:", err);
      }
    }

    if (!geminiKeys.length) {
      return new Response(JSON.stringify({ error: 'Missing Gemini API key. Set GEMINI_API_KEYS in Cloudflare Pages environment variables or upload form.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const shuffledGeminiKeys = [...geminiKeys].sort(() => Math.random() - 0.5);

    const arrayBuffer = await file.arrayBuffer();

    // --- 3. DISPATCH PASS 1: DEEPGRAM NOVA-3 WITH FILLER WORDS & MILLISECOND CADENCE ---
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

    // --- 4. BUILD GEMINI PROMPT & TEXT PAYLOAD ---
    const prompt = buildPrompt(translationMode, spokenLang, useEmojis, usePunctuation, roughWords, emojiStyle, enableHotwords);

    const geminiReqBody = {
      contents: [{
        parts: [{ text: prompt }]
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
              highlight: { type: "BOOLEAN" }
            },
            required: ["word", "start", "end"]
          }
        }
      }
    };

    // --- 5. DISPATCH PASS 2: FAST GEMINI TEXT REFINER (~1.0s) WITH VALID MODELS ---
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    let geminiWords = null;
    let lastGeminiError = null;
    let usedModel = 'gemini-2.5-flash';

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
          if (geminiWords && geminiWords.length > 0) {
            usedModel = m;
            break outerLoop;
          }
        } catch (err) {
          lastGeminiError = err;
        }
      }
    }

    if (!geminiWords) {
      // Fallback: If Gemini text refiner encounters API limits, use Deepgram Nova-3 acoustic words
      geminiWords = roughWords.map(w => ({
        word: w.word,
        start: w.start,
        end: w.end,
        highlight: false
      }));
    }

    // --- 6. PASS 3: CONTINUOUS PIECEWISE ALIGNMENT GUARDRAIL ---
    const alignedWords = continuousPiecewiseAlignment(geminiWords, roughWords);

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
        roughWords,
        rawGeminiResult: geminiWords,
        dgResult,
        jobId,
        model: `nova-3+${usedModel}`,
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

function buildPrompt(translationMode, language, useEmojis, usePunctuation, roughWords, emojiStyle, enableHotwords) {
  const scriptPromptMap = {
    native: `transcribe the spoken words in NATIVE SCRIPT of language code '${language}'.`,
    transliterate: `transcribe the spoken words in ROMANIZED / TANGLISH phonetic script using English letters (e.g. "Maanu", "Thappa", "Nee sari kadaiyathu").`,
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
    auto_roman: `AUTO-DETECT the spoken language, then transcribe it in ROMANIZED phonetic script using English letters (e.g., Tamil → Tanglish, Hindi → Hinglish, Telugu → Teluglish). Do NOT translate - only romanize the detected language. Preserve mixed English words naturally.`,
    'Romanize (Auto Roman Script)': `AUTO-DETECT the spoken language, then transcribe it in ROMANIZED phonetic script using English letters (e.g., Tamil → Tanglish, Hindi → Hinglish). Do NOT translate.`,
  };

  let extraInstructions = '';
  if (usePunctuation) {
    extraInstructions += `\n- Include natural punctuation (commas, periods, question marks).`;
  } else {
    extraInstructions += `\n- OMIT all punctuation.`;
  }

  if (useEmojis) {
    extraInstructions += `\n- SMART CONTEXTUAL EMOJIS: Append 1 relevant emoji ONLY to key emotive words or main nouns (e.g., "Zara 👧", "Aiyo! 😱", "Love ❤️"). NEVER add emojis to routine words ("and", "the").`;
  } else {
    extraInstructions += `\n- NO EMOJIS.`;
  }

  if (enableHotwords) {
    extraInstructions += `\n- IDENTIFY NAMES & EXPRESSIONS: Set "highlight": true for proper names (e.g., "Zara", "Shrihari"), sudden vocal interjections, or exclamations ("Aiyo!", "Wow!", "Ahaa!"). Otherwise set "highlight": false.`;
  }

  return `You are an expert speech-to-text acoustic alignment engine and millisecond pronunciation timer.

INPUT DATA:
1. Pass 1 baseline word timestamps (Deepgram Nova-3 with filler_words=true):
${JSON.stringify(roughWords)}

STRICT ACOUSTIC PRONUNCIATION & MILLISECOND TIMING DIRECTIVES:
1. Target Script: ${scriptPromptMap[translationMode] || scriptPromptMap.transliterate}
2. ACOUSTIC SOUND BOUNDS: Align each word's "start" and "end" timestamps directly to when the speaker's vocal organs actually produce the sound:
   - "start": Millisecond when the first vocal phoneme of the word is uttered.
   - "end": Millisecond when the vocal sound of that word ends.
3. EXTENDED VOWELS & CADENCE: If the speaker elongates or draws out a word (e.g., "sooooo", "ammaaaa"), stretch the (end - start) duration to cover the full physical sound length.
4. PAUSES & BREATH BREAKS: Preserve natural silence gaps and pauses between phrases. Do not stretch words over silent gaps.
5. Correct wrong/misspelled words from Pass 1 while keeping timestamps tightly bound to vocal sound onset/offset.${extraInstructions}

Return ONLY a valid JSON array of objects with keys "word" (string), "start" (integer ms), "end" (integer ms), and "highlight" (boolean).`;
}

function continuousPiecewiseAlignment(words, roughWords) {
  if (!words || !words.length) return [];

  return words.map((w, idx) => {
    let start = w.start;
    let end = w.end;

    // Rule 1: Prevent overlapping with previous word's end timestamp
    if (idx > 0 && start < words[idx - 1].end) {
      start = words[idx - 1].end;
    }

    // Rule 2: Anchor tightly to Deepgram ground-truth acoustic sound onset if Gemini drifts > 150ms
    const sttMatch = roughWords[idx];
    if (sttMatch) {
      if (Math.abs(start - sttMatch.start) > 150) {
        const duration = Math.max(40, end - start);
        start = sttMatch.start;
        end = Math.min(sttMatch.end, start + duration);
      }
    }

    // Rule 3: Enforce minimum display floor based on character length
    const charCount = (w.word || '').trim().length;
    const minDuration = Math.max(30, Math.min(350, charCount * 22));
    if (end - start < minDuration) {
      end = start + minDuration;
    }

    if (end <= start) end = start + 40;

    return {
      word: w.word,
      start: Math.round(start),
      end: Math.round(end),
      highlight: !!w.highlight
    };
  });
}