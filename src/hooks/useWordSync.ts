// src/hooks/useWordSync.ts — requestAnimationFrame word highlight with HOLD
import { useEffect, useRef, useState } from "react";
import { Word, getActiveIndex } from "../lib/qwenEngine";

export function useWordSync(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  romanTrack: Word[],
  englishTrack: Word[]
) {
  const [activeRomanIdx, setActiveRomanIdx] = useState(-1);
  const [activeEnglishIdx, setActiveEnglishIdx] = useState(-1);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        const nowMs = audio.currentTime * 1000;
        setActiveRomanIdx(getActiveIndex(romanTrack, nowMs));
        setActiveEnglishIdx(getActiveIndex(englishTrack, nowMs));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioRef, romanTrack, englishTrack]);

  return { activeRomanIdx, activeEnglishIdx };
}
