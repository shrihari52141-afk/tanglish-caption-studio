const EMOJI_REGEX = /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}])/gu;

// Category mappings for word associations
const ASSOCIATIONS: Record<string, Record<string, string>> = {
  emotions: {
    happy: '🤩', positive: '🤩', great: '🤩', love: '🤩', super: '🤩', amazing: '🤩',
    mass: '🤩', sema: '🤩', awesome: '🤩', machi: '🤩', friend: '🤩', bro: '🤩',
    good: '🤩', nice: '🤩', badiya: '🤩', superb: '🤩', wow: '🤩',
    sad: '😭', cry: '😭', hurt: '😭', pain: '😭', bad: '😭', sorry: '😭', weep: '😭', upset: '😭',
    angry: '😡', mad: '😡', rage: '😡', hate: '😡', irritate: '😡', nonsense: '😡',
    shock: '😱', surprise: '😱', enna: '😱', kya: '😱', what: '😱', wait: '😱', oh: '😱', god: '😱',
    fun: '😂', laugh: '😂', haha: '😂', lol: '😂', comedy: '😂', joke: '😂',
    silent: '😐', quiet: '😐', boring: '😐', empty: '😐'
  },
  vibes: {
    happy: '✨', positive: '✨', great: '✨', love: '💖', super: '⚡', amazing: '✨',
    mass: '🔥', sema: '🔥', awesome: '⚡', machi: '🔥', friend: '✨', bro: '🔥',
    good: '✨', nice: '✨', badiya: '🔥', superb: '⚡', wow: '✨',
    sad: '🌧️', cry: '🌧️', hurt: '💥', pain: '💥', bad: '🌧️', sorry: '✨', weep: '🌧️', upset: '🌧️',
    angry: '🔥', mad: '🔥', rage: '🔥', hate: '🔥', irritate: '⚡', nonsense: '💥',
    shock: '⚡', surprise: '✨', enna: '⚡', kya: '⚡', what: '⚡', wait: '⚡', oh: '✨', god: '✨',
    fun: '⚡', laugh: '✨', haha: '⚡', lol: '⚡', comedy: '✨', joke: '✨',
    silent: '🌌', quiet: '🌌', boring: '🌌', empty: '🌌',
    // English / social captions (Whisper + translate_english)
    movie: '🎬', movies: '🎬', film: '🎬', watching: '👀', watch: '👀', video: '🎥',
    song: '🎵', music: '🎶', dance: '💃', party: '🎉', beautiful: '✨', cute: '🥰',
    cool: '😎', hot: '🔥', yes: '✅', no: '❌', money: '💰', food: '🍔', call: '📞',
    heart: '❤️', kiss: '😘', miss: '💔', thanks: '🙏', thank: '🙏', please: '🙏',
    fire: '🔥', best: '👑', win: '🏆', night: '🌙', morning: '☀️', home: '🏠'
  },
  objects: {
    happy: '🍔', positive: '🍔', great: '🍕', love: '🎁', super: '🚗', amazing: '🍕',
    mass: '🚗', sema: '🚗', awesome: '📱', machi: '🎧', friend: '🎧', bro: '🎧',
    good: '🍔', nice: '🍕', badiya: '🚗', superb: '📱', wow: '📱',
    sad: '💼', cry: '💼', hurt: '📦', pain: '📦', bad: '💼', sorry: '🎁', weep: '💼', upset: '💼',
    angry: '🚗', mad: '🚗', rage: '🚗', hate: '🚗', irritate: '📱', nonsense: '📦',
    shock: '📱', surprise: '🎁', enna: '📱', kya: '📱', what: '📱', wait: '📱', oh: '🎁', god: '🎁',
    fun: '🎮', laugh: '🎮', haha: '🎮', lol: '🎮', comedy: '🎬', joke: '🎬',
    silent: '📖', quiet: '📖', boring: '📖', empty: '📖'
  },
  energetic: {
    happy: '🥳', positive: '🦾', great: '🏆', love: '🥳', super: '🦾', amazing: '🏆',
    mass: '💥', sema: '💥', awesome: '🦾', machi: '🦁', friend: '🦾', bro: '🦁',
    good: '🦾', nice: '🦾', badiya: '💥', superb: '🏆', wow: '💥',
    sad: '💀', cry: '💀', hurt: '💥', pain: '💥', bad: '💀', sorry: '🦾', weep: '💀', upset: '💀',
    angry: '💥', mad: '💥', rage: '💥', hate: '💥', irritate: '🦾', nonsense: '💥',
    shock: '💥', surprise: '🏆', enna: '💥', kya: '💥', what: '💥', wait: '🦾', oh: '🏆', god: '🏆',
    fun: '🥳', laugh: '🥳', haha: '🥳', lol: '🥳', comedy: '🦁', joke: '🦁',
    silent: '🦖', quiet: '🦖', boring: '🦖', empty: '🦖'
  },
  minimal: {
    happy: '🍀', positive: '🍀', great: '🎯', love: '🧸', super: '🔮', amazing: '🎯',
    mass: '👾', sema: '👾', awesome: '🔮', machi: '🛸', friend: '🧸', bro: '🛸',
    good: '🍀', nice: '🍀', badiya: '👾', superb: '🎯', wow: '🔮',
    sad: '🧸', cry: '🧸', hurt: '🎯', pain: '🎯', bad: '🧸', sorry: '🧸', weep: '🧸', upset: '🧸',
    angry: '🎯', mad: '🎯', rage: '🎯', hate: '🎯', irritate: '🔮', nonsense: '🎯',
    shock: '🔮', surprise: '🧸', enna: '🔮', kya: '🔮', what: '🔮', wait: '🔮', oh: '🧸', god: '🧸',
    fun: '👾', laugh: '👾', haha: '👾', lol: '👾', comedy: '🛸', joke: '🛸',
    silent: '🍀', quiet: '🍀', boring: '🍀', empty: '🍀'
  },
  custom: {
    happy: '💖', positive: '💖', great: '🌈', love: '🦄', super: '💖', amazing: '🌈',
    mass: '🦄', sema: '🦄', awesome: '🎈', machi: '🌈', friend: '💖', bro: '💖',
    good: '💖', nice: '💖', badiya: '🦄', superb: '🌈', wow: '🎈',
    sad: '🍦', cry: '🍦', hurt: '🍭', pain: '🍭', bad: '🍦', sorry: '🦄', weep: '🍦', upset: '🍦',
    angry: '🍭', mad: '🍭', rage: '🍭', hate: '🍭', irritate: '🎈', nonsense: '🍭',
    shock: '🎈', surprise: '💖', enna: '🎈', kya: '🎈', what: '🎈', wait: '🎈', oh: '💖', god: '💖',
    fun: '🍭', laugh: '🍭', haha: '🍭', lol: '🍭', comedy: '🌈', joke: '🌈',
    silent: '🍦', quiet: '🍦', boring: '🍦', empty: '🍦'
  }
};

