export async function onRequest(context) {
  const envDetails = {};
  let geminiKeys = [];
  let dgKeys = [];
  let geminiSource = 'missing';

  if (context.env) {
    for (const key in context.env) {
      const val = context.env[key];
      const type = typeof val;
      let str = '';
      if (val != null) {
        if (typeof val === 'string') {
          str = val;
        } else if (typeof val === 'object' && val.get) {
          try { str = await val.get(); } catch (e) { str = String(val); }
        } else {
          str = String(val);
        }
      }

      envDetails[key] = {
        type,
        length: str.length,
        prefix: str.substring(0, 6) + '...'
      };

      if (/gemini/i.test(key) && str.trim()) {
        const parsed = str.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean);
        if (parsed.length) {
          geminiKeys.push(...parsed);
          geminiSource = 'cloudflare_env';
        }
      }
      if (/deepgram/i.test(key) && str.trim()) {
        dgKeys.push(...str.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean));
      }
    }
  }

  // Fallback: If Cloudflare environment variable GEMINI_API_KEYS is empty, fetch remote-config key pool
  if (!geminiKeys.length) {
    try {
      const remoteRes = await fetch("https://raw.githubusercontent.com/shrihari52141-afk/tanglish-caption-studio/main/remote-config.json");
      if (remoteRes.ok) {
        const remoteJson = await remoteRes.json();
        const remoteKeyStr = remoteJson?.GEMINI_API_KEY || remoteJson?.GEMINI_API_KEYS || '';
        if (remoteKeyStr) {
          geminiKeys = remoteKeyStr.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean);
          geminiSource = 'remote_config_fallback_pool';
        }
      }
    } catch (err) {
      console.warn("Remote key pool fetch failed:", err);
    }
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      hasGeminiKeys: geminiKeys.length > 0,
      geminiKeysCount: geminiKeys.length,
      geminiKeySource: geminiSource,
      hasDeepgramKeys: dgKeys.length > 0,
      deepgramKeysCount: dgKeys.length,
      envDetails,
      primaryModel: "gemini-3.6-flash",
      fallbackModels: ["gemini-3.5-flash", "gemini-3.1-flash-lite"],
      timestamp: new Date().toISOString()
    }, null, 2),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    }
  );
}
