export async function onRequest(context) {
  let geminiKeys = [];
  if (context.env) {
    for (const k in context.env) {
      if (/gemini/i.test(k) && context.env[k]) {
        geminiKeys.push(...String(context.env[k]).split(/[\s,;]+/).map(x => x.trim()).filter(Boolean));
      }
    }
  }

  const results = [];
  const testModels = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'];

  if (geminiKeys.length > 0) {
    const key = geminiKeys[0];
    const keyInfo = { index: 0, prefix: key.substring(0, 10), length: key.length, modelTests: {} };

    for (const model of testModels) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-goog-api-key': key
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hello" }] }]
          }),
          signal: AbortSignal.timeout(4000)
        });

        const status = res.status;
        const text = await res.text();
        keyInfo.modelTests[model] = { status, response: text.substring(0, 300) };
      } catch (err) {
        keyInfo.modelTests[model] = { error: err.message };
      }
    }
    results.push(keyInfo);
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
