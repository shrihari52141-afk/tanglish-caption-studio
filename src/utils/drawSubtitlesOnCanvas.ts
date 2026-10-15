/**
 * drawSubtitlesOnCanvas.ts
 *
 * The external caption renderer consumed by useVideoExport()'s drawFn.
 * (The hook's contract: "Caption rendering (drawSubtitlesOnCanvas) is called
 * externally via drawFn".)
 *
 * It mirrors the editor preview:
 *  - frame chunking via generateCaptionFrames (same maxWordsPerScreen rule)
 *  - active word = last word with start_time <= t (same as VideoPlayer)
 *  - word text via stripASSTags + emoji + capitalization (same as preview)
 *  - font family / size / colors / shadow from SubtitleStyleSettings
 */

import { CaptionWord, SubtitleStyleSettings } from '../types';
import {
  generateCaptionFrames,
  stripASSTags,
  applyCaptionFormatting,
} from './captionFormatter';

function fontFamilyFor(style: SubtitleStyleSettings): string {
  switch (style.fontFamily) {
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

function fontWeightFor(style: SubtitleStyleSettings): string {
  if (style.fontFamily === 'Pacifico') return '400';
  return '800';
}

function formatWordText(word: CaptionWord, style: SubtitleStyleSettings): string {
  let formatted = applyCaptionFormatting(
    stripASSTags(word.word),
    style.showEmojis !== false,
    style.showPunctuation !== false,
    style.emojiStyle || 'vibes'
  );
  if (word.emoji && style.showEmojis !== false && !formatted.includes(word.emoji)) {
    formatted = `${formatted} ${word.emoji}`;
  }
  if (style.capitalization === 'all') return formatted.toUpperCase();
  if (style.capitalization === 'lower') return formatted.toLowerCase();
  if (style.capitalization === 'sentence') {
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
  return formatted;
}

export function drawSubtitlesOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  time: number,
  words: CaptionWord[],
  style: SubtitleStyleSettings
): void {
  if (!words || words.length === 0) return;

  // Same frame chunking as the editor preview
  const frames = generateCaptionFrames(words, style.maxWordsPerScreen || 0);
  if (frames.length === 0) return;

  // Same active-word rule as VideoPlayer: last word with start_time <= t
  let activeIdx = 0;
  for (let i = 0; i < words.length; i++) {
    if (time >= words[i].start_time) activeIdx = i;
  }
  const activeWord = words[activeIdx];
  if (!activeWord) return;
  if (time < words[0].start_time || time > words[words.length - 1].end_time + 0.5) return;

  const frame =
    frames.find((f) => f.some((w) => w.id === activeWord.id)) || frames[0];
  if (!frame || frame.length === 0) return;

  // Scale type to the export canvas (preview uses 32px base at ~480p reference)
  const scale = canvasH / 480;
  const fontPx = Math.max(10, 32 * (style.fontSize || 1) * scale);
  ctx.font = `${fontWeightFor(style)} ${fontPx}px ${fontFamilyFor(style)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Measure the full line for centering + background pill
  const gap = 8 * scale;
  const texts = frame.map((w) => formatWordText(w, style));
  const widths = texts.map((t) => ctx.measureText(t).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (texts.length - 1);

  let x = canvasW / 2 - totalW / 2 + (style.positionX || 0) * scale;
  // Bottom-anchored like the preview overlay, honoring positionY lift
  const y =
    canvasH - (60 * scale + (style.positionY || 0) * scale) ;

  // Optional background pill behind the caption line
  if (style.showBackground) {
    const padX = 16 * scale;
    const padY = 8 * scale;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    const bx = canvasW / 2 - totalW / 2 - padX + (style.positionX || 0) * scale;
    const bw = totalW + padX * 2;
    const bh = fontPx + padY * 2;
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D).roundRect(bx, y - bh / 2, bw, bh, 12 * scale);
    ctx.fill();
  }

  for (let i = 0; i < frame.length; i++) {
    const w = frame[i];
    const text = texts[i];
    const isActive = w.id === activeWord.id;
    const cx = x + widths[i] / 2;

    ctx.fillStyle = isActive
      ? style.highlightColor || '#FDE047'
      : style.textColor || '#FFFFFF';

    if (style.showShadow !== false) {
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = Math.max(2, 4 * scale);
      ctx.shadowOffsetY = Math.max(2, 4 * scale);
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    // Stroke for legibility on bright video
    ctx.lineWidth = Math.max(2, fontPx * 0.08);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, cx, y);
    ctx.fillText(text, cx, y);

    // Reset shadow for next word measurement safety
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    x += widths[i] + gap;
  }
}
