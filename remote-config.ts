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
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
  }
}

export function loadRemoteConfig(): RemoteConfig {
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

export function saveRemoteConfig( partial: Partial<RemoteConfig>): RemoteConfig {
  ensureFile();
  const next: RemoteConfig = {
    ...cached,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  cached = next;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("[RemoteConfig] listener error", e);
    }
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
  ensureFile();
  loadRemoteConfig();
  try {
    fs.watch(CONFIG_PATH, { persistent: true }, (event) => {
      if (event === "change" || event === "rename") {
        // debounce slightly
        setTimeout(() => {
          loadRemoteConfig();
          listeners.forEach((fn) => {
            try {
              fn();
            } catch (e) {
              console.error("[RemoteConfig] watcher listener error", e);
            }
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
