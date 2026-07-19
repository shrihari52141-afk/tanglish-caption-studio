// Vercel serverless function entry.
// Uses the built server bundle (dist/server.cjs) to avoid TS ESM resolution issues.
import serverCjs from "../dist/server.cjs";
const { startServer, app } = serverCjs as {
  startServer: () => Promise<void>;
  app: any;
};

let ready: Promise<void> | null = null;
function ensureApp() {
  if (!ready) {
    ready = startServer().then(() => undefined).catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export default async function handler(req: any, res: any) {
  await ensureApp();
  return app(req, res);
}
