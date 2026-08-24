export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get('audio') || formData.get('file');
    const language = formData.get('language') || 'auto';
    const translationMode = formData.get('translationMode') || 'transliterate';
    const useEmojis = formData.get('useEmojis') === 'true';
    const usePunctuation = formData.get('usePunctuation') === 'true';
    const emojiStyle = formData.get('emojiStyle') || 'auto';
    const enableHotwords = formData.get('enableHotwords') === 'true';

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
    const promptBody = buildPrompt(translationMode, language, useEmojis, usePunctuation, dgWords, emojiStyle, enableHotwords);

    let geminiWords;
    try {
      geminiWords = await callGemini(base64Audio, mimeType, promptBody, geminiKeys);
    } catch (geminiErr) {
      // Fallback to Deepgram-only transcription
      return new Response(
        JSON.stringify({
          error: 'Gemini refinement failed, falling back to Deepgram transcription',
          transcript: dgWords.map(w => w.word).join(' '),
          words: dgWords.map((w) => ({
            word: w.word,
            start: Math.round(w.start * 1000),
            end: Math.round(w.end * 1000),
            highlight: false,
            emoji: '',
            is_hotword: false,
          })),
          fallback: true,
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

    // Build transcript for backward compatibility
    const transcript = words.map(w => w.word).join(' ');

    return new Response(
      JSON.stringify({
        transcript,
        words,
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

const LANGUAGE_MAP = {
  auto: '', tamil: 'ta', hindi: 'hi', english: 'en', kannada: 'kn', telugu: 'te',
  malayalam: 'ml', bengali: 'bn', marathi: 'mr', gujarati: 'gu', punjabi: 'pa',
  odia: 'or', assamese: 'as', urdu: 'ur', sanskrit: 'sa', korean: 'ko',
  japanese: 'ja', chinese: 'zh', cantonese: 'yue', spanish: 'es', french: 'fr',
  german: 'de', portuguese: 'pt', italian: 'it', russian: 'ru', arabic: 'ar',
  turkish: 'tr', thai: 'th', vietnamese: 'vi',
};

async function callDeepgram(audioBuffer, language, apiKey) {
  const dgLang = LANGUAGE_MAP[language] || language;
  const dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true${dgLang ? `&language=${encodeURIComponent(dgLang)}` : ''}`;
  
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

function buildPrompt(translationMode, language, useEmojis, usePunctuation, dgWords, emojiStyle, enableHotwords) {
  // Determine the target script/translation instruction
  let scriptInstruction = '';
  const isAutoDetect = language === 'auto';
  
  if (translationMode === 'auto_roman') {
    // AUTO-DETECT LANGUAGE + ROMANIZE
    scriptInstruction = isAutoDetect 
      ? `AUTO-DETECT the spoken language from the audio. Then transcribe it in ROMANIZED phonetic script using English letters (e.g., Tamil → Tanglish, Hindi → Hinglish, Telugu → Teluglish, Kannada → Kannadish, Malayalam → Manglish, Bengali → Benglish, Marathi → Maralish, Gujarati → Gujlish, Punjabi → Punlish). Do NOT translate - only romanize the detected language. Preserve mixed English words, slang, and code-switching naturally.`
      : `The spoken language is ${language}. Transcribe it in ROMANIZED phonetic script using English letters (e.g., Tamil → Tanglish, Hindi → Hinglish). Preserve mixed English words, slang, and code-switching naturally.`;
  } else if (translationMode === 'transliterate') {
    // SPECIFIED LANGUAGE → ROMAN SCRIPT
    scriptInstruction = `The spoken language is ${language}. Transcribe it in ROMANIZED phonetic script using English letters (e.g., Tamil → Tanglish, Hindi → Hinglish). Preserve mixed English words, slang, and code-switching naturally.`;
  } else if (translationMode === 'keep_script' || translationMode === 'native') {
    // KEEP NATIVE SCRIPT
    scriptInstruction = `Transcribe the spoken words in their NATIVE SCRIPT (${language}). Do NOT transliterate or translate. Preserve the original script exactly as spoken.`;
  } else if (translationMode.startsWith('translate_')) {
    // TRANSLATE TO TARGET LANGUAGE
    const targetLang = translationMode.replace('translate_', '');
    const targetLangMap = {
      english: 'ENGLISH', tamil: 'TAMIL (Tamil script)', hindi: 'HINDI (Devanagari)',
      kannada: 'KANNADA (Kannada script)', telugu: 'TELUGU (Telugu script)',
      malayalam: 'MALAYALAM (Malayalam script)', spanish: 'SPANISH',
      french: 'FRENCH', german: 'GERMAN', portuguese: 'PORTUGUESE',
      italian: 'ITALIAN', russian: 'RUSSIAN (Cyrillic)', arabic: 'ARABIC (Arabic script)',
      japanese: 'JAPANESE (Japanese script)', korean: 'KOREAN (Hangul)',
      chinese: 'CHINESE (Simplified Chinese)'
    };
    const target = targetLangMap[targetLang] || targetLang.toUpperCase();
    scriptInstruction = isAutoDetect
      ? `AUTO-DETECT the spoken language from the audio, then TRANSLATE the meaning accurately into ${target}.`
      : `The spoken language is ${language}. TRANSLATE the meaning accurately into ${target}.`;
  } else {
    // DEFAULT: transliterate
    scriptInstruction = `Transcribe the spoken words in ROMANIZED phonetic script using English letters (Tanglish/Hinglish style). Preserve mixed English words, slang, and code-switching.`;
  }

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

  if (enableHotwords) {
    extraInstructions += `\n- HOT WORDS: Identify high-impact, accented, or emphasized words (slang, exclamations, brand names, emotional peaks). Set "is_hotword": true for these. They will be displayed as SINGLE HIGHLIGHTED WORDS on screen.`;
  }

  // Enhanced expression and question detection
  extraInstructions += `
- QUESTION DETECTION: If a word/phrase ends with a question tone or "?" punctuation, set "is_question": true. These should be displayed as SINGLE words (e.g., "madbeka?", "can I book?", "why?").
- EXPRESSION DETECTION (set "is_expression": true and "is_hotword": true for these):
  * ANGRY/COMMAND: "shut up", "go away", "stop it", "leave me", "get lost", "shut", "up"
  * WONDER/SURPRISE: "oh god", "oh my god", "wow", "omg", "what", "really", "seriously"
  * EMOTIONAL EXCLAMATIONS: "ayyo", "aiyo", "amma", "appa", "oh no", "oh wow", "damn", "shit"
  * GREETINGS/ADDRESS: "hello", "hi", "hey", "namaste", "vanakkam", "salam"
- NAME DETECTION: Identify proper names (first + last name as single unit). Set "is_hotword": true and "highlight": true. Examples: "John Smith", "Raj Kumar", "Ani Cabs", "Bengaluru".
- SENTENCE END DETECTION: If word has ".", "!", "?" set "is_sentence_end": true. These break caption frames.
- EMOJI MATCHING: Match emoji to CONTEXT not just word:
  * Questions → ❓🤔💭
  * Angry → 😡😤💢
  * Wonder → 😲😮🤯
  * Happy → 😊😄😍
  * Sad → 😢😭💔
  * Greetings → 🙏👋🤝
  * Exclamations → 😱😮💥
`;

  // Language-specific enhancements for Indian languages
  const langSpecificInstructions = getLanguageSpecificInstructions(language, translationMode);
  if (langSpecificInstructions) {
    extraInstructions += `\n${langSpecificInstructions}`;
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
1. Target Script: ${scriptInstruction}
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
- "is_hotword" (boolean): true for high-impact/accented words (single-word display)
- "is_question" (boolean): true for interrogatives
- "is_expression" (boolean): true for standalone exclamations/reactions/queries
- "is_sentence_end" (boolean): true for sentence-ending punctuation
- "is_name" (boolean): true for proper nouns/brand names/person names

Example: [{"word": "vanakkam", "start": 800, "end": 1450, "highlight": true, "emoji": "🙏", "is_hotword": true, "is_expression": true, "is_question": false, "is_sentence_end": false, "is_name": false}, {"word": "epdi", "start": 1500, "end": 1900, "highlight": false, "emoji": "", "is_hotword": false, "is_expression": false, "is_question": true, "is_sentence_end": true, "is_name": false}]`;
}

function getLanguageSpecificInstructions(language, translationMode) {
  const isRomanScript = translationMode === 'transliterate' || translationMode === 'auto_roman';
  const isTranslation = translationMode.startsWith('translate_');
  
  // For auto-detect, we can't give language-specific instructions upfront
  // But we can give general guidance for Indian language scenarios
  if (language === 'auto') {
    if (isRomanScript) {
      return `- MULTILINGUAL CODE-SWITCHING: The audio may mix English with Indian languages (Tamil, Hindi, Telugu, etc.). Detect each segment's language and romanize appropriately (Tanglish, Hinglish, Teluglish, etc.). Preserve English words as-is.`;
    }
    if (isTranslation) {
      return `- MULTILINGUAL TRANSLATION: The audio may contain multiple languages. Detect each segment and translate to the target language.`;
    }
    return '';
  }

  // Language-specific instructions for known languages
  const instructions = {
    tamil: isRomanScript ? 
      `- TAMIL → TANGLISH: Romanize Tamil phonetically. Common patterns: "பொறம்போக்கு"→"poramboku", "சம்மா"→"summa", "மாசன்"→"maasan", "வேற லெவல்"→"vera level". Keep English words (college, office, traffic) as-is. Handle "kadhal", "machi", "da", "machi" naturally.` :
      `- TAMIL SCRIPT: Use proper Tamil script (தமிழ்). Keep English loanwords in English.`,
    
    hindi: isRomanScript ?
      `- HINDI → HINGLISH: Romanize Hindi phonetically. Common: "क्या"→"kya", "है"→"hai", "नहीं"→"nahi", "बहुत"→"bahut". Keep English words (job, college, metro) as-is. Handle slang: "bhaiya", "yaar", "jugaad", "chalta hai" naturally.` :
      `- HINDI (DEVANAGARI): Use proper Devanagari script. Keep English loanwords in English.`,
    
    telugu: isRomanScript ?
      `- TELUGU → TELUGLISH: Romanize Telugu phonetically. Common: "ఎలా"→"ela", "చేస్తున్నావ్"→"chestunav". Keep English words as-is. Slang: "ra", "abbo", "aitho" naturally.` :
      `- TELUGU SCRIPT: Use proper Telugu script.`,
    
    kannada: isRomanScript ?
      `- KANNADA → KANNADISH: Romanize Kannada phonetically. Common: "ಹೇಗೆ"→"hege", "ಮಾಡುತ್ತೀಯ"→"maaduttija". Keep English words. Slang: "maga", "anna", "boss" naturally.` :
      `- KANNADA SCRIPT: Use proper Kannada script.`,
    
    malayalam: isRomanScript ?
      `- MALAYALAM → MANGLISH: Romanize Malayalam phonetically. Common: "എങ്ങനെ"→"engane", "ചെയ്യുന്നുണ്ട്"→"cheyyunnundu". Keep English words. Slang: "mone", "poda", "edi" naturally.` :
      `- MALAYALAM SCRIPT: Use proper Malayalam script.`,
    
    bengali: isRomanScript ?
      `- BENGALI → BENGLISH: Romanize Bengali phonetically. Common: "কেমন"→"kemon", "আছিস"→"achis". Keep English words.` :
      `- BENGALI SCRIPT: Use proper Bengali script.`,
    
    marathi: isRomanScript ?
      `- MARATHI → MARALISH: Romanize Marathi phonetically. Common: "कसे"→"kase", "आहे"→"ahe". Keep English words.` :
      `- MARATHI SCRIPT: Use proper Marathi script.`,
    
    gujarati: isRomanScript ?
      `- GUJARATI → GUJLISH: Romanize Gujarati phonetically. Common: "કેમ"→"kem", "છે"→"che". Keep English words.` :
      `- GUJARATI SCRIPT: Use proper Gujarati script.`,
    
    punjabi: isRomanScript ?
      `- PUNJABI → PUNLISH: Romanize Punjabi phonetically. Common: "ਕਿਵੇਂ"→"kiven", "ਹੈ"→"hai". Keep English words. Slang: "balle balle", "oye" naturally.` :
      `- PUNJABI SCRIPT: Use proper Gurmukhi script.`,
  };
  
  return instructions[language] || '';
}

async function callGemini(base64Audio, mimeType, promptBody, geminiKeys) {
  const models = [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];
  const shuffledKeys = [...geminiKeys].sort(() => Math.random() - 0.5);
  let lastError;

  for (const model of models) {
    const keysToTry = shuffledKeys.slice(0, 3);
    for (const key of keysToTry) {
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
                  is_question: { type: 'BOOLEAN' },
                  is_expression: { type: 'BOOLEAN' },
                  is_sentence_end: { type: 'BOOLEAN' },
                  is_name: { type: 'BOOLEAN' },
                },
                required: ['word', 'start', 'end'],
              },
            },
          },
        };

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-goog-api-key': key
            },
            body: JSON.stringify(geminiReqBody),
            signal: AbortSignal.timeout(15000),
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