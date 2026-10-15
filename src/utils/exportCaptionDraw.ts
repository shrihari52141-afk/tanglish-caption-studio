/**
 * exportCaptionDraw.ts
 * Canvas caption renderer for video export — mirrors the on-screen
 * VideoPlayer caption overlay (chunked frames, active-word highlight)
 * so the exported video matches the editor preview.
 */

import { CaptionWord, SubtitleStyleSettings } from '../types';
import {
  generateCaptionFrames,
  applyCaptionFormatting,
  stripASSTags,
} from './captionFormatter';

function formatWordText(word: CaptionWord, s: SubtitleStyleSettings): string {
  let formatted = applyCaptionFormatting(
    stripASSTags(word.word || ''),
    s.showEmojis !== false,
    s.showPunctuation !== false,
    s.emojiStyle || 'vibes'
  );
  if (word.emoji && s.showEmojis !== false && !formatted.includes(word.emoji)) {
    formatted = `${formatted} ${word.emoji}`;
  }
  if (s.capitalization === 'all') return formatted.toUpperCase();
  if (s.capitalization === 'lower') return formatted.toLowerCase();
  if (s.capitalization === 'sentence') {
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
  return formatted;
}

function fontStackFor(s: SubtitleStyleSettings): string {
  switch (s.fontFamily) {
    case 'Impact':
      return 'Impact, "Noto Sans Tamil", sans-serif';
    case 'Courier':
      return '"Courier New", Courier, "Noto Sans Tamil", monospace';
    case 'Fredoka':
      return 'Fredoka, Inter, "Noto Sans Tamil", sans-serif';
    case 'Space Grotesk':
      return '"Space Grotesk", "Noto Sans Tamil", sans-serif';
    case 'Playfair Display':
      return '"Playfair Display", "Noto Sans Tamil", Georgia, serif';
    case 'Pacifico':
      return 'Pacifico, "Noto Sans Tamil", cursive';
    case 'Black Han Sans':
      return '"Black Han Sans", "Noto Sans Tamil", sans-serif';
    default:
      return '"Helvetica Neue", Arial, "Noto Sans Tamil", sans-serif';
  }
}

/**
 * Draw the active caption frame for the given media time onto ctx.
 * No-op when there is nothing to show.
 */
export function drawExportCaptions(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  mediaTime: number,
  words: CaptionWord[],
  style: SubtitleStyleSettings
): void {
  if (!words || words.length === 0 || canvasW <= 0 || canvasH <= 0) return;

  // Active word: most recent word whose start_time has passed (mirrors player).
  let activeIdx = 0;
  for (let i = 0; i < words.length; i++) {
    if (mediaTime >= words[i].start_time) activeIdx = i;
  }
  // Hide captions entirely before the first word starts.
  if (mediaTime < words[0].start_time) return;

  const frames = generateCaptionFrames(words, style.maxWordsPerScreen || 3);
  const targetWord = words[Math.max(0, Math.min(activeIdx, words.length - 1))];
  const frame =
    frames.find((f) => f.some((w) => w.id === targetWord.id)) ||
    frames[0] ||
    [];
  if (frame.length === 0) return;

  const items = frame
    .map((w) => ({ id: w.id, text: formatWordText(w, style) }))
    .filter((it) => it.text);

  // Font size proportional to canvas height (matches editor scale feel).
  let fontSize = Math.max(12, canvasH * 0.052 * (style.fontSize || 1));
  const stack = fontStackFor(style);
  const setFont = (px: number) => {
    ctx.font = `700 ${px}px ${stack}`;
  };
  setFont(fontSize);

  const gap = fontSize * 0.35;
  const measure = () =>
    items.reduce((sum, it) => sum + ctx.measureText(it.text).width, 0) +
    gap * (items.length - 1);

  // Shrink to fit if the line is wider than 92% of the canvas.
  let totalW = measure();
  const maxW = canvasW * 0.92;
  if (totalW > maxW && totalW > 0) {
    fontSize = Math.max(10, fontSize * (maxW / totalW));
    setFont(fontSize);
    totalW = measure();
  }

  const baselineY = canvasH - canvasH * 0.09 + (style.positionY || 0);
  let x = canvasW / 2 - totalW / 2 + (style.positionX || 0);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (style.showShadow !== false) {
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = Math.max(2, fontSize * 0.12);
    ctx.shadowOffsetX = Math.max(1, fontSize * 0.06);
    ctx.shadowOffsetY = Math.max(1, fontSize * 0.06);
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  for (const it of items) {
    const isActive = it.id === targetWord.id;
    ctx.fillStyle = isActive ? style.highlightColor : style.textColor;
    ctx.fillText(it.text, x, baselineY);
    x += ctx.measureText(it.text).width + gap;
  }

  // Reset shadow so later draws are unaffected.
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}
