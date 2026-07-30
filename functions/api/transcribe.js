export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    const requestedDgKey = formData.get('deepgramApiKey');
    const requestedGeminiKeys = formData.get('geminiApiKey');
    const geminiModel = formData.get('geminiModel') || formData.get('model') || 'gemini-2.5-flash';
    const scriptMode = formData.get('scriptMode') || formData.get('translationMode') || 'native';
    const spokenLang = formData.get('spokenLang') || formData.get('language') || 'auto';
    const enableHighlight = formData.get('enableHighlight') === 'true' || formData.get('enableHotwords') === 'true';
    const enableEmojis = formData.get('enableEmojis') === 'true' || formData.get('useEmojis') === 'true';

    if (!file) {
      return new Response(JSON.stringify({ error: 'Missing required file parameter.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract Deepgram Keys (from form or environment)
    let rawDgInput = requestedDgKey || '';
    if (context.env) {
      for (const k in context.env) {
        if (/deepgram/i.test(k) && context.env[k]) {
          rawDgInput += ` ${String(context.env[k])}`;
        }
      }
    }
    const dgKeys = rawDgInput.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean);

    if (!dgKeys.length) {
      return new Response(JSON.stringify({ error: 'Missing Deepgram API key.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract Gemini Keys (from form or environment)
    let rawGeminiInput = requestedGeminiKeys || '';
    if (context.env) {
      for (const k in context.env) {
        if (/gemini/i.test(k) && context.env[k]) {
          const strVal = String(context.env[k]).trim();
          if (strVal) rawGeminiInput += ` ${strVal}`;
        }
      }
    }
    let geminiKeys = rawGeminiInput.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean);

    // Remote config fallback pool if env variable is unpopulated
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
      return new Response(JSON.stringify({ error: 'Missing Gemini API key.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const arrayBuffer = await file.arrayBuffer();

    // 1. Pass 1: Enhanced Deepgram Nova-3 API Call (with filler_words=true)
    const validLanguages = ['ta', 'kn', 'hi', 'te', 'ml', 'mr', 'bn', 'gu', 'en', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ar', 'ja', 'ko', 'zh'];
    let dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true`;
    if (spokenLang && spokenLang !== 'auto' && validLanguages.includes(spokenLang)) {
      dgUrl += `&language=${encodeURIComponent(spokenLang)}`;
    }

    const shuffledDgKeys = [...dgKeys].sort(() => Math.random() - 0.5);
    let dgResult = null;
    let lastDgError = null;

    for (let i = 0; i < shuffledDgKeys.length; i++) {
      const currentKey = shuffledDgKeys[i];
      const authHeader = currentKey.toLowerCase().startsWith('token ') ? currentKey : `Token ${currentKey}`;

      try {
        const dgRes = await fetch(dgUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': file.type || 'audio/mp3'
          },
          body: arrayBuffer
        });

        if (!dgRes.ok) {
          const text = await dgRes.text();
          throw new Error(`Deepgram API error (${dgRes.status}): ${text}`);
        }

        dgResult = await dgRes.json();
        break;
      } catch (err) {
        lastDgError = err;
      }
    }

    // Fallback if model/language combination fails on Deepgram
    if (!dgResult) {
      const fallbackUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true`;
      for (let i = 0; i < shuffledDgKeys.length; i++) {
        const currentKey = shuffledDgKeys[i];
        const authHeader = currentKey.toLowerCase().startsWith('token ') ? currentKey : `Token ${currentKey}`;
        try {
          const dgRes = await fetch(fallbackUrl, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': file.type || 'audio/mp3'
            },
            body: arrayBuffer
          });
          if (dgRes.ok) {
            dgResult = await dgRes.json();
            break;
          }
        } catch (e) {}
      }
    }

    if (!dgResult) {
      throw new Error(`All Deepgram keys failed: ${lastDgError ? lastDgError.message : 'Unknown'}`);
    }

    const dgWords = dgResult.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    const roughWords = dgWords.map(w => ({
      word: w.punctuated_word || w.word,
      start: Math.round(w.start * 1000),
      end: Math.round(w.end * 1000)
    }));

    // 2. Convert ArrayBuffer to Base64 in RAM for Gemini payload
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const base64Audio = btoa(binary);

    // 3. Prepare Enhanced Gemini Acoustic Alignment & Syllable Cadence Prompt
    const scriptPromptMap = {
      native: `transcribe the spoken words in the NATIVE SCRIPT of language code '${spokenLang}' (e.g. தமிழ், ಕನ್ನಡ, हिंदी).`,
      tanglish: `transcribe the spoken words in ROMANIZED / TANGLISH phonetic script using English letters (e.g. "Maanu", "Thappa", "Nee sari kadaiyathu").`,
      english: `translate the audio accurately into ENGLISH words.`
    };

    const targetScriptInstruction = scriptPromptMap[scriptMode] || scriptPromptMap.tanglish || scriptPromptMap.native;

    let extraInstructions = "";
    if (enableHighlight) {
      extraInstructions += `\n5. IDENTIFY NAMES & EXPRESSIONS: Set "highlight": true for proper names (e.g., "Zara", "Shrihari"), sudden vocal interjections, or exclamations ("Aiyo!", "Wow!", "Ahaa!"). Otherwise set "highlight": false.`;
    }
    if (enableEmojis) {
      extraInstructions += `\n6. SMART CONTEXTUAL EMOJIS: Append 1 perfect, relevant emoji ONLY to key emotive words, sudden expressions, or main nouns (e.g., "Zara 👧", "Aiyo! 😱", "Super 🔥", "Love ❤️"). NEVER add emojis to routine words like "and", "the", "is".`;
    }

    const systemPrompt = `You are an expert speech-to-text acoustic alignment engine and millisecond pronunciation timer.

INPUT DATA:
1. Audio file.
2. Pass 1 baseline word timestamps: ${JSON.stringify(roughWords)}

STRICT ACOUSTIC PRONUNCIATION & MILLISECOND TIMING DIRECTIVES:
1. Target Script: ${targetScriptInstruction}
2. ACOUSTIC SOUND BOUNDS: Align each word's "start" and "end" timestamps directly to when the speaker's vocal organs actually produce the sound:
   - "start": Millisecond when the first vocal phoneme of the word is uttered.
   - "end": Millisecond when the vocal sound of that word ends.
3. EXTENDED VOWELS & CADENCE: If the speaker elongates or draws out a word (e.g., "sooooo", "ammaaaa"), stretch the (end - start) duration to cover the full physical sound length.
4. PAUSES & BREATH BREAKS: Preserve natural silence gaps and pauses between phrases. Do not stretch words over silent gaps.
5. Correct wrong/misspelled words from Pass 1 while keeping timestamps tightly bound to vocal sound onset/offset.${extraInstructions}

Return ONLY a valid JSON array of objects with keys "word" (string), "start" (integer ms), "end" (integer ms), and "highlight" (boolean).`;

    const geminiReqBody = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: file.type || "audio/mp3",
              data: base64Audio
            }
          },
          { text: systemPrompt }
        ]
      }],
      generationConfig: {
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

    // Failover Shuffle Execution over Gemini Keys
    const shuffledKeys = [...geminiKeys].sort(() => Math.random() - 0.5);
    const modelsToTry = [geminiModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
      .filter((v, idx, self) => self.indexOf(v) === idx && !v.includes('3.6') && !v.includes('3.5'));

    let rawGeminiResult = null;
    let lastErr = null;

    outerLoop:
    for (const m of modelsToTry) {
      for (let i = 0; i < shuffledKeys.length; i++) {
        const currentKey = shuffledKeys[i];
        try {
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${currentKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiReqBody)
          });

          if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            throw new Error(`Gemini API Error (${m}, ${geminiRes.status}): ${errText}`);
          }

          const geminiData = await geminiRes.json();
          const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!candidateText) throw new Error('No valid response generated by Gemini.');

          rawGeminiResult = JSON.parse(candidateText);
          if (Array.isArray(rawGeminiResult) && rawGeminiResult.length > 0) {
            break outerLoop;
          }
        } catch (err) {
          lastErr = err;
        }
      }
    }

    if (!rawGeminiResult) {
      // Fallback to Deepgram Nova-3 acoustic baseline words
      rawGeminiResult = roughWords.map(w => ({
        word: w.word,
        start: w.start,
        end: w.end,
        highlight: false
      }));
    }

    // STEP 2: Continuous Piecewise Alignment Algorithm
    const refinedWords = continuousPiecewiseAlignment(rawGeminiResult, roughWords);

    const words = refinedWords.map((w, idx, arr) => {
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

    return new Response(JSON.stringify({
      dgResult,
      roughWords,
      rawGeminiResult,
      words,
      alignedWords: words,
      jobId: `job-${Date.now()}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Continuous Piecewise Alignment Algorithm with Acoustic Pause Preservation
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