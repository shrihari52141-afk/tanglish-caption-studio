/** Client-side session metrics + optional geolocation for upload tracking */

const SESSION_KEY = "tanglish_session_id";
const FAIL_KEY = "tanglish_session_fails";

export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `sess_${Date.now().toString(36)}`;
  }
}

export function getSessionFailCount(): number {
  try {
    return parseInt(sessionStorage.getItem(FAIL_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

export function incrementSessionFails(): number {
  const n = getSessionFailCount() + 1;
  try {
    sessionStorage.setItem(FAIL_KEY, String(n));
  } catch {
    /* ignore */
  }
  return n;
}

export type ClientLocation = {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  source?: string;
} | null;

export function requestClientLocation(timeoutMs = 4000): Promise<ClientLocation> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: "browser-geolocation",
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: timeoutMs }
    );
  });
}

export async function buildTrackerClientMeta(partial?: {
  durationSeconds?: number | null;
  title?: string;
}) {
  const location = await requestClientLocation();
  return {
    sessionId: getSessionId(),
    sessionFailCount: getSessionFailCount(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    language: navigator.language || "",
    userAgent: navigator.userAgent || "",
    location,
    durationSeconds: partial?.durationSeconds ?? null,
    title: partial?.title || "",
  };
}

/** Probe media duration in the browser */
export function probeMediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const isAudio = file.type.startsWith("audio/");
      const el = document.createElement(isAudio ? "audio" : "video");
      el.preload = "metadata";
      const done = (val: number | null) => {
        URL.revokeObjectURL(url);
        resolve(val);
      };
      el.onloadedmetadata = () => {
        const d = el.duration;
        done(Number.isFinite(d) ? d : null);
      };
      el.onerror = () => done(null);
      setTimeout(() => done(null), 5000);
      el.src = url;
    } catch {
      resolve(null);
    }
  });
}
