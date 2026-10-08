import crypto from 'node:crypto';
import { sb } from '../lib/supabase.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(['tv', 'movie', 'game', 'unknown']);
const STATUSES = new Set(['pending', 'approved', 'rejected']);

function authed(req) {
  const given = String(req.headers['x-admin-token'] || '');
  const want = String(process.env.ADMIN_TOKEN || '');
  if (want.length < 16) return false; // refuse to run with a weak/missing token
  // Hash both sides so the comparison is constant-time and length-independent.
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!authed(req)) {
      await new Promise((r) => setTimeout(r, 500)); // slow down guessing
      return res.status(401).json({ message: 'Wrong token.' });
    }

    if (req.method === 'GET') {
      const status = STATUSES.has(req.query?.status) ? req.query.status : 'pending';
      const r = await sb(`recs?select=id,title,type,why,notes,status,created_at&status=eq.${status}&order=created_at.desc&limit=500`);
      if (!r.ok) throw new Error(await r.text());
      return res.status(200).json(await r.json());
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const { id, action, type } = body || {};
      if (!UUID.test(String(id))) return res.status(400).json({ message: 'Bad id.' });

      if (action === 'delete') {
        const r = await sb(`recs?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
        if (!r.ok) throw new Error(await r.text());
        return res.status(200).json({ ok: true });
      }

      if (action === 'approve' || action === 'reject') {
        const patch = { status: action === 'approve' ? 'approved' : 'rejected' };
        if (action === 'approve' && TYPES.has(type)) patch.type = type;
        const r = await sb(`recs?id=eq.${id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(await r.text());
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ message: 'Unknown action.' });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error.' });
  }
}
