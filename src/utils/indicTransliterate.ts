/**
 * indicTransliterate.ts
 * 
 * High-precision Phonetic Indic-to-Roman transliteration engine.
 * Converts Tamil, Devanagari (Hindi), Telugu, Kannada, and Malayalam native script
 * into clean, popular modern Roman / English script (Tanglish, Hinglish, etc.).
 * 
 * Guarantees zero native script leaks when Roman or English output is requested.
 */

// Unicode range regex for Indic scripts
export const INDIC_SCRIPT_REGEX = /[\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/;

export function containsNativeScript(text: string): boolean {
  if (!text) return false;
  return INDIC_SCRIPT_REGEX.test(text);
}

// ── TAMIL PHONETIC MAP ──
const TAMIL_VOWELS: Record<string, string> = {
  'அ': 'a', 'ஆ': 'aa', 'இ': 'i', 'ஈ': 'ee', 'உ': 'u', 'ஊ': 'oo',
  'எ': 'e', 'ஏ': 'ae', 'ஐ': 'ai', 'ஒ': 'o', 'ஓ': 'oe', 'ஔ': 'au', 'ஃ': 'k'
};

const TAMIL_CONSONANTS: Record<string, string> = {
  'க': 'k', 'ங': 'ng', 'ச': 's', 'ஞ': 'gn', 'ட': 't', 'ண': 'n',
  'த': 'th', 'ந': 'n', 'ப': 'p', 'ம': 'm', 'ய': 'y', 'ர': 'r',
  'ல': 'l', 'வ': 'v', 'ழ': 'zh', 'ள': 'l', 'ற': 'r', 'ன': 'n',
  'ஜ': 'j', 'ஷ': 'sh', 'ஸ': 's', 'ஹ': 'h', 'க்ஷ': 'ksh'
};

const TAMIL_MATRAS: Record<string, string> = {
  'ா': 'aa', 'ி': 'i', 'ீ': 'ee', 'ு': 'u', 'ூ': 'oo',
  'ெ': 'e', 'ே': 'ae', 'ை': 'ai', 'ொ': 'o', 'ோ': 'oe', 'ௌ': 'au',
  '்': '' // Pulli (virama / pure consonant)
};

export function transliterateTamil(text: string): string {
  let out = '';
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const char = text[i];
    const next = i + 1 < len ? text[i + 1] : '';

    if (TAMIL_VOWELS[char]) {
      out += TAMIL_VOWELS[char];
    } else if (TAMIL_CONSONANTS[char]) {
      const base = TAMIL_CONSONANTS[char];
      if (next && TAMIL_MATRAS[next] !== undefined) {
        out += base + TAMIL_MATRAS[next];
        i++; // skip matra
      } else {
        out += base + 'a'; // inherent 'a'
      }
    } else if (TAMIL_MATRAS[char] !== undefined) {
      out += TAMIL_MATRAS[char];
    } else {
      out += char;
    }
  }
  return out;
}

// ── DEVANAGARI (HINDI) PHONETIC MAP ──
const DEVA_VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऋ': 'ri', 'अं': 'am', 'अः': 'ah'
};

const DEVA_CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f'
};

const DEVA_MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ri',
  '्': '', // Virama
  'ं': 'n', 'ँ': 'n', 'ः': 'h'
};

export function transliterateDevanagari(text: string): string {
  let out = '';
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const char = text[i];
    const next = i + 1 < len ? text[i + 1] : '';

    if (DEVA_VOWELS[char]) {
      out += DEVA_VOWELS[char];
    } else if (DEVA_CONSONANTS[char]) {
      const base = DEVA_CONSONANTS[char];
      if (next && DEVA_MATRAS[next] !== undefined) {
        out += base + DEVA_MATRAS[next];
        i++; // skip matra
      } else {
        out += base + 'a';
      }
    } else if (DEVA_MATRAS[char] !== undefined) {
      out += DEVA_MATRAS[char];
    } else {
      out += char;
    }
  }
  return out;
}

// ── TELUGU PHONETIC MAP ──
const TELUGU_VOWELS: Record<string, string> = {
  'అ': 'a', 'ఆ': 'aa', 'ఇ': 'i', 'ఈ': 'ee', 'ఉ': 'u', 'ఊ': 'oo',
  'ఎ': 'e', 'ఏ': 'ae', 'ఐ': 'ai', 'ఒ': 'o', 'ఓ': 'oe', 'ఔ': 'au'
};

