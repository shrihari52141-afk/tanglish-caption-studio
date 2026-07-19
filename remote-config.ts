import fs from "fs";
import path from "path";

export type RemoteConfig = {
  GEMINI_API_KEY: string;
  trackerEmail: string;
  appAnnouncement: string;
  maintenanceMode: boolean;
  minClientVersion: string;
  updatedAt: string;
};

const CONFIG_PATH = path.join(process.cwd(), "remote-config.json");

// Detect read-only filesystems (e.g. Vercel serverless) so we never attempt
// file writes that would crash the process with EROFS.
function isReadOnlyFS(): boolean {
  try {
    const testPath = path.join(process.cwd(), ".fs-write-test");
    fs.writeFileSync(testPath, "1");
    fs.unlinkSync(testPath);
    return false;
  } catch {
    return true;
  }
}

const READ_ONLY_FS = isReadOnlyFS();

const DEFAULT_CONFIG: RemoteConfig = {
  GEMINI_API_KEY: "",
  trackerEmail: "shrihari52141@gmail.com",
  appAnnouncement: "",
  maintenanceMode: false,
  minClientVersion: "1.0.0",
  updatedAt: new Date().toISOString(),
};

let cached: RemoteConfig = { ...DEFAULT_CONFIG };
let watchStarted = false;
const listeners = new Set<() => void>();

function ensureFile() {
  if (READ_ONLY_FS) return; // skip on Vercel / read-only environments
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
    }
  } catch (err) {
    console.warn("[RemoteConfig] Cannot write config file (read-only FS):", err);
  }
}

export function loadRemoteConfig(): RemoteConfig {
  if (READ_ONLY_FS) {
    // On serverless/read-only environments, config lives entirely in env vars
    cached = { ...DEFAULT_CONFIG };
    return cached;
  }
  try {
    ensureFile();
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    cached = {
      ...DEFAULT_CONFIG,
      ...parsed,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.error("[RemoteConfig] Failed to load, using defaults/env:", err);
    cached = { ...DEFAULT_CONFIG };
  }
  return cached;
}

export function getRemoteConfig(): RemoteConfig {
  return cached;
}

export function saveRemoteConfig(partial: Partial<RemoteConfig>): RemoteConfig {
  if (READ_ONLY_FS) {
    // On read-only FS, apply changes in-memory only (no persistence)
    const next: RemoteConfig = {
      ...cached,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    cached = next;
    listeners.forEach((fn) => {
      try { fn(); } catch (e) { console.error("[RemoteConfig] listener error", e); }
    });
    console.warn("[RemoteConfig] Read-only FS: changes applied in-memory only (not persisted).");
    return next;
  }
  ensureFile();
  const next: RemoteConfig = {
    ...cached,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  cached = next;
  listeners.forEach((fn) => {
    try { fn(); } catch (e) { console.error("[RemoteConfig] listener error", e); }
  });
  console.log(`[RemoteConfig] Saved at ${next.updatedAt}`);
  return next;
}

/** Prefer remote-config value, then process.env */
export function getSecret(key: keyof RemoteConfig | string): string {
  const fromRemote = (cached as any)[key];
  if (typeof fromRemote === "string" && fromRemote.trim()) {
    return fromRemote.trim();
  }
  const fromEnv = process.env[key as string];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return "";
}

export function onRemoteConfigChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Public slice safe for browsers (no API keys) */
export function getPublicConfig() {
  return {
    appAnnouncement: cached.appAnnouncement || "",
    maintenanceMode: !!cached.maintenanceMode,
    minClientVersion: cached.minClientVersion || "1.0.0",
    updatedAt: cached.updatedAt,
    trackerEnabled: true,
  };
}

export function startRemoteConfigWatcher() {
  if (watchStarted) return;
  watchStarted = true;

  if (READ_ONLY_FS) {
    console.log("[RemoteConfig] Read-only FS detected — file watcher disabled. Using env vars only.");
    loadRemoteConfig();
    return;
  }

  ensureFile();
  loadRemoteConfig();
  try {
    fs.watch(CONFIG_PATH, { persistent: true }, (event) => {
      if (event === "change" || event === "rename") {
        setTimeout(() => {
          loadRemoteConfig();
          listeners.forEach((fn) => {
            try { fn(); } catch (e) { console.error("[RemoteConfig] watcher listener error", e); }
          });
          console.log("[RemoteConfig] Reloaded from disk (live for all users)");
        }, 150);
      }
    });
    console.log(`[RemoteConfig] Watching ${CONFIG_PATH}`);
  } catch (err) {
    console.warn("[RemoteConfig] fs.watch unavailable:", err);
  }
}
