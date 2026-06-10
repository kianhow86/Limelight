// netlify/functions/generate.mjs
// Limelight proxy (Option B): keys server-side, one shared gate password.
// Images: try gpt-image-1 first, auto-fall back to dall-e-3 if it is rejected
// (e.g. organization not verified). No storage, no deps — bundles cleanly.
//
// Required Netlify env vars:
//   ANTHROPIC_KEY  - your Anthropic key (powers all writing)
//   GATE_PASSWORD  - one shared password; the app asks users for it once
//   OPENAI_KEY     - (optional) only if you want image generation

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad request body' }, 400); }

  if (!process.env.GATE_PASSWORD || String(body.pass || '') !== process.env.GATE_PASSWORD) {
    return json({ error: 'Wrong or missing password' }, 401);
  }

  const kind = body.kind === 'image' ? 'image' : 'text';

  // ---- TEXT (Anthropic) ----
  if (kind === 'text') {
    if (!process.env.ANTHROPIC_KEY) return json({ error: 'Server is missing its Anthropic key' }, 500);
    let up;
    try {
      up = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body.payload || {}),
      });
    } catch { return json({ error: 'Could not reach the writing service' }, 502); }
    const data = await up.json().catch(() => null);
    if (!up.ok) return json({ error: (data && data.error && data.error.message) || ('Upstream error ' + up.status) }, up.status);
    return json({ ok: true, data });
  }

  // ---- IMAGE (OpenAI: gpt-image-1 -> dall-e-3 fallback) ----
  if (!process.env.OPENAI_KEY) return json({ error: 'Image generation is not enabled on this server' }, 400);

  const src = body.payload || {};
  // 1) try as sent (gpt-image-1)
  let up = await openaiImage(src).catch(() => null);
  let data = up ? await up.json().catch(() => null) : null;

  // 2) if that failed, retry with dall-e-3 (translate params)
  if (!up || !up.ok) {
    const sizeMap = { '1536x1024': '1792x1024', '1024x1536': '1024x1792', '1024x1024': '1024x1024', 'auto': '1024x1024' };
    const d3 = {
      model: 'dall-e-3',
      prompt: src.prompt || '',
      n: 1,
      size: sizeMap[src.size] || '1024x1024',
      quality: (src.quality === 'high' || src.quality === 'hd') ? 'hd' : 'standard',
      response_format: 'b64_json',
    };
    const up2 = await openaiImage(d3).catch(() => null);
    const data2 = up2 ? await up2.json().catch(() => null) : null;
    if (up2 && up2.ok) return json({ ok: true, data: data2, model: 'dall-e-3' });
    // both failed — surface the most useful error
    const msg = (data2 && data2.error && data2.error.message) || (data && data.error && data.error.message) || 'Image generation failed';
    return json({ error: msg }, (up2 && up2.status) || (up && up.status) || 502);
  }

  return json({ ok: true, data, model: 'gpt-image-1' });
};

function openaiImage(payload) {
  return fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.OPENAI_KEY },
    body: JSON.stringify(payload),
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
