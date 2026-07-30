export async function onRequest(context) {
  const envDetails = {};
  const geminiKeys = [];
  const dgKeys = [];

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
        geminiKeys.push(...str.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean));
      }
      if (/deepgram/i.test(key) && str.trim()) {
        dgKeys.push(...str.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean));
      }
    }
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      hasGeminiKeys: geminiKeys.length > 0,
      geminiKeysCount: geminiKeys.length,
      hasDeepgramKeys: dgKeys.length > 0,
      deepgramKeysCount: dgKeys.length,
      envDetails,
      primaryModel: "gemini-3.6-flash",
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