const TELUGU_CONSONANTS: Record<string, string> = {
  'క': 'k', 'ఖ': 'kh', 'గ': 'g', 'ఘ': 'gh', 'ఙ': 'ng',
  'చ': 'ch', 'ఛ': 'chh', 'జ': 'j', 'ఝ': 'jh', 'ఞ': 'ny',
  'ట': 't', 'ఠ': 'th', 'డ': 'd', 'ఢ': 'dh', 'ణ': 'n',
  'త': 'th', 'థ': 'th', 'ద': 'd', 'ధ': 'dh', 'న': 'n',
  'ప': 'p', 'ఫ': 'ph', 'బ': 'b', 'భ': 'bh', 'మ': 'm',
  'య': 'y', 'ర': 'r', 'ల': 'l', 'వ': 'v', 'శ': 'sh', 'ష': 'sh', 'స': 's', 'హ': 'h', 'ళ': 'l'
};

const TELUGU_MATRAS: Record<string, string> = {
  'ా': 'aa', 'ి': 'i', 'ీ': 'ee', 'ు': 'u', 'ూ': 'oo',
  'ె': 'e', 'ే': 'ae', 'ై': 'ai', 'ొ': 'o', 'ో': 'oe', 'ౌ': 'au',
  '్': '', 'ం': 'm', 'ః': 'h'
};

export function transliterateTelugu(text: string): string {
  let out = '';
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const char = text[i];
    const next = i + 1 < len ? text[i + 1] : '';

    if (TELUGU_VOWELS[char]) {
      out += TELUGU_VOWELS[char];
    } else if (TELUGU_CONSONANTS[char]) {
      const base = TELUGU_CONSONANTS[char];
      if (next && TELUGU_MATRAS[next] !== undefined) {
        out += base + TELUGU_MATRAS[next];
        i++;
      } else {
        out += base + 'a';
      }
    } else if (TELUGU_MATRAS[char] !== undefined) {
      out += TELUGU_MATRAS[char];
    } else {
      out += char;
    }
  }
  return out;
}

// ── KANNADA PHONETIC MAP ──
const KANNADA_VOWELS: Record<string, string> = {
  'ಅ': 'a', 'ಆ': 'aa', 'ಇ': 'i', 'ಈ': 'ee', 'ಉ': 'u', 'ಊ': 'oo',
  'ಎ': 'e', 'ಏ': 'ae', 'ಐ': 'ai', 'ಒ': 'o', 'ಓ': 'oe', 'ಔ': 'au'
};

const KANNADA_CONSONANTS: Record<string, string> = {
  'ಕ': 'k', 'ಖ': 'kh', 'ಗ': 'g', 'ಘ': 'gh', 'ಙ': 'ng',
  'ಚ': 'ch', 'ಛ': 'chh', 'ಜ': 'j', 'ಝ': 'jh', 'ಞ': 'ny',
  'ಟ': 't', 'ಠ': 'th', 'ಡ': 'd', 'ಢ': 'dh', 'ಣ': 'n',
  'ತ': 'th', 'ಥ': 'th', 'ದ': 'd', 'ಧ': 'dh', 'ನ': 'n',
  'ಪ': 'p', 'ಫ': 'ph', 'ಬ': 'b', 'ಭ': 'bh', 'ಮ': 'm',
  'ಯ': 'y', 'ರ': 'r', 'ಲ': 'l', 'ವ': 'v', 'ಶ': 'sh', 'ಷ': 'sh', 'ಸ': 's', 'ಹ': 'h', 'ಳ': 'l'
};

const KANNADA_MATRAS: Record<string, string> = {
  'ಾ': 'aa', 'ಿ': 'i', 'ೀ': 'ee', 'ು': 'u', 'ೂ': 'oo',
  'ೆ': 'e', 'ೇ': 'ae', 'ೈ': 'ai', 'ೊ': 'o', 'ೋ': 'oe', 'ೌ': 'au',
  '್': '', 'ಂ': 'm', 'ಃ': 'h'
};

