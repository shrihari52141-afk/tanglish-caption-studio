const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F191}-\u{1F251}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{3030}]|[\u{2B50}]|[\u{2B55}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2194}-\u{2199}]|[\u{21A9}-\u{21AA}]|[\u{3297}]|[\u{3299}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]|[\u{1F300}-\u{1F5FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]/gu;

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
  if (wordsList.length === 0) return [];
  const frames: T[][] = [];
  let currentFrame: T[] = [];

  for (let i = 0; i < wordsList.length; i++) {
    const wordObj = wordsList[i];

    // RULE 1: Hot Word / Expression Override
    if (wordObj.is_expression) {
      if (currentFrame.length > 0) {
        frames.push(currentFrame);
        currentFrame = [];
      }
      frames.push([wordObj]);
      continue;
    }

    // RULE 2: Question Override
    if (wordObj.is_question) {
      if (currentFrame.length > 0) {
        frames.push(currentFrame);
        currentFrame = [];
      }
      frames.push([wordObj]);
      continue;
    }

    // Add current word to frame
    currentFrame.push(wordObj);

    // RULE 3: Full Stop / Sentence End Override
    if (wordObj.is_sentence_end || wordObj.word.includes('.') || wordObj.word.includes('!') || wordObj.word.includes('?')) {
      frames.push(currentFrame);
      currentFrame = [];
      continue;
    }

    // RULE 4: Max Word Limit Fallback
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
 * Auto-Speedup Caption Algorithm for translation sync.
 *
 * When translating between languages, syllable count and word lengths change,
 * but the speaker's video time window never changes. If Kanglish speech lasts
 * 1.2s, the English translation highlights MUST complete in exactly 1.2s.
 *
 * This function takes translated words and forces their timestamps into the
 * source audio's exact millisecond bounds using character-weighted proportioning.
 *
 * @param translatedWords - Array of words with at least { word: string }
 * @param sourceStartMs   - Start of the source audio segment in ms
 * @param sourceEndMs     - End of the source audio segment in ms
 * @returns Array of words with start_ms and end_ms compressed to fit the window
 */
export function calculateSpeedupTimestamps<T extends { word: string; is_expression?: boolean; is_question?: boolean; is_name?: boolean; is_sentence_end?: boolean; emoji?: string | null }>(
  translatedWords: T[],
  sourceStartMs: number,
  sourceEndMs: number
): (T & { start_ms: number; end_ms: number })[] {
  if (translatedWords.length === 0) return [];
  const totalWindowMs = sourceEndMs - sourceStartMs;
  if (totalWindowMs <= 0) {
    // Degenerate: distribute evenly
    const step = 1;
    return translatedWords.map((item, i) => ({
      ...item,
      start_ms: sourceStartMs + i * step,
      end_ms: sourceStartMs + (i + 1) * step,
    }));
  }

  // Total character count (excluding spaces and punctuation for weighting)
  const totalChars = translatedWords.reduce((sum, item) => {
    const clean = item.word.replace(/[\s.,!?;:'"()]/g, '');
    return sum + (clean.length || 1);
  }, 0);

  let currentStartMs = sourceStartMs;

  return translatedWords.map((item, index) => {
    const clean = item.word.replace(/[\s.,!?;:'"()]/g, '');
    const wordCharWeight = (clean.length || 1) / totalChars;
    const wordDurationMs = Math.round(totalWindowMs * wordCharWeight);

    const wordStart = currentStartMs;
    // Last word snaps strictly to sourceEndMs to prevent floating-point rounding gaps
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
