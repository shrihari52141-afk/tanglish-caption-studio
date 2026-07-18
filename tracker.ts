import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { getRemoteConfig, getSecret } from "./remote-config";

export type TrackerEvent = {
  event: "upload" | "upload_failed" | "export" | "export_failed" | "mic" | "session_ping";
  timestamp: string;
  sessionId?: string;
  // media
  title?: string;
  filename?: string;
  mediaType?: string;
  mediaSizeBytes?: number;
  durationSeconds?: number | null;
  // user / client
  userAgent?: string;
  language?: string;
  timezone?: string;
  clientIp?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    city?: string;
    region?: string;
    country?: string;
    source?: string;
  } | null;
  // processing
  aiProvider?: string;
  aiModel?: string;
  processingMs?: number;
  sessionFailCount?: number;
  wordCount?: number;
  transcriptPreview?: string;
  fullTranscript?: string;
  // options
  uploadOptions?: Record<string, any>;
  styleSettings?: Record<string, any>;
  errorMessage?: string;
  extra?: Record<string, any>;
};

const LOG_DIR = path.join(process.cwd(), "tracker-logs");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function appendJsonLog(event: TrackerEvent) {
  try {
    ensureLogDir();
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(LOG_DIR, `tracker-${day}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(event) + "\n", "utf8");
  } catch (err) {
    console.error("[Tracker] Failed to write log file:", err);
  }
}

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "unknown";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

function buildEmailHtml(event: TrackerEvent): string {
  const rows: [string, string][] = [
    ["Event", event.event],
    ["Time (UTC)", event.timestamp],
    ["Session ID", event.sessionId || "—"],
    ["Title / Filename", event.title || event.filename || "—"],
    ["Media type", event.mediaType || "—"],
    ["Media size", event.mediaSizeBytes != null ? `${(event.mediaSizeBytes / (1024 * 1024)).toFixed(2)} MB` : "—"],
    ["Media length", formatDuration(event.durationSeconds)],
    ["AI provider", event.aiProvider || "—"],
    ["AI model", event.aiModel || "—"],
    ["Processing time", event.processingMs != null ? `${(event.processingMs / 1000).toFixed(1)}s` : "—"],
    ["Session failures", String(event.sessionFailCount ?? 0)],
    ["Word count", String(event.wordCount ?? "—")],
    ["Client IP", event.clientIp || "—"],
    ["Timezone", event.timezone || "—"],
    ["Browser language", event.language || "—"],
    ["User-Agent", event.userAgent || "—"],
  ];

  if (event.location) {
    const loc = event.location;
    rows.push([
      "Location",
      [
        loc.city,
        loc.region,
        loc.country,
        loc.latitude != null && loc.longitude != null
          ? `(${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}) ±${loc.accuracy ?? "?"}m`
          : null,
        loc.source ? `source=${loc.source}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    ]);
  }

  if (event.uploadOptions) {
    rows.push(["Upload options", `<pre style="white-space:pre-wrap;margin:0">${escapeHtml(JSON.stringify(event.uploadOptions, null, 2))}</pre>`]);
  }
  if (event.styleSettings) {
    rows.push(["Style settings", `<pre style="white-space:pre-wrap;margin:0">${escapeHtml(JSON.stringify(event.styleSettings, null, 2))}</pre>`]);
  }
  if (event.errorMessage) {
    rows.push(["Error", escapeHtml(event.errorMessage)]);
  }
  if (event.fullTranscript) {
    rows.push([
      "Full transcript",
      `<pre style="white-space:pre-wrap;max-height:400px;overflow:auto;margin:0;background:#111;color:#eee;padding:8px;border-radius:6px">${escapeHtml(event.fullTranscript.slice(0, 15000))}</pre>`,
    ]);
  } else if (event.transcriptPreview) {
    rows.push(["Transcript preview", escapeHtml(event.transcriptPreview)]);
  }
  if (event.extra) {
    rows.push(["Extra", `<pre style="white-space:pre-wrap;margin:0">${escapeHtml(JSON.stringify(event.extra, null, 2))}</pre>`]);
  }

  const trs = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;border:1px solid #333;font-weight:700;vertical-align:top;width:180px;color:#f0abfc">${k}</td><td style="padding:8px 12px;border:1px solid #333;color:#eee">${v}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#fff;padding:16px">
  <h2 style="color:#e879f9;margin:0 0 8px">Tanglish Caption Studio — Tracker</h2>
  <p style="color:#aaa;margin:0 0 16px">Automatic report when a user uploads / processes media.</p>
  <table style="border-collapse:collapse;width:100%;max-width:800px;background:#161616">${trs}</table>
  <p style="color:#666;font-size:12px;margin-top:16px">Log also saved under tracker-logs/ on the server.</p>
