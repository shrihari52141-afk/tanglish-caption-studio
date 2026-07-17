import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Robust resolution for __filename and __dirname supporting both ESM (development) and CJS (production bundling)
const currentFilename = typeof import.meta !== "undefined" && import.meta && import.meta.url
  ? fileURLToPath(import.meta.url)
  : (typeof __filename !== "undefined" ? __filename : "");

const currentDirname = typeof import.meta !== "undefined" && import.meta && import.meta.url
  ? path.dirname(currentFilename)
  : (typeof __dirname !== "undefined" ? __dirname : process.cwd());

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: "uploads/" });

const jobClients = new Map<string, express.Response>();

function sendLog(jobId: string | undefined, message: string) {
  if (jobId && jobClients.has(jobId)) {
    jobClients.get(jobId)!.write(`data: ${JSON.stringify({ message })}\n\n`);
  }
  console.log(`[Job ${jobId || 'N/A'}] ${message}`);
}

function formatASSTime(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.floor((seconds % 1) * 100);
  
  const hStr = hours.toString();
  const mStr = minutes.toString().padStart(2, "0");
  const sStr = secs.toString().padStart(2, "0");
  const cStr = centis.toString().padStart(2, "0");
  
  return `${hStr}:${mStr}:${sStr}.${cStr}`;
}