// Generic replacement fallbacks per category if the word has an emoji but is not key associated
const DEFAULT_FALLBACK_EMOJI: Record<string, string> = {
  none: '',
  emotions: '🤩',
  vibes: '🔥',
  objects: '🎬',
  energetic: '🦾',
  minimal: '👾',
  custom: '💖',
  auto: '🤖'
};

/**
 * Advanced caption formatting utility. Handles dynamic emoji stripping, custom category mapping,
 * and punctuation removal at runtime.
 */
/** Remove ASS/SSA override tags so they never appear as on-screen caption text */
export function stripASSTags(raw: string): string {
  if (!raw) return '';
  let s = String(raw);

  // Normalize double-escaped backslashes from JSON/logs (\\pos -> \pos)
  while (s.includes('\\\\')) {
    s = s.replace(/\\\\/g, '\\');
  }

  // Full override blocks: {\an2\pos(220,517)\c&HFFFFFF&\b1}
  s = s.replace(/\{[^{}]*\}/g, '');

  // Tags with parenthetical args: \pos(220,517) \move(...) \clip(...) \org(...)
  s = s.replace(/\\[a-zA-Z]+\d*\([^)]*\)/g, '');

  // Tags with trailing numbers: \an2 \b1 \fs48 \frz-15 \bord2 \shad1
  s = s.replace(/\\[a-zA-Z]+-?\d+/g, '');

  // Named tags without args: \rDefault \b \i \u \s \q
  s = s.replace(/\\[a-zA-Z]+/g, '');

  // Leftover color codes &HBBGGRR&
  s = s.replace(/&H[0-9A-Fa-f]{1,8}&?/gi, '');

  // Any remaining backslashes from broken tags
  s = s.replace(/\\/g, '');

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** True if text still looks like it contains ASS control codes */
export function containsASSTags(raw: string): boolean {
  if (!raw) return false;
  return /\\(?:an|pos|move|clip|org|frz|fsp|fscx|fscy|fs|bord|shad|alpha|c&H|1c|2c|3c|4c|rDefault|b\d|i\d)|\{[^}]*\\|(?:^|[^a-zA-Z])an\d*\\pos\s*\(/i.test(raw);
}

/** Sanitize a full words array (API / draft / edits) */
export function sanitizeCaptionWords<T extends { word: string }>(words: T[]): T[] {
  if (!Array.isArray(words)) return [];
  return words
    .map((w) => ({
      ...w,
      word: stripASSTags(w?.word ?? ''),
    }))
    .filter((w) => String(w.word).trim().length > 0);
}

export function applyCaptionFormatting(
  rawWord: string,
  showEmojis: boolean,
  showPunctuation: boolean,
  emojiStyle: 'none' | 'emotions' | 'vibes' | 'objects' | 'energetic' | 'minimal' | 'custom' | 'auto'
): string {
  if (!rawWord) return '';

  // Strip leaked ASS tags (e.g. 2\pos(220,517)) before any other formatting
  const cleanedRaw = stripASSTags(rawWord);
  if (!cleanedRaw) return '';

  // Extract any emoji from the word
  const matchedEmojis = cleanedRaw.match(EMOJI_REGEX) || [];
  const hadOriginalEmoji = matchedEmojis.length > 0;

  // Word without emoji
  let wordOnly = cleanedRaw.replace(EMOJI_REGEX, '').trim();

  // Strip punctuation if requested
  if (!showPunctuation) {
    // Strips commas, periods, exclamation marks, question marks, quotes, semi-colons, brackets, colons
    wordOnly = wordOnly.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, "").trim();
  }

  // Handle emoji injection or stripping
  if (!showEmojis || emojiStyle === 'none') {
    return wordOnly;
  }

  // If emojis are active, check if we need to style it
  let activeEmoji = '';

  // Check associations first (lowercase comparison for accuracy)
  const cleanWordLower = wordOnly.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, "").trim();
  const styleAssoc = ASSOCIATIONS[emojiStyle === 'auto' ? 'vibes' : emojiStyle];
  
  if (styleAssoc && styleAssoc[cleanWordLower]) {
    activeEmoji = styleAssoc[cleanWordLower];
  } else if (hadOriginalEmoji) {
    // Keep original emojis instead of forcing the generic theme icon!
    activeEmoji = matchedEmojis.join('');
  }

  if (activeEmoji) {
    return `${wordOnly} ${activeEmoji}`;
  }

  // If had original but no override, keep original
  if (hadOriginalEmoji) {
    return `${wordOnly} ${matchedEmojis.join('')}`;
  }

  return wordOnly;
}