</body></html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailText(event: TrackerEvent): string {
  return [
    `Tanglish Tracker: ${event.event}`,
    `Time: ${event.timestamp}`,
    `Session: ${event.sessionId || "—"}`,
    `Title: ${event.title || event.filename || "—"}`,
    `Duration: ${formatDuration(event.durationSeconds)}`,
    `AI: ${event.aiProvider || "—"} / ${event.aiModel || "—"}`,
    `Process: ${event.processingMs != null ? (event.processingMs / 1000).toFixed(1) + "s" : "—"}`,
    `Fails this session: ${event.sessionFailCount ?? 0}`,
    `IP: ${event.clientIp || "—"}`,
    event.location ? `Location: ${JSON.stringify(event.location)}` : "",
    event.uploadOptions ? `Options: ${JSON.stringify(event.uploadOptions)}` : "",
    event.errorMessage ? `Error: ${event.errorMessage}` : "",
    event.fullTranscript ? `Transcript:\n${event.fullTranscript.slice(0, 8000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendViaSmtp(to: string, subject: string, html: string, text: string) {
  const user = process.env.SMTP_USER || process.env.TRACKER_SMTP_USER || "";
  const pass = process.env.SMTP_PASS || process.env.TRACKER_SMTP_PASS || "";
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);

  if (!user || !pass) {
    return { ok: false, reason: "SMTP not configured (set SMTP_USER + SMTP_PASS in .env)" };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Tanglish Tracker" <${user}>`,
    to,
    subject,
    text,
    html,
  });
  return { ok: true };
}

/** Fallback: FormSubmit (activates after first confirmation email) */
async function sendViaFormSubmit(to: string, subject: string, text: string, html: string) {
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        subject,
        message: text,
        html,
        _template: "table",
        _captcha: "false",
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `FormSubmit ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err.message || String(err) };
  }
}

export async function trackEvent(event: TrackerEvent): Promise<void> {
  const full: TrackerEvent = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  };

  appendJsonLog(full);

  const cfg = getRemoteConfig();
  const to =
    (cfg.trackerEmail && cfg.trackerEmail.trim()) ||
    process.env.TRACKER_EMAIL ||
    "shrihari52141@gmail.com";

  const subject = `[Tanglish] ${full.event.toUpperCase()} — ${full.title || full.filename || "media"} — ${full.sessionId || "session"}`;
  const html = buildEmailHtml(full);
  const text = buildEmailText(full);

  // Prefer SMTP; fall back to FormSubmit so zero-config still attempts delivery
  try {
    const smtp = await sendViaSmtp(to, subject, html, text);
    if (smtp.ok) {
      console.log(`[Tracker] Email sent via SMTP → ${to} (${full.event})`);
      return;
    }
    console.warn(`[Tracker] SMTP skip: ${smtp.reason}`);

    if (process.env.TRACKER_DISABLE_FORMSUBMIT === "1") {
      console.warn("[Tracker] FormSubmit disabled; event logged to tracker-logs only");
      return;
    }

    const fsRes = await sendViaFormSubmit(to, subject, text, html);
    if (fsRes.ok) {
      console.log(`[Tracker] Email sent via FormSubmit → ${to} (${full.event})`);
    } else {
      console.warn(`[Tracker] FormSubmit failed: ${fsRes.reason}. Event saved under tracker-logs/`);
    }
  } catch (err) {
    console.error("[Tracker] Email error (event still logged):", err);
  }
}

export function getClientIp(req: { headers: any; socket?: any; ip?: string }): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]);
  return req.ip || req.socket?.remoteAddress || "";
}

export async function lookupIpGeo(ip: string): Promise<TrackerEvent["location"]> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return { source: "local", city: "Local network" };
  }
  try {
    // Free, no key; best-effort only
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { source: "ip-lookup-failed" };
    const data: any = await res.json();
    return {
      city: data.city,
      region: data.region,
      country: data.country_name || data.country,
      latitude: data.latitude,
      longitude: data.longitude,
      source: "ipapi.co",
    };
  } catch {
    return { source: "ip-lookup-error" };
  }
}

export function wordsToTranscript(words: { word?: string }[]): string {
  return (words || [])
    .map((w) => String(w.word || "").trim())
    .filter(Boolean)
    .join(" ");
}
