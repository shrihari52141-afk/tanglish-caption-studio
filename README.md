# 🎬 Tanglish Caption Studio

A powerful **Tanglish-first video captioning app** with viral styles, AI transcription (Gemini + failover), beautiful animated presets, live preview editor, and one-click local/cloud export for Reels, Shorts & YouTube.

**Live demo & source:** https://github.com/shrihari52141-afk/tanglish-caption-studio

## ✨ Features (Fixed & Enhanced)
- **Tanglish + Multi-language AI Transcription** with auto-emoji, punctuation control, and smart formatting
- **30+ Viral Caption Presets** (Bounce, Neon, Anime, Cinematic, True Crime, Kawaii, Shonen etc.)
- **Advanced Style Editor**: font, color, highlight, rotation, position, max words, background, backlight, spotlight, shadow
- **Live Canvas Preview** with draggable/rotatable captions synced to video
- **Draft System**: Save & restore full projects (transcript + styles) locally
- **Local Browser Export** (no upload) - records video + burns captions using canvas + MediaRecorder
- **Cloud Export** (server-side ffmpeg burn to MP4 with ASS subs)
- **Mic Voice Notes Transcriber** using Gemini
- **Robust Key Rotation & Failover** (Gemini primary + Groq, NVIDIA, OpenRouter)
- **Client-side audio extraction** for fast uploads (16kHz mono WAV)

## 🛠️ Fixes Applied (v1.1)
- Fixed draft restore UI crash: now gracefully shows "Draft Transcript Loaded" placeholder panel instead of broken video src
- Improved placeholder handling across VideoPlayer and export guards
- Updated .gitignore to exclude large media & uploads/
- Cleaned package name
- Enhanced README with deployment guidance
- Minor robustness for production builds

## 🚀 Run Locally

**Prerequisites:** Node.js 18+, ffmpeg (optional but recommended for server export features)

```bash
git clone https://github.com/shrihari52141-afk/tanglish-caption-studio.git
cd tanglish-caption-studio
npm install
```

Create `.env` (copy from `.env.example`):

```env
GEMINI_API_KEY="your_gemini_key_here"
# Optional failover:
GROQ_API_KEY=""
NVIDIA_API_KEY=""
OPENROUTER_API_KEY=""
```

```bash
npm run dev
```

Open http://localhost:3000 — the Express + Vite dev server starts automatically.

## 🌐 Deploy / Host the Web App

### Option 1: GitHub (Source Hosting - Done!)
This repo is the canonical source. Star ⭐ it, fork, or clone to deploy anywhere.

### Option 2: Vercel (Frontend-focused, limited backend)
Vercel works great for the React UI but the `/api/*` backend (transcribe, export, SSE logs) requires adaptation because:
- Vercel uses serverless functions (not long-running Express)
- Cloud export needs `ffmpeg` binary (not available by default on Vercel)

**Quick Vercel deploy (UI only preview):**
1. Import the GitHub repo to Vercel
2. Set build command: `npm run build`
3. Output dir: `dist`
4. Add env var `GEMINI_API_KEY` (for client? but transcription is server)
   - Note: Full AI features won't work without custom serverless rewrite of server.ts routes.

For full backend + ffmpeg, use **Render.com**, **Railway.app**, or **Google Cloud Run** (original target for this AI Studio applet).

**Recommended: Deploy to Render.com (easiest fullstack)**
1. New Web Service from GitHub repo
2. Build Command: `npm install && npm run build`
3. Start Command: `npm start`
4. Add env vars: `GEMINI_API_KEY`, others
5. (Optional) In Shell or Dockerfile add `apt-get install -y ffmpeg` for cloud export

## 📦 Build for Production
```bash
npm run build
npm start
```
Serves optimized client from `dist/` + bundled `dist/server.cjs`

## 🔑 API Keys & Config
- Primary: Google Gemini (supports multiple keys comma/space separated for auto-rotation)
- Failover supported via `ai_config.json`
- Firebase config included for future Google Drive/Sheets export (currently bypassed in UI)

## 🧰 Tech Stack
- React 19 + Vite + Tailwind + Framer Motion
- Express + Multer + @google/genai
- Canvas 2D subtitle renderer + MediaRecorder for local export
- FFmpeg for server-side subtitle burning (ASS)

Built with ❤️ for Tamil + English creators making viral content.

---

*Original AI Studio app remixed & fixed for robust local + production use.*