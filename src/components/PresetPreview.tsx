import { useRef, useEffect } from 'react';
import { SubtitleStyleSettings } from '../types';

const SAMPLE_WORDS = [
  { word: 'Your', highlight: false },
  { word: 'Sample', highlight: true },
  { word: 'Text', highlight: false },
];

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface PresetPreviewProps {
  settings: SubtitleStyleSettings;
}

export default function PresetPreview({ settings }: PresetPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const scaleX = W / 170; // reference width 170 (half of standard 340)
    const baseFontSize = 14 * scaleX;

    let fontName = 'sans-serif';
    let fontStyle = 'bold';
    if (settings.fontFamily === 'Impact') { fontName = 'Impact, sans-serif'; fontStyle = '900 italic'; }
    else if (settings.fontFamily === 'Courier') { fontName = '"Courier New", Courier, monospace'; fontStyle = 'bold'; }
    else if (settings.fontFamily === 'Fredoka') { fontName = '"Fredoka", "Inter", sans-serif'; fontStyle = '900'; }
    else if (settings.fontFamily === 'Space Grotesk') { fontName = '"Space Grotesk", sans-serif'; fontStyle = '900'; }
    else if (settings.fontFamily === 'Playfair Display') { fontName = '"Playfair Display", Georgia, serif'; fontStyle = '900 italic'; }
    else if (settings.fontFamily === 'Pacifico') { fontName = '"Pacifico", cursive'; fontStyle = 'normal'; }
    else if (settings.fontFamily === 'Black Han Sans') { fontName = '"Black Han Sans", sans-serif'; fontStyle = '900'; }
    else { fontName = '"Helvetica Neue", Arial, sans-serif'; fontStyle = 'bold'; }

    ctx.font = `${fontStyle} ${baseFontSize}px ${fontName}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const gap = 4 * scaleX;
    const totalWidth = SAMPLE_WORDS.reduce((s, w) => {
      const m = ctx.measureText(w.word);
      return s + m.width + gap;
    }, -gap);
    let startX = (W - totalWidth) / 2;

    const wordData = SAMPLE_WORDS.map((w) => {
      const m = ctx.measureText(w.word);
      const x = startX + m.width / 2;
      startX += m.width + gap;
      return { ...w, width: m.width, centerX: x };
    });

    const animLoop = (time: number) => {
      if (!startTimeRef.current) startTimeRef.current = time;
      const t = (time - startTimeRef.current) / 1000;
      const cycle = t % 2; // 2-second loop

      ctx.clearRect(0, 0, W, H);
      ctx.save();

      const curYX = W / 2;
      const curY = H / 2;

      for (const w of wordData) {
        ctx.save();
        if (w.highlight) {
          // Animate the "Sample" word
          let scale = 1;
          let dy = 0;
          if (cycle < 0.3) {
            const p = cycle / 0.3;
            scale = 0.8 + p * 0.4;
          } else if (cycle < 0.6) {
            const p = (cycle - 0.3) / 0.3;
            scale = 1.2 - p * 0.2;
          } else {
            scale = 1;
          }

          ctx.translate(curYX, curY);
          ctx.scale(scale, scale);
          ctx.translate(-curYX, -curY);

          ctx.fillStyle = '#000';
          const padX = 4 * scaleX;
          const padY = 2 * scaleX;
          const rx = w.centerX - w.width / 2 - padX;
          const ry = curY - baseFontSize / 2 - padY;
          const rw = w.width + padX * 2;
          const rh = baseFontSize + padY * 2;
          const rad = 3 * scaleX;
          ctx.beginPath();
          ctx.moveTo(rx + rad, ry);
          ctx.lineTo(rx + rw - rad, ry);
          ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rad);
          ctx.lineTo(rx + rw, ry + rh - rad);
          ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rad, ry + rh);
          ctx.lineTo(rx + rad, ry + rh);
          ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rad);
          ctx.lineTo(rx, ry + rad);
          ctx.quadraticCurveTo(rx, ry, rx + rad, ry);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = settings.highlightColor;
          if (settings.showBacklight) {
            ctx.shadowColor = settings.highlightColor;
            ctx.shadowBlur = 10 * scaleX;
          }
        } else {
          ctx.fillStyle = settings.textColor;
          if (settings.showShadow) {
            ctx.fillStyle = '#000';
            ctx.fillText(w.word, w.centerX + 1.5 * scaleX, curY + 1.5 * scaleX);
            ctx.fillStyle = settings.textColor;
          }
        }
        ctx.fillText(w.word, w.centerX, curY);
        ctx.restore();
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(animLoop);
    };

    rafRef.current = requestAnimationFrame(animLoop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [settings]);

  return (
    <canvas
      ref={canvasRef}
      width={170}
      height={42}
      className="w-full h-full rounded-lg"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
