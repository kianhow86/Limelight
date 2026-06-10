// netlify/functions/generate.mjs
// Limelight proxy (Option B): keys stay server-side, one shared gate password.
// No storage, no per-user login, no dependencies — bundles cleanly.
//
// Required Netlify env vars:
//   ANTHROPIC_KEY  - your Anthropic key (powers all writing)
//   GATE_PASSWORD  - one shared password; the app asks users for it once
//   OPENAI_KEY     - (optional) only if you want hosted image generation

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

  // shared gate
  if (!process.env.GATE_PASSWORD || String(body.pass || '') !== process.env.GATE_PASSWORD) {
    return json({ error: 'Wrong or missing password' }, 401);
  }

  const kind = body.kind === 'image' ? 'image' : 'text';
  let upstream;
  try {
    if (kind === 'image') {
      if (!process.env.OPENAI_KEY) return json({ error: 'Image generation is not enabled on this server' }, 400);
      upstream = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.OPENAI_KEY },
        body: JSON.stringify(body.payload || {}),
      });
    } else {
      if (!process.env.ANTHROPIC_KEY) return json({ error: 'Server is missing its Anthropic key' }, 500);
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body.payload || {}),
      });
    }
  } catch {
    return json({ error: 'Could not reach the generation service' }, 502);
  }

  let data;
  try { data = await upstream.json(); } catch { data = null; }
  if (!upstream.ok) {
    return json({ error: (data && data.error && data.error.message) || ('Upstream error ' + upstream.status) }, upstream.status);
  }
  return json({ ok: true, data });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
