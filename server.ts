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
    res.setHeader("X-Accel-Buffering", "no"); // Prevent buffering on Cloud Run, Nginx, and proxies!
    
    jobClients.set(jobId, res);
    
    // Flush connection instantly
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
    
    // 1. Parse standard GEMINI_API_KEY (support comma or space separation)
    const mainKey = process.env.GEMINI_API_KEY;
    if (mainKey) {
      const parts = mainKey.split(/[\s,]+/).map(k => k.trim()).filter(Boolean);
      parts.forEach(k => keysSet.add(k));
    }
    
    // 2. Scan for any other environment variables starting with GEMINI_API_KEY or GEMINI_KEY
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

    throw new Error("Unable to parse JSON from AI model response content.");
  }

  async function tryGemini(initialWords: any[], systemPrompt: string, jobId?: string): Promise<any[]> {
    let finalWords: any[] = [];
    await callGeminiWithRotation(async (ai) => {
      const geminiResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Here is the input JSON array of words to process:\n${JSON.stringify(initialWords, null, 2)}`,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              words: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    start_time: { type: Type.NUMBER },
                    end_time: { type: Type.NUMBER }
                  },
                  required: ["word", "start_time", "end_time"]
                }
              }
            },
            required: ["words"]
          }
        }
      });

      const resultText = geminiResponse.text;
      if (resultText) {
        const parsed = extractJsonFromResponse(resultText);
        if (parsed.words && Array.isArray(parsed.words)) {
          finalWords = parsed.words;
        } else if (Array.isArray(parsed)) {
          finalWords = parsed;
        }
      }
    }, jobId);

    if (finalWords.length === 0) {
      throw new Error("Gemini returned empty or invalid formatted subtitles.");
    }
    return finalWords;
  }

  async function tryOpenAICompatible(
    providerName: string,
    displayName: string,
    apiKey: string,
    baseUrl: string,
    defaultModel: string,
    initialWords: any[],
    systemPrompt: string,
    jobId?: string
  ): Promise<any[]> {
    const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    const payload = {
      model: defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the input JSON array of words to process:\n${JSON.stringify(initialWords, null, 2)}` }
      ],
      response_format: { type: "json_object" }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as any;
    const resultText = data.choices?.[0]?.message?.content;
    if (!resultText) {
      throw new Error("Empty response choice content");
    }

    const parsed = extractJsonFromResponse(resultText);
    let wordsList: any[] = [];
    if (parsed.words && Array.isArray(parsed.words)) {
      wordsList = parsed.words;
    } else if (Array.isArray(parsed)) {
      wordsList = parsed;
    }

    if (wordsList.length === 0) {
      throw new Error("Provider returned empty or invalid formatted subtitles.");
    }

    return wordsList;
  }

  async function enrichSubtitlesWithFallback(
    initialWords: any[],
    systemPrompt: string,
    jobId?: string
  ): Promise<{ words: any[]; providerUsed: string }> {
    let config = {
      providers: [] as any[],
      priority: [] as string[]
    };
    try {
      const configPath = path.join(process.cwd(), "ai_config.json");
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      }
    } catch (err) {
      console.error("Failed to load ai_config.json, using fallback config", err);
    }

    if (!config.providers || config.providers.length === 0) {
      config = {
        providers: [
          { name: "gemini", displayName: "Google Gemini", apiKeyEnv: "GEMINI_API_KEY", defaultModel: "gemini-2.5-flash", baseUrl: "" },
          { name: "groq", displayName: "Groq Cloud", apiKeyEnv: "GROQ_API_KEY", defaultModel: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" },
          { name: "nvidia", displayName: "NVIDIA NIM", apiKeyEnv: "NVIDIA_API_KEY", defaultModel: "meta/llama-3-70b-instruct", baseUrl: "https://integrate.api.nvidia.com/v1" },
          { name: "openrouter", displayName: "OpenRouter", apiKeyEnv: "OPENROUTER_API_KEY", defaultModel: "meta-llama/llama-3.3-70b-instruct:free", baseUrl: "https://openrouter.ai/api/v1" }
        ],
        priority: ["gemini", "groq", "nvidia", "openrouter"]
      };
    }

    let errors: string[] = [];

    for (const providerName of config.priority) {
      const provider = config.providers.find((p: any) => p.name === providerName);
      if (!provider) continue;

      const apiKey = process.env[provider.apiKeyEnv];
      if (!apiKey && providerName !== "gemini") {
        continue; // Provider API key not configured
      }

      if (providerName === "gemini") {
        if (geminiKeys.length === 0) {
          loadGeminiKeys();
        }
        if (geminiKeys.length === 0) {
          continue; // Gemini keys not configured
        }
      }

      try {
        sendLog(jobId, `Polishing subtitles via ${provider.displayName}... 🤖`);
        let result: any[] = [];
        if (providerName === "gemini") {
          result = await tryGemini(initialWords, systemPrompt, jobId);
        } else {
          result = await tryOpenAICompatible(
            provider.name,
            provider.displayName,
            apiKey!,
            provider.baseUrl,
            provider.defaultModel,
            initialWords,
            systemPrompt,
            jobId
          );
        }
        sendLog(jobId, `✨ Success! Subtitles generated/formatted using ${provider.displayName}.`);
        return { words: result, providerUsed: provider.displayName };
      } catch (err: any) {
        const errMsg = `${provider.displayName} failover fallback trigger: ${err.message || err}`;
        errors.push(errMsg);
        sendLog(jobId, `⚠️ ${errMsg}. Switching to next available AI instantly...`);
      }
    }

    throw new Error(`All AI services failed to process subtitles. Details:\n- ${errors.join("\n- ")}`);
  }

  // --- GOOGLE SHEETS LOGGER ON BEHALF OF USER ---
  async function logActionToSheets(
    accessToken: string | null,
    action: "UPLOAD" | "EXPORT",
    filename: string,
    language: string,
    status: "SUCCESS" | "FAILED",
    details: string
  ) {
    if (!accessToken) {
      console.log(`[Sheets Logger] Skipped logging for ${action} because no user access token was provided.`);
      return;
    }

    try {
      console.log(`[Sheets Logger] Attempting to log ${action} action to Google Sheets...`);
      
      // 1. Search for spreadsheet named "Tanglish Studio Logs" in Google Drive
      const searchUrl = "https://www.googleapis.com/drive/v3/files?" + new URLSearchParams({
        q: "name='Tanglish Studio Logs' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields: "files(id, name)"
      }).toString();

      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!searchRes.ok) {
        throw new Error(`Drive search failed: ${searchRes.status} - ${await searchRes.text()}`);
      }

      const searchData = (await searchRes.json()) as any;
      let spreadsheetId = searchData.files?.[0]?.id;

      // 2. If not found, create a new spreadsheet
      if (!spreadsheetId) {
        console.log("[Sheets Logger] 'Tanglish Studio Logs' spreadsheet not found. Creating a new one...");
        const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            properties: {
              title: "Tanglish Studio Logs",
            },
          }),
        });

        if (!createRes.ok) {
          throw new Error(`Sheets creation failed: ${createRes.status} - ${await createRes.text()}`);
        }

        const createData = (await createRes.json()) as any;
        spreadsheetId = createData.spreadsheetId;

        // Write the header row
        const range = "Sheet1!A1:F1";
        const headerRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              values: [["Timestamp", "Action", "File Name", "Selected Language", "Status", "Details"]],
            }),
          }
        );

        if (!headerRes.ok) {
          console.warn("[Sheets Logger] Failed to write header row:", await headerRes.text());
        }
      }

      // 3. Append the action log row
      const timestamp = new Date().toISOString();
      const appendRange = "Sheet1!A:F";
      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${appendRange}:append?valueInputOption=USER_ENTERED`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            values: [[timestamp, action, filename, language, status, details]],
          }),
        }
      );

      if (!appendRes.ok) {
        throw new Error(`Append row failed: ${appendRes.status} - ${await appendRes.text()}`);
      }

      console.log(`[Sheets Logger] Successfully logged ${action} to spreadsheet ${spreadsheetId}`);
    } catch (err: any) {
      console.error("[Sheets Logger] Error logging to Google Sheets:", err.message || err);
    }
  }

  // Helper to extract access token from Authorization header
  function getAccessTokenFromHeader(req: express.Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }
    return null;
  }

  app.post("/api/transcribe", upload.single("video"), async (req, res) => {
    const jobId = req.query.jobId as string;
    const accessToken = getAccessTokenFromHeader(req);
    let audioPath: string | null = null;
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video file provided" });
      }

      const { language = 'tamil', useEmojis = 'true', translationMode = 'transliterate', usePunctuation = 'true', emojiStyle = 'vibes' } = req.body;
      const isEmojiActive = useEmojis === 'true';
      const isPunctuationActive = usePunctuation === 'true';
      
      sendLog(jobId, `Selected language: ${language.toUpperCase()} (${translationMode.toUpperCase()}) | Emojis: ${isEmojiActive ? 'YES' : 'NO'} (${emojiStyle.toUpperCase()}) | Punctuation: ${isPunctuationActive ? 'YES' : 'NO'}`);
      sendLog(jobId, "Extracting audio from video using FFmpeg...");
      audioPath = `${req.file.path}.mp3`;
      
      try {
        await execAsync(`ffmpeg -y -i "${req.file.path}" -vn -acodec libmp3lame -q:a 2 "${audioPath}"`);
        sendLog(jobId, "Audio extraction complete.");
      } catch (err) {
        sendLog(jobId, "Error extracting audio, falling back to original video file...");
        audioPath = req.file.path; // fallback
      }

      const stats = fs.statSync(audioPath);
      const mimeType = audioPath.endsWith('.mp3') ? 'audio/mpeg' : req.file.mimetype;
      
      sendLog(jobId, "Uploading audio and generating raw transcript using Google Gemini native transcription engine...");
      
      const fileBuffer = fs.readFileSync(audioPath);
      
      // Call Gemini with Key Rotation to transcribe
      let initialWords: { word: string; start_time: number; end_time: number }[] = [];
      
      await callGeminiWithRotation(async (ai) => {
        // Try gemini-2.5-flash as the primary native audio model
        const geminiRes = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              inlineData: {
                data: fileBuffer.toString("base64"),
                mimeType: mimeType
              }
            },
            {
              text: "You are a professional audio transcriber. Transcribe the spoken audio with extremely accurate word-level or phrase-level timestamps in seconds. Align each transcribed word with its exact start_time and end_time. Return every single word spoken in order. Format as a JSON object with a 'words' list containing objects of: { word: string, start_time: number, end_time: number }."
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                words: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      start_time: { type: Type.NUMBER },
                      end_time: { type: Type.NUMBER }
                    },
                    required: ["word", "start_time", "end_time"]
                  }
                }
              },
              required: ["words"]
            }
          }
        });

        const text = geminiRes.text;
        if (!text) {
          throw new Error("Received empty text back from Gemini transcriber.");
        }

        const parsed = JSON.parse(text.trim());
        if (parsed.words && Array.isArray(parsed.words)) {
          initialWords = parsed.words.map((w: any) => ({
            word: String(w.word),
            start_time: Number(w.start_time || w.start || 0),
            end_time: Number(w.end_time || w.end || 0)
          }));
        } else {
          throw new Error("No words array found in Gemini parsed result.");
        }
      }, jobId);

      sendLog(jobId, `Successfully generated ${initialWords.length} initial timed words.`);

      let languageInstruction = "";
      if (language === 'tamil') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Tamil (or a mix of Tamil and English).
            You MUST TRANSLATE all Tamil speech into standard, natural, conversational English text.
            The subtitles MUST be written in English. Do NOT output Tamil phonetics. Translate the actual meaning to English.
            Examples: "சும்மா" -> "simply" (or "just like that"), "செம்ம" -> "awesome" (or "excellent"), "மச்சி" -> "bro" (or "friend"), "வேற லெவல்" -> "next level".
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Tamil (or a mix of Tamil and English). 
            You MUST convert and transliterate all Tamil speech to Roman script (Tanglish), using English alphabets/letters.
            Do NOT use any Tamil script characters (like செம்ம, சும்மா, மச்சி) under any circumstances.
            Examples: "சும்மா" -> "summa", "மாஸ்" -> "mass", "செம்ம" -> "sema", "மச்சி" -> "machi", "வேற லெவல்" -> "vera level", "என்ன" -> "enna".
          `;
        }
      } else if (language === 'hindi') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Hindi (or a mix of Hindi and English).
            You MUST TRANSLATE all Hindi speech into standard, natural, conversational English text.
            The subtitles MUST be written in English. Do NOT output Hindi phonetics. Translate the actual meaning to English.
            Examples: "बहुत बढ़िया" -> "excellent", "दोस्त" -> "friend", "क्या हुआ" -> "what happened".
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Hindi (or a mix of Hindi and English).
            You MUST convert and transliterate all Hindi speech to Roman script (Hinglish), using English alphabets/letters.
            Do NOT use Devanagari script characters (like बहुत, बढ़िया, दोस्त, मस्त) under any circumstances.
            Examples: "बहुत बढ़िया" -> "bahut badiya", "मस्त" -> "mast", "दोस्त" -> "dost", "क्या" -> "kya", "चल" -> "chal", "भाई" -> "bhai".
          `;
        }
      } else if (language === 'telugu') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Telugu.
            You MUST TRANSLATE all Telugu speech into standard, natural, conversational English text.
            The subtitles MUST be written in English. Do NOT output Telugu phonetics. Translate the actual meaning to English.
            Examples: "బాగుంది" -> "good", "ఎలా ఉన్నావు" -> "how are you".
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Telugu (or a mix of Telugu and English).
          You MUST convert and transliterate all Telugu speech to Roman script (Telugish), using English alphabets/letters.
          Do NOT use Telugu script characters (like బాగుంది, ఎలా ఉన్నావు) under any circumstances.
          Examples: "బాగుంది" -> "bagundi", "ఎలా ఉన్నావు" -> "ela unnavu", "சூப்பர்" -> "super", "மิต್ರమా" -> "mitrama".
          `;
        }
      } else if (language === 'kannada') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Kannada.
            You MUST TRANSLATE all Kannada speech into standard, natural, conversational English text.
            The subtitles MUST be written in English. Do NOT output Kannada phonetics. Translate the actual meaning to English.
            Examples: "ಚೆன்னಾಗಿದೆ" -> "it is good", "ಹೇಗಿದ್ದೀರಾ" -> "how are you".
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Kannada (or a mix of Kannada and English).
          You MUST convert and transliterate all Kannada speech to Roman script (Kannadish), using English alphabets/letters.
          Do NOT use Kannada script characters (like ಚೆನ್ನಾಗಿದೆ, ಹೇಗಿದ್ದೀರಾ) under any circumstances.
          Examples: "ಚೆன்னಾಗಿದೆ" -> "chennagide", "ಹೇಗಿದ್ದೀರಾ" -> "hegiddira", "ಬಾ" -> "baa", "ಧನ್ಯವಾದಗಳು" -> "dhanyavadagalu".
          `;
        }
      } else if (language === 'malayalam') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Malayalam.
            You MUST TRANSLATE all Malayalam speech into standard, natural, conversational English text.
            The subtitles MUST be written in English. Do NOT output Malayalam phonetics. Translate the actual meaning to English.
            Examples: "സുഖമാണോ" -> "are you fine", "அடிபொளி" -> "awesome".
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Malayalam (or a mix of Malayalam and English).
          You MUST convert and transliterate all Malayalam speech to Roman script (Manglish), using English alphabets/letters.
          Do NOT use Malayalam script characters (like സുഖമാണോ, அடிപൊളി) under any circumstances.
          Examples: "സുഖമാണോ" -> "sukhamano", "அடிപൊളി" -> "adipoli", "ഗംഭീരം" -> "gambheeram", "നന്ദി" -> "nandi".
          `;
        }
      } else if (language === 'spanish') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Spanish. You MUST translate all Spanish speech to clear, natural conversational English.
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Spanish. Provide standard Spanish subtitles in Roman letters.
          `;
        }
      } else if (language === 'italian') {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            The spoken speech is in Italian. You MUST translate all Italian speech to clear, natural conversational English.
          `;
        } else {
          languageInstruction = `
            The spoken speech is in Italian. Provide standard Italian subtitles in Roman letters.
          `;
        }
      } else if (language === 'english') {
        languageInstruction = `
          The spoken speech is in English. Provide standard English subtitles.
        `;
      } else {
        if (translationMode === 'translate_english') {
          languageInstruction = `
            Detect the spoken language automatically. You MUST translate all non-English speech into standard, natural, conversational English text.
            The subtitles MUST be written in proper English. Do NOT output regional phonetics. Translate the actual meaning to English.
          `;
        } else {
          languageInstruction = `
            Detect the spoken language automatically. If the language is a regional Indian language (such as Tamil, Hindi, Telugu, Kannada, Malayalam, etc.), you MUST convert and transliterate all regional speech to Roman script (e.g. Tanglish, Hinglish, Telugish, Manglish, Kannadish) using English alphabets/letters.
            Do NOT use native regional script characters under any circumstances.
          `;
        }
      }

      const emojiInstruction = isEmojiActive 
        ? `
          CRITICAL EMOJI REQUIREMENT: Attach relevant expression emojis directly to the end of highly expressive keywords, adjectives, or emotional phrases.
          Based on the selected theme preset "${emojiStyle}", choose emojis from this category:
          - 'auto': Automatically adjust emojis dynamically based on the audio tone, speech content, and video style/mood. Intelligently select from any of the emoji lists (vibes, emotions, energetic, minimal, custom, objects, etc.) to perfectly fit the video style.
          - 'vibes': Use high energy vibe emojis like 🔥, 🚀, ⚡, ✨, 🌟, 💯, 👑, 💥
          - 'emotions': Use expressive feelings face emojis like 🤩, 😂, 😭, 😡, 😱, 😍, 🙄, 😤, 😐
          - 'objects': Use real life object emojis like 🎬, 🎧, 🍔, 🍕, 🚗, 📱, 💼, 🎮, 📖
          - 'energetic': Use fierce physical emojis like 🦾, 🥳, 💀, 🦁, 🥊, 🎯, 💣, 🦖
          - 'minimal': Use cool minimal retro emojis like 👾, 🛸, 🧸, 🔮, 🍀, 🧿, 🎯
          - 'custom': Use magical cute emojis like 💖, 🌈, 🦄, 🍭, 🎈, 🦄, 🍦, 🎈
          Ensure emojis are added even if translating to English. Keep it clean and place them accurately where they add visual value.
        `
        : `
          CRITICAL EMOJI REQUIREMENT: Do NOT include ANY emojis or symbols in the transcribed words. Keep all words strictly clean.
        `;

      const punctuationInstruction = isPunctuationActive
        ? `
          PUNCTUATION RULE: Include normal conversational punctuation (such as commas, periods, exclamation marks, or question marks) attached to words naturally to show structure and tone.
        `
        : `
          PUNCTUATION RULE: Do NOT include ANY punctuation (commas, periods, exclamation marks, question marks, colons, semi-colons, brackets, or quotes). Words must consist ONLY of clean alphanumeric characters and emojis (if emojis are active).
        `;

      const systemPrompt = `
        You are an advanced AI Video Editor and Subtitle Formatter.
        You are given a JSON array of word objects, each having:
        - "word": the transcribed word or partial phrase in the spoken language
        - "start_time": the start timestamp in seconds (float)
        - "end_time": the end timestamp in seconds (float)

        YOUR TRANSFORMATION TASK:
        For each word in the input JSON, process it based on the following configurations:
        
        1. Language Translation & Transliteration Rule:
        ${languageInstruction}

        2. Custom Emoji Expression rule:
        ${emojiInstruction}

        3. Smart Punctuation rule:
        ${punctuationInstruction}

        CRITICAL STABILITY RULES:
        - You MUST retain the exact same number of items in the output array as the input array.
        - You MUST map each input word object to exactly one output word object.
        - You MUST keep the "start_time" and "end_time" values EXACTLY the same as the input. Do NOT modify, round, or shift any timestamp.
        - Output ONLY a valid JSON object matching this schema:
          {
            "words": [
              { "word": "formatted_word_with_optional_emoji", "start_time": <original_float>, "end_time": <original_float> }
            ]
          }
        - Do NOT include any markdown code blocks (such as \`\`\`json), explanations, preamble, or trailing notes. Only return the raw JSON object.
      `;

      let finalWords: any[] = [];
      let providerUsed = "Raw Fallback";

      try {
        const fallbackRes = await enrichSubtitlesWithFallback(initialWords, systemPrompt, jobId);
        finalWords = fallbackRes.words;
        providerUsed = fallbackRes.providerUsed;
      } catch (err: any) {
        sendLog(jobId, `Warning: All AI services failed: ${err.message}. Falling back to raw generated timed words.`);
        finalWords = initialWords;
      }

      sendLog(jobId, "Cleaning up...");
      if (audioPath && audioPath !== req.file.path && fs.existsSync(audioPath)) {
        try { fs.unlinkSync(audioPath); } catch (e) {}
      }

      // Log success to Google Sheets
      if (accessToken) {
        logActionToSheets(
          accessToken, 
          "UPLOAD", 
          req.file.originalname || "audio_file", 
          language, 
          "SUCCESS", 
          `Processed ${finalWords.length} words using ${providerUsed}.`
        ).catch(err => console.error("Sheets log background failed:", err));
      }

      sendLog(jobId, "Done! Results ready.");
      res.json({ words: finalWords, filename: req.file.filename });
    } catch (error: any) {
      sendLog(jobId, "ERROR: " + error.message);
      console.error("Transcription error:", error);
      
      // Log failure to Google Sheets
      if (accessToken && req.file) {
        logActionToSheets(
          accessToken, 
          "UPLOAD", 
          req.file.originalname || "audio_file", 
          "N/A", 
          "FAILED", 
          error.message || "Unknown transcription error"
        ).catch(err => console.error("Sheets log background failed:", err));
      }

      res.status(500).json({ error: "Failed to transcribe video" });
      
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      if (audioPath && audioPath !== req.file?.path && fs.existsSync(audioPath)) {
        try { fs.unlinkSync(audioPath); } catch (e) {}
      }
    }
  });

  app.post("/api/transcribe-mic", upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const fileBuffer = fs.readFileSync(req.file.path);
      const mimeType = req.file.mimetype || "audio/webm";

      let transcript = "";

      await callGeminiWithRotation(async (ai) => {
        const geminiRes = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              inlineData: {
                data: fileBuffer.toString("base64"),
                mimeType: mimeType
              }
            },
            {
              text: "You are an expert audio transcriber. Transcribe the spoken speech from this microphone recording verbatim, in high quality. Please preserve punctuation and standard formatting. If the language is a regional Indian language (like Tamil, Hindi, Telugu, Kannada, Malayalam, etc.), provide both the Romanised transliteration (e.g. Tanglish/Hinglish) and the English translation so it is incredibly helpful."
            }
          ]
        });

        transcript = geminiRes.text || "Empty transcription received.";
      });

      // Cleanup
      try { fs.unlinkSync(req.file.path); } catch (e) {}

      res.json({ transcript });
    } catch (error: any) {
      console.error("Microphone transcription error:", error);
      res.status(500).json({ error: error.message || "Failed to transcribe microphone audio" });
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
    }
  });

  app.post("/api/export", upload.single("video"), async (req, res) => {
    const jobId = req.query.jobId as string || Math.random().toString(36).substring(7);
    const accessToken = getAccessTokenFromHeader(req);
    let assPath: string | null = null;
    let outputPath: string | null = null;
    let videoPath = "";
    let isLocalRef = false;
    let originalName = "unknown_video";
    try {
      const { words: wordsJson, styleSettings: styleSettingsJson, videoWidth, videoHeight, filename, displayWidth, displayHeight } = req.body;
      
      if (filename) {
        videoPath = path.join(process.cwd(), "uploads", filename);
        originalName = filename;
        if (fs.existsSync(videoPath)) {
          isLocalRef = true;
          sendLog(jobId, "Using cached original video file on server (high-speed bypass)...");
        } else {
          return res.status(400).json({ error: "Specified file does not exist on server" });
        }
      } else {
        if (!req.file) {
          return res.status(400).json({ error: "No video file provided" });
        }
        videoPath = req.file.path;
        originalName = req.file.originalname;
      }

      if (!wordsJson || !styleSettingsJson) {
        return res.status(400).json({ error: "Missing words or style settings" });
      }

      const words = JSON.parse(wordsJson);
      const styleSettings = JSON.parse(styleSettingsJson);
      const width = parseInt(videoWidth) || 1080;
      const height = parseInt(videoHeight) || 1920;
      const dispWidth = parseInt(displayWidth) || 340;
      const dispHeight = parseInt(displayHeight) || 604;

      sendLog(jobId, "Preparing subtitles style...");
      const playResX = width;
      const playResY = height;

      // Default font mapping
      let fontName = "Arial";
      if (styleSettings.fontFamily === "Impact") fontName = "Impact";
      else if (styleSettings.fontFamily === "Inter") fontName = "Arial";
      else if (styleSettings.fontFamily === "Space Grotesk") fontName = "Arial";
      else if (styleSettings.fontFamily === "Courier") fontName = "Courier New";
      else if (styleSettings.fontFamily === "Fredoka") fontName = "Arial";

      // Scale font size perfectly using the vertical ratio of real height vs display height
      const scaleX = width / dispWidth;
      const scaleY = height / dispHeight;
      const baseFontSize = Math.round((32 * (styleSettings.fontSize || 1.0)) * scaleY);

      const primaryCol = hexToASSColor(styleSettings.textColor || "#FFFFFF");
      const highlightCol = hexToASSColor(styleSettings.highlightColor || "#FACC15");

      const borderStyle = styleSettings.showBackground ? "3" : "1";
      const outlineSize = styleSettings.showBackground ? "4" : "2";
      const shadowSize = styleSettings.showBackground ? "0" : "1";

      let alignment = "2"; // bottom-center is the base for our \pos calculation

      let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
PlayDepth: 0
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${baseFontSize},${primaryCol},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,${borderStyle},${outlineSize},${shadowSize},${alignment},10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

      const formatText = (text: string) => {
        if (styleSettings.capitalization === 'all') return text.toUpperCase();
        if (styleSettings.capitalization === 'lower') return text.toLowerCase();
        if (styleSettings.capitalization === 'sentence') {
          return text.charAt(0).toUpperCase() + text.slice(1);
        }
        return text;
      };

      const spotlightDimAssColor = "&H00888888";

      words.forEach((w: any, k: number) => {
        const start = w.start_time;
        let end = w.end_time;
        if (k < words.length - 1) {
          if (words[k+1].start_time - end < 1.5) {
            end = words[k+1].start_time;
          }
        }

        const maxWords = styleSettings.maxWordsPerScreen || 1;
        const chunkIndex = Math.floor(k / maxWords);
        const startIdx = chunkIndex * maxWords;
        const endIdx = Math.min(startIdx + maxWords, words.length);

        const windowWords = words.slice(startIdx, endIdx);

        const textParts = windowWords.map((ww: any, index: number) => {
          const originalIndex = startIdx + index;
          const formattedWord = formatText(ww.word);
          
          if (originalIndex === k) {
            return `{\\c${highlightCol}\\b1}${formattedWord}`;
          } else {
            const inactiveColor = styleSettings.showSpotlight ? spotlightDimAssColor : primaryCol;
            return `{\\c${inactiveColor}\\b0}${formattedWord}`;
          }
        });

        // Calculate absolute position on the real video canvas
        const posXReal = Math.round((dispWidth / 2 + (styleSettings.positionX || 0)) * scaleX);
        const posYReal = Math.round((dispHeight - (96 + (styleSettings.positionY || 0))) * scaleY);

        const rotationAngle = parseInt(styleSettings.rotation) || 0;
        const rotationTag = rotationAngle ? `\\frz${-rotationAngle}` : "";
        const posTag = `\\pos(${posXReal},${posYReal})`;

        // Prefix dialogue line with clean positional override tags inside the style curly braces
        const textLine = `{${posTag}${rotationTag}}${textParts.join(" ")}`;
        assContent += `Dialogue: 0,${formatASSTime(start)},${formatASSTime(end)},Default,,0,0,0,,${textLine}\n`;
      });

      assPath = `${videoPath}.ass`;
      fs.writeFileSync(assPath, assContent);
      sendLog(jobId, "Subtitles file written successfully.");

      outputPath = `${videoPath}_exported.mp4`;
      sendLog(jobId, "Starting FFmpeg burning filter with ultrafast speed profile...");
      
      const relFile = path.relative(process.cwd(), videoPath);
      const relAss = path.relative(process.cwd(), assPath).replace(/'/g, "'\\''").replace(/:/g, "\\:");
      const relOutput = path.relative(process.cwd(), outputPath);

      // Execute FFmpeg with maximum optimization settings
      await execAsync(`ffmpeg -y -i "${relFile}" -vf "subtitles='${relAss}'" -preset ultrafast -c:v libx264 -crf 10 -c:a copy -threads 0 "${relOutput}"`);
      
      sendLog(jobId, "FFmpeg video export complete!");

      // Log export success to Google Sheets
      if (accessToken) {
        logActionToSheets(
          accessToken, 
          "EXPORT", 
          originalName, 
          styleSettings.preset || "N/A", 
          "SUCCESS", 
          `Burned ${words.length} subtitles onto video via server render.`
        ).catch(err => console.error("Sheets export log background failed:", err));
      }

      res.download(outputPath, "tanglish_studio_video.mp4", (err) => {
        // cleanup temp files
        if (!isLocalRef && videoPath && fs.existsSync(videoPath)) {
          try { fs.unlinkSync(videoPath); } catch (e) {}
        }
        if (assPath && fs.existsSync(assPath)) {
          try { fs.unlinkSync(assPath); } catch (e) {}
        }
        if (outputPath && fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (e) {}
        }
      });
    } catch (error: any) {
      sendLog(jobId, "Export error: " + error.message);
      console.error("Export error:", error);

      // Log export failure to Google Sheets
      if (accessToken) {
        logActionToSheets(
          accessToken, 
          "EXPORT", 
          originalName, 
          "N/A", 
          "FAILED", 
          error.message || "Unknown export error"
        ).catch(err => console.error("Sheets export log background failed:", err));
      }

      res.status(500).json({ error: "Failed to export video with subtitles" });
      
      // cleanup temp files
      if (!isLocalRef && videoPath && fs.existsSync(videoPath)) {
        try { fs.unlinkSync(videoPath); } catch (e) {}
      }
      if (assPath && fs.existsSync(assPath)) {
        try { fs.unlinkSync(assPath); } catch (e) {}
      }
      if (outputPath && fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch (e) {}
      }
    }
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