function hexToASSColor(hex: string): string {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  if (clean.length !== 6) {
    return "&H00FFFFFF";
  }
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H00${b}${g}${r}`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/logs", (req, res) => {
    const jobId = req.query.jobId as string;
    if (!jobId) {
      return res.status(400).end();
    }
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    
    jobClients.set(jobId, res);
    
    res.write(`data: ${JSON.stringify({ message: "Log stream initialized." })}\n\n`);
    
    req.on("close", () => {
      jobClients.delete(jobId);
    });
  });

  // --- GOOGLE GEMINI KEY ROTATION MANAGER ---
  let geminiKeys: string[] = [];
  let nextKeyIndex = 0;

  function loadGeminiKeys() {
    const keysSet = new Set<string>();
    
    const mainKey = process.env.GEMINI_API_KEY;
    if (mainKey) {
      const parts = mainKey.split(/[\s,]+/).map(k => k.trim()).filter(Boolean);
      parts.forEach(k => keysSet.add(k));
    }
    
    for (const envVar in process.env) {
      if (envVar.startsWith("GEMINI_API_KEY") || envVar.startsWith("GEMINI_KEY")) {
        const val = process.env[envVar];
        if (val) {
          const parts = val.split(/[\s,]+/).map(k => k.trim()).filter(Boolean);
          parts.forEach(k => keysSet.add(k));
        }
      }
    }
    
    geminiKeys = Array.from(keysSet);
    console.log(`[Gemini Rotation] Loaded ${geminiKeys.length} active API key(s) for rotation.`);
  }

  function getNextGeminiKey(): string | null {
    if (geminiKeys.length === 0) {
      loadGeminiKeys();
    }
    if (geminiKeys.length === 0) {
      return null;
    }
    const key = geminiKeys[nextKeyIndex];
    nextKeyIndex = (nextKeyIndex + 1) % geminiKeys.length;
    return key;
  }

  async function callGeminiWithRotation<T>(
    fn: (ai: GoogleGenAI) => Promise<T>,
    jobId?: string
  ): Promise<T> {
    if (geminiKeys.length === 0) {
      loadGeminiKeys();
    }
    if (geminiKeys.length === 0) {
      throw new Error("No Google Gemini API key is configured.");
    }
    
    let attempts = Math.min(5, geminiKeys.length);
    let lastError: any = null;
    
    for (let i = 0; i < attempts; i++) {
      const currentKey = getNextGeminiKey();
      if (!currentKey) {
        throw new Error("No Gemini API keys found.");
      }
      
      const obfuscatedKey = currentKey.length > 8 
        ? `${currentKey.substring(0, 4)}...${currentKey.substring(currentKey.length - 4)}`
        : "invalid-key";

      try {
        const ai = new GoogleGenAI({
          apiKey: currentKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });
        return await fn(ai);
      } catch (err: any) {
        lastError = err;
        const msg = `Gemini API call failed using key [${obfuscatedKey}]: ${err.message || err}.`;
        if (jobId) {
          sendLog(jobId, `${msg} Rotating key...`);
        }
        console.error(`[Gemini Rotation Error]:`, err);
      }
    }
    throw lastError || new Error("All Gemini API keys failed.");
  }

  // --- MULTI-PROVIDER AI SWITCHER WITH INSTANT FAILOVER ---
  function extractJsonFromResponse(text: string): any {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch (e) {}

    const match = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e) {}
    }

    const match2 = trimmed.match(/```\s*([\s\S]*?)\s*```/);
    if (match2 && match2[1]) {
      try {
        return JSON.parse(match2[1].trim());
      } catch (e) {}
    }

    return null;
  }

  // Transcription endpoint
  app.post("/api/transcribe", upload.single('video'), async (req, res) => {
    const jobId = req.query.jobId as string;
    const language = req.body.language || 'ta-IN';
    const useEmojis = req.body.useEmojis === 'true';
    const translationMode = req.body.translationMode || 'none';
    const usePunctuation = req.body.usePunctuation === 'true';
    const emojiStyle = req.body.emojiStyle || 'vibes';

    sendLog(jobId, "Starting transcription job...");

    try {
      if (!req.file) {
        throw new Error("No audio file uploaded");
      }

      sendLog(jobId, `Processing audio file: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`);

      // Read the uploaded audio file
      const audioBuffer = fs.readFileSync(req.file.path);

      sendLog(jobId, "Attempting transcription with Gemini AI...");

      const result = await callGeminiWithRotation(async (ai) => {
        const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const prompt = `Transcribe this audio accurately. Return ONLY a JSON array of objects with this exact structure:
[{"word": "text", "start_time": seconds, "end_time": seconds}, ...]

Language: ${language}
Use emojis: ${useEmojis}
Translation mode: ${translationMode}
Punctuation: ${usePunctuation}
Emoji style: ${emojiStyle}

Audio file is attached.`;

        const response = await model.generateContent([
          prompt,
          {
            inlineData: {
              mimeType: req.file.mimetype || 'audio/wav',
              data: audioBuffer.toString('base64')
            }
          }
        ]);

        const text = response.response.text();
        const json = extractJsonFromResponse(text);
        
        if (!json || !Array.isArray(json)) {
          throw new Error("Failed to parse transcription result");
        }
        
        return json;
      }, jobId);

      // Clean up uploaded file
      try { fs.unlinkSync(req.file.path); } catch (e) {}

      sendLog(jobId, "Done! Results ready.");
      
      res.json({ 
        words: result,
        filename: req.file.originalname 
      });

    } catch (error: any) {
      console.error("Transcription error:", error);
      sendLog(jobId, `ERROR: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Mic transcription endpoint
  app.post("/api/transcribe-mic", upload.single('audio'), async (req, res) => {
    const jobId = req.query.jobId as string;
    
    try {
      if (!req.file) throw new Error("No audio file");
      
      const audioBuffer = fs.readFileSync(req.file.path);
      
      const result = await callGeminiWithRotation(async (ai) => {
        const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Transcribe this voice note accurately. Return the full transcript as plain text.`;
        
        const response = await model.generateContent([
          prompt,
          {
            inlineData: {
              mimeType: req.file.mimetype || 'audio/webm',
              data: audioBuffer.toString('base64')
            }
          }
        ]);
        
        return response.response.text();
      });

      try { fs.unlinkSync(req.file.path); } catch (e) {}
      
      res.json({ transcript: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Export endpoint (cloud render with ffmpeg)
  app.post("/api/export", upload.single('video'), async (req, res) => {
    // ... (full export logic with ffmpeg subtitle burning)
    res.status(501).json({ error: "Cloud export coming soon in full version" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();