export function generateCaptionFrames<T extends { id: string; word: string; is_question?: boolean; is_expression?: boolean; is_sentence_end?: boolean }>(
  wordsList: T[],
  maxWordsPerScreen: number = 0
): T[][] {
  if (!wordsList || wordsList.length === 0) return [];
  const frames: T[][] = [];
  let currentFrame: T[] = [];

  for (let i = 0; i < wordsList.length; i++) {
    const wordObj = wordsList[i];

    // RULE 1: Hot Word / Expression Override — isolate standalone reaction words
    if (wordObj.is_expression) {
      if (currentFrame.length > 0) {
        frames.push(currentFrame);
        currentFrame = [];
      }
      frames.push([wordObj]);
      continue;
    }

    // Add current word to frame
    currentFrame.push(wordObj);

    // RULE 2: Full Stop / Sentence End Override
    if (wordObj.is_sentence_end || wordObj.word.includes('.') || wordObj.word.includes('!') || wordObj.word.includes('?')) {
      frames.push(currentFrame);
      currentFrame = [];
      continue;
    }

    // RULE 3: Max Word Limit Fallback
    const effectiveLimit = maxWordsPerScreen > 0 ? maxWordsPerScreen : 6;
    if (currentFrame.length >= effectiveLimit) {
      frames.push(currentFrame);
      currentFrame = [];
    }
  }

  if (currentFrame.length > 0) {
    frames.push(currentFrame);
  }

  return frames;
}

