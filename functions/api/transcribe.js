export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    const requestedDgKey = formData.get('deepgramApiKey');
    const requestedGeminiKeys = formData.get('geminiApiKey');
    const requestedModel = formData.get('geminiModel') || formData.get('model');
    const scriptMode = formData.get('scriptMode') || formData.get('translationMode') || 'tanglish';
    const spokenLang = formData.get('spokenLang') || formData.get('language') || 'auto';

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

    if (!geminiKeys.length && !dgKeys.length) {
      return new Response(JSON.stringify({ error: 'No API keys configured for transcription.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const arrayBuffer = await file.arrayBuffer();

    // 1. Pass 1: Enhanced Deepgram Nova-3 API Call (Exact requested endpoint & params)
    const candidateLanguages = (spokenLang && spokenLang !== 'auto')
      ? [spokenLang, 'auto', 'ta', 'hi', 'te', 'kn', 'en']
      : ['auto', 'ta', 'hi', 'te', 'kn', 'en'];

    const shuffledDgKeys = [...dgKeys].sort(() => Math.random() - 0.5);
    let dgResult = null;
    let lastDgError = null;

    if (shuffledDgKeys.length > 0) {
      langLoop:
      for (const testLang of candidateLanguages) {
        let dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true`;
        if (testLang === 'auto') {
          dgUrl += `&detect_language=true`;
        } else {
          dgUrl += `&language=${encodeURIComponent(testLang)}`;
        }

        for (let i = 0; i < shuffledDgKeys.length; i++) {
          const currentKey = shuffledDgKeys[i];
          const authHeader = currentKey.toLowerCase().startsWith('token ') ? currentKey : `Token ${currentKey}`;

          try {
            const dgRes = await fetch(dgUrl, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': file.type || 'audio/wav'
              },
              body: arrayBuffer,
              signal: AbortSignal.timeout(6000)
            });

            if (dgRes.ok) {
              const resJson = await dgRes.json();
              const words = resJson?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
              if (words.length > 0) {
                dgResult = resJson;
                break langLoop;
              }
            }
          } catch (err) {
            lastDgError = err;
          }
        }
      }
    }

    const dgWords = dgResult?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    const roughWords = dgWords.map(w => ({
      word: w.punctuated_word || w.word,
      start: Math.round(w.start * 1000),
      end: Math.round(w.end * 1000)
    }));

    const totalAudioDurationMs = roughWords.length > 0
      ? roughWords[roughWords.length - 1].end + 1000
      : 60000;

    // 2. Convert ArrayBuffer to Base64 in RAM for Gemini payload
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const base64Audio = btoa(binary);

    // 3. Script Target Instruction
    const scriptPromptMap = {
      native: spokenLang && spokenLang !== 'auto'
        ? `transcribe the spoken words with full punctuation in the NATIVE SCRIPT of language '${spokenLang}' (e.g. தமிழ், ಕನ್ನಡ, हिंदी).`
        : `detect the spoken language automatically (Tamil, Kannada, Hindi, Telugu, Malayalam, English, etc.) and transcribe the spoken words with full punctuation in its native script.`,
      tanglish: `detect the spoken language automatically (Tamil, Kannada, Hindi, Telugu, Malayalam, etc.) and transcribe the spoken words with full punctuation in ROMANIZED / TANGLISH / HINGLISH / TELUGISH / MANGLISH / KANNADISH phonetic script using English letters (e.g. "Maa Behen movie la vandhu", "avanga society la irukavanga", "Nee sari kadaiyathu", "madbeka?", "bhai kaisa hai").`,
      english: `translate the audio accurately into standard, polished, natural ENGLISH words with full punctuation.`
    };
    const targetScriptInstruction = scriptPromptMap[scriptMode] || scriptPromptMap.tanglish;

    // 4. Gemini System Prompt
    const systemPrompt = `You are an ultra-precise audio transcription, translation, multilingual slang recognition, and zero-lag lip-sync subtitle engine.

TOTAL AUDIO DURATION: ${totalAudioDurationMs}ms (${(totalAudioDurationMs / 1000).toFixed(1)} seconds).
PASS 1 ACOUSTIC TIMINGS FROM DEEPGRAM:
${JSON.stringify(roughWords)}

=== STRICT FULL-COVERAGE TRANSCRIPTION MANDATE ===
1. You MUST transcribe the COMPLETE audio track from 0ms all the way to the very end (${totalAudioDurationMs}ms).
2. DO NOT STOP, TRUNCATE, OR SUMMARIZE. The last segment MUST reach the end of the audio track near ${totalAudioDurationMs}ms.
3. Script Target: ${targetScriptInstruction}
4. Use the Pass 1 acoustic timestamps as ground truth for start (\`s\`) and end (\`e\`) milliseconds.
5. Add 1 contextually relevant emoji for key words / emotions.
6. Return valid JSON adhering strictly to the JSON schema.`;

    const geminiReqBody = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: file.type || 'audio/wav',
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

    // 6. Failover Execution over Models (3.6 Flash primary -> 3.5 Flash -> 3.5 Flash Lite) with key rotation
    const shuffledKeys = [...geminiKeys].sort(() => Math.random() - 0.5);
    const modelsToTry = [
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite'
    ];

    let rawGeminiResult = null;
    let lastErr = null;
    let usedModel = modelsToTry[0];

    outerLoop:
    for (const m of modelsToTry) {
      if (shuffledKeys.length === 0) break;
      const keysToTest = shuffledKeys.slice(0, 3);
      for (let i = 0; i < keysToTest.length; i++) {
        const currentKey = keysToTest[i];
        const fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(currentKey)}`;
        
        const headers = { 
          'Content-Type': 'application/json',
          'x-goog-api-key': currentKey
        };

        try {
          const timeoutMs = m === 'gemini-3.7-flash' ? 5000 : 25000;
          const geminiRes = await fetch(fetchUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(geminiReqBody),
            signal: AbortSignal.timeout(timeoutMs)
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
            break outerLoop;
          }
        } catch (err) {
          lastErr = err;
        }
      }
    }

    // 7. Process & Flatten Gemini Output JSON Structure
    let extractedWords = [];
    if (rawGeminiResult?.segments && Array.isArray(rawGeminiResult.segments)) {
      rawGeminiResult.segments.forEach((seg) => {
        const segEmoji = seg.emoji || '';
        const segWords = seg.words || [];
        if (Array.isArray(segWords)) {
          segWords.forEach((w, wIdx) => {
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
    }

    if (extractedWords.length === 0) {
      if (roughWords.length > 0) {
        // Fallback to Deepgram Nova-3 acoustic baseline words
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
        throw new Error(lastErr?.message || 'Transcription failed to generate words.');
      }
    }

    // 8. Continuous Piecewise Alignment Guardrail (Preserves full metadata & emoji)
    const alignedWords = continuousPiecewiseAlignment(extractedWords, roughWords);

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
        is_expression: !!w.is_expression,
        is_question: !!w.is_question,
        is_name: !!w.is_name,
        is_sentence_end: !!w.is_sentence_end,
        emoji: w.emoji || '',
        is_hotword: !!w.highlight || !!w.is_expression || !!w.is_name,
      };
    });

    return new Response(JSON.stringify({
      dgResult,
      roughWords,
      rawGeminiResult,
      words,
      alignedWords: words,
      jobId: `job-${Date.now()}`,
      model: `nova-3+${usedModel}`
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

// Continuous Piecewise Alignment Algorithm (preserving metadata & robust unit handling)
function continuousPiecewiseAlignment(geminiWords, deepgramWords) {
  if (!geminiWords || !geminiWords.length) return [];

  const getMs = (val, defaultVal) => {
    if (typeof val !== 'number' || isNaN(val)) return defaultVal;
    return val < 100 && val > 0 ? val * 1000 : val;
  };

  const dgNormalized = (deepgramWords || []).map((dg, i) => {
    const s = getMs(dg.start_ms ?? dg.start, i * 400);
    const e = getMs(dg.end_ms ?? dg.end, s + 350);
    return { start: s, end: e, word: dg.word || '' };
  });

  let previousEnd = 0;

  return geminiWords.map((w, idx) => {
    const rawStart = w.start_ms ?? w.start ?? (w.start_time !== undefined ? w.start_time * 1000 : undefined);
    const rawEnd = w.end_ms ?? w.end ?? (w.end_time !== undefined ? w.end_time * 1000 : undefined);

    let start = getMs(rawStart, previousEnd);
    let end = getMs(rawEnd, start + 300);

    // Rule 1: Prevent overlapping with previous word's end timestamp
    if (idx > 0 && start < previousEnd) {
      start = previousEnd;
    }

    // Rule 2: Anchor to closest Deepgram acoustic word timestamp if drift > 200ms
    if (dgNormalized.length > 0) {
      let bestMatch = dgNormalized[idx];
      if (!bestMatch || Math.abs(bestMatch.start - start) > 1000) {
        let minDiff = Infinity;
        for (const dg of dgNormalized) {
          const diff = Math.abs(dg.start - start);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = dg;
          }
        }
      }

      if (bestMatch && Math.abs(start - bestMatch.start) > 200 && Math.abs(start - bestMatch.start) < 2500) {
        const duration = Math.max(50, end - start);
        start = bestMatch.start;
        end = Math.min(bestMatch.end, start + duration);
      }
    }

    // Rule 3: Enforce minimum display floor based on character length
    const charCount = (w.word || '').trim().length;
    const minDuration = Math.max(40, Math.min(350, charCount * 24));
    if (end - start < minDuration) {
      end = start + minDuration;
    }

    if (end <= start) end = start + 50;
    previousEnd = end;

    const sSec = start / 1000;
    const eSec = end / 1000;

    return {
      ...w,
      start: Math.round(start),
      end: Math.round(end),
      start_ms: Math.round(start),
      end_ms: Math.round(end),
      start_time: sSec,
      end_time: eSec,
    };
  });
}