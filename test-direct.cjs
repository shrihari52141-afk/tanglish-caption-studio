const fs = require('fs');

async function testDirect() {
  const videoPath = 'C:\\Users\\opc\\Downloads\\VID-20260721-WA0044.mp4';
  const fileBuffer = fs.readFileSync(videoPath);

  // 1. Fetch check-env to get keys from Cloudflare
  console.log('Fetching environment keys...');
  const envRes = await fetch('https://tanglish-caption-studio.pages.dev/api/check-env');
  const envData = await envRes.json();
  console.log('Gemini Keys count:', envData.geminiKeysCount);
  console.log('Deepgram Keys count:', envData.deepgramKeysCount);

  // 2. Test Deepgram Nova-3 API call directly
  console.log('\n--- 1. Testing Deepgram Nova-3 API directly ---');
  const dgKey = '0d905d51d4eb076faefd9f5eb0d9ebdf0380bf9d'; // Deepgram key from env
  const dgUrl = 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&word_timestamps=true&filler_words=true&detect_language=true';
  
  const dgStart = Date.now();
  const dgRes = await fetch(dgUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${dgKey}`,
      'Content-Type': 'video/mp4'
    },
    body: fileBuffer
  });

  console.log(`Deepgram Status: ${dgRes.status} (took ${((Date.now() - dgStart)/1000).toFixed(2)}s)`);
  if (!dgRes.ok) {
    console.error('Deepgram Error:', await dgRes.text());
    return;
  }
  const dgResult = await dgRes.json();
  const detectedLang = dgResult?.results?.channels?.[0]?.detected_language || 'unknown';
  const dgWords = dgResult?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  console.log(`Deepgram Detected Language: ${detectedLang}`);
  console.log(`Deepgram Transcript: "${dgResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript}"`);
  console.log(`Deepgram Word Count: ${dgWords.length}`);
  console.log('First 5 Deepgram words:', dgWords.slice(0, 5).map(w => `${w.punctuated_word || w.word} (${w.start}s->${w.end}s)`));

}

testDirect();
