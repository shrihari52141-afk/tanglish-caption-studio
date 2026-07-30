export async function onRequest(context) {
  const geminiKeys = [];
  const dgKeys = [];
  const foundEnvKeys = [];

  if (context.env) {
    for (const key in context.env) {
      foundEnvKeys.push(key);
      const val = context.env[key];
      if (/gemini/i.test(key) && val) {
        geminiKeys.push(...String(val).split(/[\s,]+/).map(k => k.trim()).filter(Boolean));
      }
      if (/deepgram/i.test(key) && val) {
        dgKeys.push(...String(val).split(/[\s,]+/).map(k => k.trim()).filter(Boolean));
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
      foundEnvNames: foundEnvKeys,
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