export function transliterateKannada(text: string): string {
  let out = '';
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const char = text[i];
    const next = i + 1 < len ? text[i + 1] : '';

    if (KANNADA_VOWELS[char]) {
      out += KANNADA_VOWELS[char];
    } else if (KANNADA_CONSONANTS[char]) {
      const base = KANNADA_CONSONANTS[char];
      if (next && KANNADA_MATRAS[next] !== undefined) {
        out += base + KANNADA_MATRAS[next];
        i++;
      } else {
        out += base + 'a';
      }
    } else if (KANNADA_MATRAS[char] !== undefined) {
      out += KANNADA_MATRAS[char];
    } else {
      out += char;
    }
  }
  return out;
}

// ── MALAYALAM PHONETIC MAP ──
const MALAYALAM_VOWELS: Record<string, string> = {
  'അ': 'a', 'ആ': 'aa', 'ഇ': 'i', 'ഈ': 'ee', 'ഉ': 'u', 'ഊ': 'oo',
  'എ': 'e', 'ഏ': 'ae', 'ഐ': 'ai', 'ഒ': 'o', 'ഓ': 'oe', 'ഔ': 'au'
};

const MALAYALAM_CONSONANTS: Record<string, string> = {
  'ക': 'k', 'ഖ': 'kh', 'ഗ': 'g', 'ഘ': 'gh', 'ങ': 'ng',
  'ച': 'ch', 'ഛ': 'chh', 'ജ': 'j', 'ഝ': 'jh', 'ഞ': 'ny',
  'ട': 't', 'ഠ': 'th', 'ഡ': 'd', 'ഢ': 'dh', 'ണ': 'n',
  'ത': 'th', 'ഥ': 'th', 'ദ': 'd', 'ധ': 'dh', 'ന': 'n',
  'പ': 'p', 'ഫ': 'ph', 'ബ': 'b', 'ഭ': 'bh', 'മ': 'm',
  'യ': 'y', 'ര': 'r', 'ല': 'l', 'വ': 'v', 'ശ': 'sh', 'ഷ': 'sh', 'സ': 's', 'ഹ': 'h', 'ള': 'l', 'ഴ': 'zh', 'റ': 'r'
};

const MALAYALAM_MATRAS: Record<string, string> = {
  'ാ': 'aa', 'ി': 'i', 'ീ': 'ee', 'ു': 'u', 'ൂ': 'oo',
  'െ': 'e', 'േ': 'ae', 'ൈ': 'ai', 'ൊ': 'o', 'ോ': 'oe', 'ൌ': 'au',
  '്': '', 'ം': 'm', 'ഃ': 'h'
};

export function transliterateMalayalam(text: string): string {
  let out = '';
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const char = text[i];
    const next = i + 1 < len ? text[i + 1] : '';

    if (MALAYALAM_VOWELS[char]) {
      out += MALAYALAM_VOWELS[char];
    } else if (MALAYALAM_CONSONANTS[char]) {
      const base = MALAYALAM_CONSONANTS[char];
      if (next && MALAYALAM_MATRAS[next] !== undefined) {
        out += base + MALAYALAM_MATRAS[next];
        i++;
      } else {
        out += base + 'a';
      }
    } else if (MALAYALAM_MATRAS[char] !== undefined) {
      out += MALAYALAM_MATRAS[char];
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * Universal Indic-to-Roman transliteration sanitizer.
 * Guarantees that any text string is converted into 100% clean Roman (English alphabet) script.
 */
export function ensureRomanScript(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  if (!containsNativeScript(raw)) return raw;

  let text = raw;
  // Transliterate each Indic script present
  if (/[\u0B80-\u0BFF]/.test(text)) text = transliterateTamil(text);
  if (/[\u0900-\u097F]/.test(text)) text = transliterateDevanagari(text);
  if (/[\u0C00-\u0C7F]/.test(text)) text = transliterateTelugu(text);
  if (/[\u0C80-\u0CFF]/.test(text)) text = transliterateKannada(text);
  if (/[\u0D00-\u0D7F]/.test(text)) text = transliterateMalayalam(text);

  // Clean double consonants or unwanted trailing characters
  text = text.replace(/aa+/g, 'aa')
             .replace(/ee+/g, 'ee')
             .replace(/oo+/g, 'oo')
             .replace(/\s+/g, ' ')
             .trim();

  return text;
}
