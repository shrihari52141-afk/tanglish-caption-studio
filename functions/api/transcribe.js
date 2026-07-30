export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    const requestedDgKey = formData.get('deepgramApiKey');
    const requestedGeminiKeys = formData.get('geminiApiKey');
    const geminiModel = formData.get('geminiModel') || formData.get('model') || 'gemini-2.5-flash';
    const scriptMode = formData.get('scriptMode') || formData.get('translationMode') || 'native';
    const spokenLang = formData.get('spokenLang') || formData.get('language') || 'en';

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

    // 1. Pass 1: Enhanced Deepgram Nova-3 API Call (Exact requested endpoint & params)
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

    // Fallback if language parameter was rejected by Deepgram
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

    // 3. Script Target Instruction (Exact as requested)
    const scriptPromptMap = {
      native: `transcribe the spoken words with full punctuation in the NATIVE SCRIPT of language code '${spokenLang}' (e.g. தமிழ், ಕನ್ನಡ, हिंदी).`,
      tanglish: `transcribe the spoken words with full punctuation in ROMANIZED / TANGLISH phonetic script using English letters (e.g. "Maanu", "Thappa", "Nee sari kadaiyathu", "madbeka?").`,
      english: `translate the audio accurately into ENGLISH words with full punctuation.`
    };
    const targetScriptInstruction = scriptPromptMap[scriptMode] || scriptPromptMap.tanglish || scriptPromptMap.native;

    // 4. Exact Gemini System Prompt as requested
    const systemPrompt = `You are an ultra-precise audio transcription, translation, multilingual slang recognition, and auto-speedup subtitle alignment engine.

Your primary objective is ZERO-LAG LIP SYNC, EXACT SEMANTIC BREAKING, and PRECISE MULTILINGUAL PRONUNCIATION. The total duration of any translated or transcribed caption MUST strictly equal the acoustic speech duration of the source audio segment.

INPUT DATA:
1. Audio file.
2. Pass 1 baseline word timestamps: ${JSON.stringify(roughWords)}

=== 1. SPEECH DURATION & TIMING LOCK ===
- Detect exact acoustic start (\`start_ms\`) and acoustic end (\`end_ms\`) of each spoken source phrase.
- NEVER stretch timestamps to fill silent audio gaps, pauses, or breath breaks.
- When speech stops, end timestamps immediately.

=== 2. MULTILINGUAL SLANG & ACCURATE PUNCTUATION ===
- Intelligently recognize local slang, code-switching, Tanglish/Kanglish/Hinglish interjections, and colloquial expressions.
- Correct misspelled or mistranscribed words from Pass 1 baseline while preserving exact vocal timing.
- Add accurate punctuation (\`.\`, \`?\`, \`!\`, \`,\`) to every word based on speaker tone, cadence, and pause markers.

=== 3. CAPTION TRANSLATION & AUTO-SPEEDUP ===
- Script Target: ${targetScriptInstruction}
- Translate speech accurately into the target language while strictly locking translated phrases inside the source phrase's acoustic window (\`source_start_ms\` to \`source_end_ms\`).
- AUTO-SPEEDUP: If target language translation contains more words/syllables than original speech, compress target word durations proportionally by letter count so that the last word finishes EXACTLY at \`source_end_ms\`.
- Do NOT expand time bounds beyond when the speaker finishes talking.

=== 4. SEMANTIC BREAKING & HOT-WORD OVERRIDES ===
Analyze tone and vocal expressions continuously every second. Tag special words so the frontend caption render engine can override chunking limits (e.g., 5 or 7 word display limits) and display them independently:
- \`is_expression\`: Set TRUE ONLY for sudden vocal interjections, emotional reactions, or tone shifts (e.g., "Ayyo!", "Ahaa!", "Shut up", "Oh god", "Aiyo", "Wow!").
- \`is_question\`: Set TRUE for standalone interrogatives or questions (e.g., "madbeka?", "Hassan?", "book?", "can I book?").
- \`is_name\`: Set TRUE for proper nouns, brand names, or people names (e.g., "Zara", "Shrihari", "Ani Cabs", "Bengaluru").
- \`is_sentence_end\`: Set TRUE when a word ends with a full stop (\`.\`), exclamation mark (\`!\`), or question mark (\`?\`).
- \`highlight\`: Set TRUE if the word is a name, exclamation, or key emotional hot-word.

=== 5. SMART EMOJI MATCHING ===
- Include 1 perfectly matching, contextually relevant emoji per segment matching the exact tone or main noun (e.g., "😟", "😱", "🚕", "🔥").

Return ONLY valid JSON adhering strictly to the provided JSON Schema.`;

    // 5. Exact Gemini Request Payload JSON Schema (Valid JSON syntax)
    const geminiReqBody = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: file.type || "audio/mp3",
                data: base64Audio
              }
            },
            {
              text: systemPrompt
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "source_language": { "type": "STRING" },
            "target_language": { "type": "STRING" },
            "segments": {
              "type": "ARRAY",
              "items": {
                "type": "OBJECT",
                "properties": {
                  "segment_id": { "type": "INTEGER" },
                  "source_text": { "type": "STRING" },
                  "translated_text": { "type": "STRING" },
                  "emoji": { "type": "STRING" },
                  "speech_window_ms": {
                    "type": "OBJECT",
                    "properties": {
                      "start_ms": { "type": "INTEGER" },
                      "end_ms": { "type": "INTEGER" },
                      "total_duration_ms": { "type": "INTEGER" }
                    },
                    "required": ["start_ms", "end_ms", "total_duration_ms"]
                  },
                  "auto_speedup_ratio": { "type": "NUMBER" },
                  "words": {
                    "type": "ARRAY",
                    "items": {
                      "type": "OBJECT",
                      "properties": {
                        "word": { "type": "STRING" },
                        "start_ms": { "type": "INTEGER" },
                        "end_ms": { "type": "INTEGER" },
                        "highlight": { "type": "BOOLEAN" },
                        "is_expression": { "type": "BOOLEAN" },
                        "is_question": { "type": "BOOLEAN" },
                        "is_name": { "type": "BOOLEAN" },
                        "is_sentence_end": { "type": "BOOLEAN" }
                      },
                      "required": [
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
                "required": ["segment_id", "source_text", "translated_text", "emoji", "speech_window_ms", "words"]
              }
            }
          },
          required: ["source_language", "target_language", "segments"]
        }
      }
    };

    // 6. Failover Execution over Gemini API Keys
    const shuffledKeys = [...geminiKeys].sort(() => Math.random() - 0.5);
    const modelsToTry = [geminiModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
      .filter((v, idx, self) => self.indexOf(v) === idx && !v.includes('3.6') && !v.includes('3.5'));

    let rawGeminiResult = null;
    let lastErr = null;
    let usedModel = 'gemini-2.5-flash';

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
          seg.words.forEach((w) => {
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
              emoji: segEmoji
            });
          });
        }
      });
    }

    if (extractedWords.length === 0) {
      // Fallback to Deepgram Nova-3 acoustic baseline words
      extractedWords = roughWords.map(w => ({
        word: w.word,
        start: w.start,
        end: w.end,
        start_ms: w.start,
        end_ms: w.end,
        highlight: false,
        is_expression: false,
        is_question: false,
        is_name: false,
        is_sentence_end: false,
        emoji: ''
      }));
    }

    // 8. Continuous Piecewise Alignment Guardrail
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

// Continuous Piecewise Alignment Algorithm
function continuousPiecewiseAlignment(words, roughWords) {
  if (!words || !words.length) return [];

  return words.map((w, idx) => {
    let start = w.start || w.start_ms;
    let end = w.end || w.end_ms;

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
      highlight: !!w.highlight,
      is_expression: !!w.is_expression,
      is_question: !!w.is_question,
      is_name: !!w.is_name,
      is_sentence_end: !!w.is_sentence_end,
      emoji: w.emoji || ''
    };
  });
}