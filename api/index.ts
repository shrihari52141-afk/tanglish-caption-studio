// Vercel serverless function entry.
// Imports the Express app from server.ts and mounts it.
// On Vercel, server.ts does NOT call app.listen() (guarded by process.env.VERCEL),
// so we call startServer() here to initialize the app + remote config watcher.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { startServer, app } from "../server.ts";

// Initialize the app once (module-level, reused across warm invocations).
let ready: Promise<void> | null = null;
function ensureApp() {
  if (!ready) {
    ready = startServer().then(() => undefined).catch((e) => {
      ready = null; // allow retry on next request
      throw e;
    });
  }
  return ready;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureApp();
  return app(req, res);
}
