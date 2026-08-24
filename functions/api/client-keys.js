export async function onRequest(context) {
  let geminiKeys = [];
  let dgKeys = [];

  if (context.env) {
    for (const k in context.env) {
      if (/gemini/i.test(k) && context.env[k]) {
        geminiKeys.push(...String(context.env[k]).split(/[\s,;]+/).map(x => x.trim()).filter(Boolean));
      }
      if (/deepgram/i.test(k) && context.env[k]) {
        dgKeys.push(...String(context.env[k]).split(/[\s,;]+/).map(x => x.trim()).filter(Boolean));
      }
    }
  }

  // Fallback remote config if empty
  if (!geminiKeys.length) {
    try {
      const remoteRes = await fetch("https://raw.githubusercontent.com/shrihari52141-afk/tanglish-caption-studio/main/remote-config.json");
      if (remoteRes.ok) {
        const remoteJson = await remoteRes.json();
        const remoteKeyStr = remoteJson?.GEMINI_API_KEY || remoteJson?.GEMINI_API_KEYS || '';
        if (remoteKeyStr) {
          geminiKeys = remoteKeyStr.split(/[\s,;]+/).map(k => k.trim()).filter(Boolean);
        }
      }
    } catch {}
  }

  return new Response(JSON.stringify({
    geminiKeys,
    dgKeys,
    primaryModel: 'gemini-3.6-flash',
    fallbackModels: ['gemini-3.5-flash', 'gemini-3.5-flash-lite']
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
