// netlify/functions/admin.mjs
// Issue, disable, or list Limelight access codes. Gated by ADMIN_SECRET.
// You run this yourself (e.g. via curl) after someone donates / pays.
//
// Required Netlify env var:
//   ADMIN_SECRET  - a long random string only you know
//
// Examples (replace YOURSITE and the secret):
//   Add a user with a 60/month cap:
//     curl -s https://YOURSITE.netlify.app/.netlify/functions/admin \
//       -H 'Content-Type: application/json' \
//       -d '{"secret":"YOUR_ADMIN_SECRET","action":"add","name":"Lydia","limit":60}'
//     -> returns the generated access code to hand to that user
//
//   Disable a user (they stopped paying):
//     curl ... -d '{"secret":"...","action":"disable","code":"THECODE"}'
//
//   List everyone and their usage:
//     curl ... -d '{"secret":"...","action":"list"}'

import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'Bad body' }, 400); }

  if (!process.env.ADMIN_SECRET || b.secret !== process.env.ADMIN_SECRET) {
    return json({ error: 'Not authorised' }, 403);
  }

  const users = getStore('limelight-users');
  const period = new Date().toISOString().slice(0, 7);

  if (b.action === 'add') {
    const code = (b.code && String(b.code)) || genCode();
    const rec = { name: b.name || '', limit: Number(b.limit) || 60, used: 0, period, active: true };
    await users.set(code, JSON.stringify(rec));
    return json({ ok: true, code, record: rec });
  }

  if (b.action === 'disable' || b.action === 'enable') {
    const code = String(b.code || '').trim();
    let rec; try { rec = await users.get(code, { type: 'json' }); } catch { rec = null; }
    if (!rec) return json({ error: 'No such code' }, 404);
    rec.active = b.action === 'enable';
    await users.set(code, JSON.stringify(rec));
    return json({ ok: true, code, record: rec });
  }

  if (b.action === 'setlimit') {
    const code = String(b.code || '').trim();
    let rec; try { rec = await users.get(code, { type: 'json' }); } catch { rec = null; }
    if (!rec) return json({ error: 'No such code' }, 404);
    rec.limit = Number(b.limit) || rec.limit;
    await users.set(code, JSON.stringify(rec));
    return json({ ok: true, code, record: rec });
  }

  if (b.action === 'list') {
    const out = [];
    const { blobs } = await users.list();
    for (const e of blobs) {
      let rec; try { rec = await users.get(e.key, { type: 'json' }); } catch { rec = null; }
      if (rec) out.push({ code: e.key, ...rec });
    }
    return json({ ok: true, users: out });
  }

  return json({ error: 'Unknown action' }, 400);
};

function genCode() {
  // readable, hard-to-guess: LL-XXXX-XXXX
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const p = (n) => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join('');
  return 'LL-' + p(4) + '-' + p(4);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
