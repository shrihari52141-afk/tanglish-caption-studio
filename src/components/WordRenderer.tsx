// src/components/WordRenderer.tsx
// ═══════════════════════════════════════════════════════
//  DROP-IN WORD RENDERER
//  Usage:
//    <WordRenderer words={romanV11} activeIndex={activeRomanIdx} />
//    <WordRenderer words={englishV11} activeIndex={activeEnglishIdx} />
// ═══════════════════════════════════════════════════════

import React from "react";
import { Word } from "../lib/captionEngine";
import "../styles/wordHighlight.css";

interface WordRendererProps {
  words: Word[];
  activeIndex: number;
  className?: string;
}

export const WordRenderer: React.FC<WordRendererProps> = ({
  words,
  activeIndex,
  className = "",
}) => {
  return (
    <div className={`word-track ${className}`}>
      {words.map((w, i) => {
        const classes = [
          "word-token",
          i === activeIndex ? "active" : "",
          w.is_hotword ? "hotword" : "",
          w.is_name ? "name" : "",
          w.is_sentence_end ? "sentence-end" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <span key={i} className={classes}>
            {w.word}
            {w.is_sentence_end && w.emoji && (
              <span className="emoji-badge">{w.emoji}</span>
            )}
          </span>
        );
      })}
    </div>
  );
};

export default WordRenderer;
