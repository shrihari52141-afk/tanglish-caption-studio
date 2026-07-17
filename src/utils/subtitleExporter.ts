import { CaptionWord } from '../types';

export function formatSRTTime(seconds: number): string {
  const pad = (n: number, width: number) => n.toString().padStart(width, '0');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

export function formatVTTTime(seconds: number): string {
  const pad = (n: number, width: number) => n.toString().padStart(width, '0');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

export function formatASSTime(seconds: number): string {
  const pad = (n: number, width: number) => n.toString().padStart(width, '0');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${pad(m, 2)}:${pad(s, 2)}.${pad(cs, 2)}`;
}

export function exportToSRT(words: CaptionWord[], maxWordsPerLine: number = 3): string {
  let srt = '';
  let counter = 1;
  for (let i = 0; i < words.length; i += maxWordsPerLine) {
    const chunk = words.slice(i, i + maxWordsPerLine);
    const text = chunk.map(w => w.word).join(' ');
    const start = chunk[0].start_time;
    const end = chunk[chunk.length - 1].end_time;
    
    srt += `${counter}\n`;
    srt += `${formatSRTTime(start)} --> ${formatSRTTime(end)}\n`;
    srt += `${text}\n\n`;
    counter++;
  }
  return srt;
}

export function exportToVTT(words: CaptionWord[], maxWordsPerLine: number = 3): string {
  let vtt = 'WEBVTT\n\n';
  for (let i = 0; i < words.length; i += maxWordsPerLine) {
    const chunk = words.slice(i, i + maxWordsPerLine);
    const text = chunk.map(w => w.word).join(' ');
    const start = chunk[0].start_time;
    const end = chunk[chunk.length - 1].end_time;
    
    vtt += `${formatVTTTime(start)} --> ${formatVTTTime(end)}\n`;
    vtt += `${text}\n\n`;
  }
  return vtt;
}

export function exportToASS(words: CaptionWord[], maxWordsPerLine: number = 3): string {
  let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (let i = 0; i < words.length; i += maxWordsPerLine) {
    const chunk = words.slice(i, i + maxWordsPerLine);
    const text = chunk.map(w => w.word).join(' ');
    const start = chunk[0].start_time;
    const end = chunk[chunk.length - 1].end_time;
    
    ass += `Dialogue: 0,${formatASSTime(start)},${formatASSTime(end)},Default,,0,0,0,,${text}\n`;
  }
  return ass;
}

export function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
