// src/hooks/useWordSync.ts
// ═══════════════════════════════════════════════════════
//  requestAnimationFrame WORD SYNC WITH HOLD
//  Replaces: setInterval(() => index++, 500)  ← BROKEN
//  With:     RAF loop + getActiveIndex()      ← CORRECT
// ═══════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from "react";
import { Word, getActiveIndex } from "../lib/captionEngine";

export function useWordSync(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  romanTrack: Word[],
  englishTrack: Word[]
) {
  const [activeRomanIdx, setActiveRomanIdx] = useState(-1);
  const [activeEnglishIdx, setActiveEnglishIdx] = useState(-1);
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused && !audio.ended) {
      const nowMs = audio.currentTime * 1000;

      const rIdx = getActiveIndex(romanTrack, nowMs);
      const eIdx = getActiveIndex(englishTrack, nowMs);

      // Only update state if index changed (prevents re-render spam)
      setActiveRomanIdx((prev) => (prev !== rIdx ? rIdx : prev));
      setActiveEnglishIdx((prev) => (prev !== eIdx ? eIdx : prev));
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [audioRef, romanTrack, englishTrack]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  // Reset when track changes
  useEffect(() => {
    setActiveRomanIdx(-1);
    setActiveEnglishIdx(-1);
  }, [romanTrack, englishTrack]);

  return { activeRomanIdx, activeEnglishIdx };
}
