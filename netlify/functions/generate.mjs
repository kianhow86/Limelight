// netlify/functions/generate.mjs
// Limelight backend proxy: validates a per-user access code, enforces a
// monthly per-user generation cap, then calls Anthropic (text) or OpenAI
// (images) with keys that live ONLY on the server (never in the HTML).
//
// Required Netlify env vars:
//   ANTHROPIC_KEY   - your Anthropic API key (powers all writing)
//   OPENAI_KEY      - (optional) OpenAI key, only if you want hosted image gen
//
// User records are stored in Netlify Blobs under store "limelight-users":
//   key = access code, value = { name, limit, used, period, active }

import { getStore } from '@netlify/blobs';

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

  const code = String(body.accessCode || '').trim();
  if (!code) return json({ error: 'Missing access code' }, 401);

  const users = getStore('limelight-users');
  let rec;
  try { rec = await users.get(code, { type: 'json' }); } catch { rec = null; }
  if (!rec || rec.active === false) return json({ error: 'Invalid or disabled access code' }, 401);

  // monthly reset
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  if (rec.period !== period) { rec.period = period; rec.used = 0; }

  const limit = rec.limit || 60;
  if ((rec.used || 0) >= limit) {
    return json({ error: 'Monthly limit reached (' + limit + '). It resets on the 1st.', limitReached: true, used: rec.used, limit }, 429);
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

  // only count a SUCCESSFUL generation against the cap
  rec.used = (rec.used || 0) + 1;
  try { await users.set(code, JSON.stringify(rec)); } catch { /* best-effort metering */ }

  return json({ ok: true, used: rec.used, limit, data });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
