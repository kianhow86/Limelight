// Limelight sync — stores a club's meetings under a short code.
// Deploy alongside your existing generate.js. Requires @netlify/blobs.
//   npm i @netlify/blobs
import { getStore } from '@netlify/blobs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Unambiguous alphabet — no O/0, I/1, so codes are easy to read aloud or write down.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
function clean(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: CORS });

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Bad JSON' }), { status: 400, headers: CORS }); }

  const store = getStore('limelight-sync');
  const action = body.action;

  try {
    // ── PUSH ── upload this device's data, minting a code on first use
    if (action === 'push') {
      let code = clean(body.code);
      if (!code) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const candidate = makeCode();
          if (!(await store.get(candidate))) { code = candidate; break; }
        }
        if (!code) return new Response(JSON.stringify({ error: 'Could not allocate a code, try again' }), { status: 503, headers: CORS });
      }
      const payload = {
        club: body.club || null,
        meetings: Array.isArray(body.meetings) ? body.meetings.slice(0, 40) : [],
        voice: body.voice || '',
        updatedAt: Date.now()
      };
      await store.setJSON(code, payload);
      return new Response(JSON.stringify({ ok: true, code, updatedAt: payload.updatedAt, count: payload.meetings.length }), { status: 200, headers: CORS });
    }

    // ── PULL ── fetch everything stored under a code
    if (action === 'pull') {
      const code = clean(body.code);
      if (code.length !== 6) return new Response(JSON.stringify({ error: 'A sync code is 6 characters' }), { status: 400, headers: CORS });
      const data = await store.get(code, { type: 'json' });
      if (!data) return new Response(JSON.stringify({ error: 'No data found for that code' }), { status: 404, headers: CORS });
      return new Response(JSON.stringify({ ok: true, code, ...data }), { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500, headers: CORS });
  }
};
