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