/**
 * Count syllables in an English word (approximate, for timing purposes).
 * Each vowel group ≈ 1 syllable.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 1;
  const vowelGroups = w.match(/[aeiouy]+/g);
  return Math.max(1, (vowelGroups?.length || 1));
}

/**
 * Auto-Speedup Caption Algorithm for translation sync.
 */
export function calculateSpeedupTimestamps<T extends { word: string; is_expression?: boolean; is_question?: boolean; is_name?: boolean; is_sentence_end?: boolean; emoji?: string | null }>(
  translatedWords: T[],
  sourceStartMs: number,
  sourceEndMs: number
): (T & { start_ms: number; end_ms: number })[] {
  if (translatedWords.length === 0) return [];
  const totalWindowMs = sourceEndMs - sourceStartMs;
  if (totalWindowMs <= 0) {
    const step = 1;
    return translatedWords.map((item, i) => ({
      ...item,
      start_ms: sourceStartMs + i * step,
      end_ms: sourceStartMs + (i + 1) * step,
    }));
  }

  // Use SYLLABLE-WEIGHTED proportioning (not character count).
  const totalSyllables = translatedWords.reduce((sum, item) => sum + countSyllables(item.word), 1);
  const msPerSyllable = totalWindowMs / totalSyllables;

  let currentStartMs = sourceStartMs;

  return translatedWords.map((item, index) => {
    const wordSyllables = countSyllables(item.word);
    const wordDurationMs = Math.round(wordSyllables * msPerSyllable);

    const wordStart = currentStartMs;
    const wordEnd = index === translatedWords.length - 1
      ? sourceEndMs
      : wordStart + wordDurationMs;

    currentStartMs = wordEnd + 1; // 1ms offset between words

    return {
      ...item,
      start_ms: wordStart,
      end_ms: wordEnd,
    };
  });
}

/**
 * Continuous Piecewise Alignment Algorithm with Acoustic Guardrail
 * 
 * Re-anchors Gemini-refined timestamps to Deepgram Nova-3 ground truth without stripping metadata.
 */
export function continuousPiecewiseAlignment<T extends {
  word: string;
  start?: number;
  end?: number;
  start_ms?: number;
  end_ms?: number;
  start_time?: number;
  end_time?: number;
  highlight?: boolean;
  is_expression?: boolean;
  is_question?: boolean;
  is_name?: boolean;
  is_sentence_end?: boolean;
  emoji?: string | null;
  pause_after_ms?: number;
  emotion_tone?: string;
}>(
  geminiWords: T[],
  deepgramWords: Array<{ word?: string; start?: number; end?: number; start_ms?: number; end_ms?: number }>
): T[] {
  if (!geminiWords || !geminiWords.length) return [];

  // Helper to extract ms
  const getMs = (val: number | undefined, defaultVal: number): number => {
    if (typeof val !== 'number' || isNaN(val)) return defaultVal;
    return val < 100 && val > 0 ? val * 1000 : val; // Normalize seconds to ms if under 100s
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
      // Find closest STT word in acoustic timeline
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
