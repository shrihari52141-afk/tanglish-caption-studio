/**
 * Utility to extract, resample, and encode audio from a video/audio file client-side.
 * This sends only a highly-compressed 16kHz mono WAV file to the server.
 */

export async function extractAudioTrack(file: File, onProgress?: (msg: string) => void): Promise<Blob> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported in this browser.");
  }

  onProgress?.("Reading file buffer...");
  const fileArrayBuffer = await file.arrayBuffer();

  onProgress?.("Decoding audio track in browser...");
  const audioContext = new AudioContextClass();
  
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioContext.decodeAudioData(fileArrayBuffer);
  } catch (err) {
    console.error("Audio decoding failed, falling back to original file upload.", err);
    throw new Error("Could not decode audio track. The file may be corrupt or unsupported.");
  } finally {
    await audioContext.close();
  }

  onProgress?.("Resampling audio to 16kHz Mono...");
  const targetSampleRate = 16000;
  const numberOfChannels = 1;
  const duration = audioBuffer.duration;
  const numSamples = Math.floor(duration * targetSampleRate);

  // Use OfflineAudioContext for extremely fast server-like hardware resynthesis/resampling
  const offlineCtx = new OfflineAudioContext(numberOfChannels, numSamples, targetSampleRate);
  
  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start();

  const resampledBuffer = await offlineCtx.startRendering();

  onProgress?.("Encoding resampled audio to WAV...");
  return bufferToWav(resampledBuffer);
}

function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // Uncompressed PCM
  const bitDepth = 16;
  const channelData = buffer.getChannelData(0); // Mono
  
  const bufferLength = channelData.length * 2;
  const arrayBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(arrayBuffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + bufferLength, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numOfChan, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numOfChan * (bitDepth / 8), true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, bufferLength, true);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < channelData.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
