import crypto from 'node:crypto';
import { sb } from '../lib/supabase.js';

const TYPES = new Set(['tv', 'movie', 'game', 'unknown']);
const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // Turnstile not enabled
  if (!token || typeof token !== 'string') return false;
  const form = new URLSearchParams({ secret, response: token, remoteip: ip });
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const j = await r.json();
  return !!j.success;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Public list: approved recs only. ip_hash and notes are never exposed here.
      const r = await sb('recs?select=id,title,type,why,created_at&status=eq.approved&order=created_at.desc&limit=200');
      if (!r.ok) throw new Error(await r.text());
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(await r.json());
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      body = body || {};

      // Honeypot: real people never fill this hidden field. Pretend success so bots move on.
      if (body.website) return res.status(200).json({ ok: true });

      const title = clean(body.title, 120);
      if (!title) return res.status(400).json({ message: 'Please enter a title.' });
      const type = TYPES.has(body.type) ? body.type : 'unknown';
      const why = clean(body.why, 500);
      const notes = clean(body.notes, 500);

      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
      if (!(await verifyTurnstile(body.turnstileToken, ip))) {
        return res.status(400).json({ message: 'Captcha check failed, please try again.' });
      }

      const ipHash = crypto.createHash('sha256').update(ip + (process.env.IP_SALT || '')).digest('hex').slice(0, 32);

      // Per-visitor limit: 5 per hour.
      const since = new Date(Date.now() - 3600 * 1000).toISOString();
      const recent = await sb(`recs?select=id&ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(since)}&limit=5`);
      if (!recent.ok) throw new Error(await recent.text());
      if ((await recent.json()).length >= 5) {
        return res.status(429).json({ message: 'Slow down a bit, try again in an hour.' });
      }

      // Global cap so a flood can never bury the real ones.
      const pending = await sb('recs?select=id&status=eq.pending&limit=200');
      if (!pending.ok) throw new Error(await pending.text());
      if ((await pending.json()).length >= 200) {
        return res.status(503).json({ message: 'My inbox is full right now, try again later.' });
      }

      const ins = await sb('recs', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ title, type, why: why || null, notes: notes || null, ip_hash: ipHash }),
      });
      if (!ins.ok) throw new Error(await ins.text());

      if (process.env.DISCORD_WEBHOOK_URL) {
        try {
          await fetch(process.env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `New rec: **${title.replace(/[*_`~|>@#]/g, '')}** (${type}). Check /admin`,
              allowed_mentions: { parse: [] },
            }),
          });
        } catch (e) {
          console.error('discord webhook failed', e);
        }
      }

      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Something went wrong on my side.' });
  }
}
