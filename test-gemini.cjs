const fs = require('fs');

async function testGemini() {
  const videoPath = 'C:\\Users\\opc\\Downloads\\VID-20260721-WA0044.mp4';
  const fileBuffer = fs.readFileSync(videoPath);
  const base64Audio = fileBuffer.toString('base64');

  // Let's create an endpoint on Cloudflare Pages functions/api/diag.js that tests 1 Gemini key and 1 Deepgram key and returns the exact error from Google and Deepgram
  console.log('Sending diagnosis test...');
}

testGemini();
