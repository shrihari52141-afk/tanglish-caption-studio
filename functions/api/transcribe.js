export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    const deepgramApiKey = formData.get('deepgramApiKey');
    const geminiApiKey = formData.get('geminiApiKey');
    const geminiModel = formData.get('geminiModel') || 'gemini-3.5-flash';
    const scriptMode = formData.get('scriptMode') || 'native';
    const spokenLang = formData.get('spokenLang') || 'en';
    const enableHighlight = formData.get('enableHighlight') === 'true';
    const enableEmojis = formData.get('enableEmojis') === 'true';

    if (!file) {
      return new Response(JSON.stringify({ error: 'No audio file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!deepgramApiKey || !geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Missing Deepgram or Gemini API key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const arrayBuffer = await file.arrayBuffer();

    // 1. Dispatch Pass 1 to Deepgram Nova-3 API
    let dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true`;
    if (spokenLang) dgUrl += `&language=${encodeURIComponent(spokenLang)}`;

    const authHeader = deepgramApiKey.toLowerCase().startsWith('token ') ? deepgramApiKey : `Token ${deepgramApiKey}`;
    const dgPromise = fetch(dgUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': file.type || 'audio/mp3' },
      body: arrayBuffer
    }).then(async res => {
      if (!res.ok) throw new Error(`Deepgram Error (${res.status}): ${await res.text()}`);
      return res.json();
    });

    // 2. Convert ArrayBuffer to Base64 for Gemini
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const base64Audio = btoa(binary);

    // Wait for Deepgram response
    const dgResult = await dgPromise;
    const dgWords = dgResult.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    const roughWords = dgWords.map(w => ({
      word: w.punctuated_word || w.word,
      start: Math.round(w.start * 1000),
      end: Math.round(w.end * 1000)
    }));

    // 3. Construct Gemini Prompt
    const scriptPromptMap = {
      native: `transcribe the spoken words in NATIVE SCRIPT of language code '${spokenLang}'.`,
      tanglish: `transcribe the spoken words in ROMANIZED / TANGLISH phonetic script using English letters.`,
      english: `translate the audio accurately into ENGLISH words.`
    };

    let extraInstructions = "";
    if (enableHighlight) {
      extraInstructions += `\n5. IDENTIFY NAMES & EXPRESSIONS: Set "highlight": true for proper names (e.g. "Zara", "Shrihari") or vocal exclamations ("Aiyo!", "Wow!"). Otherwise false.`;
    }
    if (enableEmojis) {
      extraInstructions += `\n6. SMART CONTEXTUAL EMOJIS: Append 1 relevant emoji ONLY to key emotive words or main nouns (e.g. "Zara 👧", "Aiyo! 😱", "Love ❤️"). NEVER add emojis to routine words ("and", "the").`;
    }

    const systemPrompt = `You are an expert speech-to-text acoustic alignment engine and millisecond pronunciation timer.

INPUT DATA:
1. Audio file binary.
2. Pass 1 baseline word timestamps: ${JSON.stringify(roughWords)}

STRICT ACOUSTIC PRONUNCIATION & MILLISECOND TIMING DIRECTIVES:
1. Target Script: ${scriptPromptMap[scriptMode] || scriptPromptMap.native}
2. ACOUSTIC SOUND BOUNDS: Align each word's "start" and "end" timestamps to when vocal sound actually starts and ends.
3. EXTENDED VOWELS: If a word is drawn out (e.g. "sooooo"), stretch duration to match physical sound length.
4. PAUSES: Preserve natural silence gaps between phrases.
5. Correct wrong/misspelled words from Pass 1 while preserving sound bounds.
${extraInstructions}

Return ONLY a JSON array of objects with keys "word" (string), "start" (integer ms), "end" (integer ms), and "highlight" (boolean).`;

    const geminiReqBody = {
      contents: [{
        parts: [
          { inlineData: { mimeType: file.type || "audio/mp3", data: base64Audio } },
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

    // Key Failover Loop
    const geminiKeys = geminiApiKey.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
    const shuffledKeys = [...geminiKeys].sort(() => Math.random() - 0.5);

    let rawGeminiResult = null;
    let lastErr = null;

    for (let i = 0; i < shuffledKeys.length; i++) {
      try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${shuffledKeys[i]}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiReqBody)
        });

        if (!geminiRes.ok) throw new Error(`Gemini Error (${geminiRes.status}): ${await geminiRes.text()}`);

        const geminiData = await geminiRes.json();
        const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) throw new Error('No text generated.');

        rawGeminiResult = JSON.parse(candidateText);
        break;
      } catch (err) { lastErr = err; }
    }

    if (!rawGeminiResult) throw new Error(`All Gemini keys failed: ${lastErr ? lastErr.message : 'Unknown'}`);

    return new Response(JSON.stringify({ dgResult, roughWords, rawGeminiResult }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}