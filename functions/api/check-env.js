export async function onRequest(context) {
  const geminiKeys = [];
  const dgKeys = [];

  if (context.env) {
    for (const key in context.env) {
      if (key.includes('GEMINI')) {
        const val = context.env[key];
        if (val) geminiKeys.push(...val.split(/[\s,]+/).filter(Boolean));
      }
      if (key.includes('DEEPGRAM')) {
        const val = context.env[key];
        if (val) dgKeys.push(...val.split(/[\s,]+/).filter(Boolean));
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
      primaryModel: "gemini-3.6-flash",
      fallbackModels: ["gemini-3.5-flash", "gemini-3.1-flash-lite"],
      activeSources: {
        gemini: geminiKeys.length > 0 ? "cloudflare_env" : "missing",
        deepgram: dgKeys.length > 0 ? "cloudflare_env" : "missing"
      },
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
