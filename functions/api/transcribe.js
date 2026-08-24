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
    const validLanguages = ['ta', 'kn', 'hi', 'te', 'ml', 'mr', 'bn', 'gu', 'en', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ar', 'ja', 'ko', 'zh'];
    let dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true`;
    if (spokenLang && spokenLang !== 'auto' && validLanguages.includes(spokenLang)) {
      dgUrl += `&language=${encodeURIComponent(spokenLang)}`;
    } else {
      dgUrl += `&detect_language=true`;
    }

    const shuffledDgKeys = [...dgKeys].sort(() => Math.random() - 0.5);
    let dgResult = null;
    let lastDgError = null;

    if (shuffledDgKeys.length > 0) {
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
            signal: AbortSignal.timeout(4000)
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

      // Fallback if language parameter was rejected by Deepgram
      if (!dgResult) {
        const fallbackUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true`;
        for (let i = 0; i < Math.min(1, shuffledDgKeys.length); i++) {
          const currentKey = shuffledDgKeys[i];
          const authHeader = currentKey.toLowerCase().startsWith('token ') ? currentKey : `Token ${currentKey}`;
          try {
            const dgRes = await fetch(fallbackUrl, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': file.type || 'audio/wav'
              },
              body: arrayBuffer,
              signal: AbortSignal.timeout(4000)
            });
            if (dgRes.ok) {
              dgResult = await dgRes.json();
              break;
            }
          } catch {
            // continue
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
      tanglish: `detect the spoken language automatically (Tamil, Kannada, Hindi, Telugu, Malayalam, etc.) and transcribe the spoken words with full punctuation in ROMANIZED / TANGLISH / HINGLISH / TELUGISH / MANGLISH / KANNADISH phonetic script using English letters (e.g. "Maanu", "Thappa", "Nee sari kadaiyathu", "madbeka?", "bhai kaisa hai").`,
      english: `translate the audio accurately into standard, polished, natural ENGLISH words with full punctuation.`
    };
    const targetScriptInstruction = scriptPromptMap[scriptMode] || scriptPromptMap.tanglish;

    // 4. Gemini System Prompt
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
            inline_data: {
              mime_type: file.type || 'audio/wav',
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
                        is_sentence_end: { type: "BOOLEAN" }
                      },
                      required: [
                        "word",
                        "start_ms",
                        "end_ms",
                        "highlight",
                        "is_expression",
                        "is_question",
                        "is_name",
                        "is_sentence_end"
                      ]
                    }
                  }
                },
                required: ["segment_id", "source_text", "translated_text", "emoji", "speech_window_ms", "words"]
              }
            }
          },
          required: ["source_language", "target_language", "segments"]
        }
      }
    };

    // 6. Failover Execution over Models (3.7 Flash -> 3.6 Flash -> 3.5 Flash -> 2.5 Flash) with key rotation
    const shuffledKeys = [...geminiKeys].sort(() => Math.random() - 0.5);
    const modelsToTry = [
      ...(requestedModel ? [requestedModel] : []),
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-2.5-flash'
    ].filter((v, idx, self) => self.indexOf(v) === idx);

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
          const geminiRes = await fetch(fetchUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(geminiReqBody),
            signal: AbortSignal.timeout(10000)
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
        if (seg.words && Array.isArray(seg.words)) {
          seg.words.forEach((w, wIdx) => {
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