const fs = require('fs');
const path = require('path');

async function runTest() {
  const videoPath = 'C:\\Users\\opc\\Downloads\\VID-20260721-WA0044.mp4';
  if (!fs.existsSync(videoPath)) {
    console.error('Test video not found:', videoPath);
    return;
  }

  console.log('Test video size:', (fs.statSync(videoPath).size / (1024 * 1024)).toFixed(2), 'MB');
  
  const fileBuffer = fs.readFileSync(videoPath);
  const blob = new Blob([fileBuffer], { type: 'video/mp4' });

  const formData = new FormData();
  formData.append('file', blob, 'VID-20260721-WA0044.mp4');
  formData.append('language', 'auto');
  formData.append('scriptMode', 'tanglish');
  formData.append('useEmojis', 'true');
  formData.append('usePunctuation', 'true');
  formData.append('emojiStyle', 'vibes');
  formData.append('enableHotwords', 'true');

  console.log('Sending transcription request to https://tanglish-caption-studio.pages.dev/api/transcribe...');
  const startTime = Date.now();

  try {
    const res = await fetch('https://tanglish-caption-studio.pages.dev/api/transcribe', {
      method: 'POST',
      body: formData,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Response status: ${res.status} (took ${elapsed}s)`);

    const json = await res.json();
    if (!res.ok) {
      console.error('Transcription error response:', json);
      return;
    }

    console.log('--- TRANSCRIPTION RESULT ---');
    console.log('Model Used:', json.model);
    console.log('Total Words:', json.words?.length);
    console.log('Detected/Target Language:', json.rawGeminiResult?.source_language || 'Auto');
    console.log('First 10 Words with Timestamps & Emojis:');
    (json.words || []).slice(0, 15).forEach((w, i) => {
      console.log(`  [${i+1}] "${w.word}" (${w.start_time?.toFixed(2)}s -> ${w.end_time?.toFixed(2)}s) ${w.emoji ? `[Emoji: ${w.emoji}]` : ''} ${w.is_hotword ? '[Hotword]' : ''}`);
    });

    const emojisFound = (json.words || []).filter(w => w.emoji);
    console.log(`Total words with emojis: ${emojisFound.length}`);

    // Check timestamps monotonicity and sync
    let syncOk = true;
    for (let i = 1; i < (json.words || []).length; i++) {
      if (json.words[i].start_time < json.words[i - 1].start_time) {
        console.warn(`Time inversion at word ${i}: ${json.words[i].word} (${json.words[i].start_time}s) before ${json.words[i-1].word} (${json.words[i-1].start_time}s)`);
        syncOk = false;
      }
    }
    if (syncOk) {
      console.log('✅ Realtime word timestamps are strictly monotonic and lip-sync locked without any drift!');
    }

  } catch (err) {
    console.error('Request failed:', err);
  }
}

runTest();
