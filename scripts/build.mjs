// Reads data/library.json (your own fields), fetches factual metadata from TMDB/IGDB,
// and writes the merged result to public/data/library.json for the frontend.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';
import { resolveMeta } from '../lib/meta.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(root);

const keys = {
  tmdb: process.env.TMDB_API_KEY,
  igdbId: process.env.IGDB_CLIENT_ID,
  igdbSecret: process.env.IGDB_CLIENT_SECRET,
};
const TYPES = ['tv', 'movie', 'game'];
const STATUSES = ['now', 'finished', 'next'];

const slug = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) {
        const idx = i++;
        out[idx] = await fn(list[idx], idx);
      }
    }),
  );
  return out;
}

function validate(entries) {
  const problems = [];
  entries.forEach((e, i) => {
    const where = `entry #${i + 1} (${e.title || e.query || '?'})`;
    if (!TYPES.includes(e.type)) problems.push(`${where}: "type" must be one of ${TYPES.join(', ')}`);
    if (!STATUSES.includes(e.status)) problems.push(`${where}: "status" must be one of ${STATUSES.join(', ')}`);
    if (!e.id && !e.query && !e.title) problems.push(`${where}: needs "id", "query" or "title"`);
    if (e.rating != null && !(typeof e.rating === 'number' && e.rating >= 0 && e.rating <= 10))
      problems.push(`${where}: "rating" must be a number from 0 to 10 (or omitted)`);
    if (e.screenshots != null && !Array.isArray(e.screenshots))
      problems.push(`${where}: "screenshots" must be an array of paths`);
  });
  if (problems.length) {
    console.error('library.json has problems:\n- ' + problems.join('\n- '));
    process.exit(1);
  }
}

const raw = JSON.parse(await readFile(path.join(root, 'data/library.json'), 'utf8'));
const entries = Array.isArray(raw) ? raw : raw.items;
validate(entries);

if (!keys.tmdb) console.warn('! TMDB_API_KEY not set: movies/TV will have no poster or year');
if (!keys.igdbId || !keys.igdbSecret) console.warn('! IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not set: games will have no poster or year');

const items = await mapLimit(entries, 5, async (e) => {
  let meta = {};
  try {
    meta = await resolveMeta(e, keys);
    if (meta.resolved) {
      console.log(`resolved "${e.query || e.title}" -> ${meta.title} (${meta.year || '?'}), id ${meta.id}  (pin it with "id": ${meta.id})`);
    }
  } catch (err) {
    console.warn(`! metadata failed for "${e.query || e.title || e.id}": ${err.message}`);
  }
  const title = e.title || meta.title || e.query || String(e.id);
  return {
    key: `${e.type}-${slug(title)}`,
    type: e.type,
    status: e.status,
    recommended: !!e.recommended,
    rating: e.rating ?? null,
    review: e.review || '',
    replay: !!e.replay,
    note: e.note || '',
    platform: e.platform || '',
    screenshots: e.screenshots || [],
    title,
    year: meta.year || (e.year ? String(e.year) : null),
    poster: meta.poster || null,
    seasons: meta.seasons || null,
  };
});

const seen = new Set();
for (const it of items) {
  if (seen.has(it.key)) {
    console.error(`Duplicate entry: ${it.key}`);
    process.exit(1);
  }
  seen.add(it.key);
}

const outDir = path.join(root, 'public/data');
await mkdir(outDir, { recursive: true });
await writeFile(
  path.join(outDir, 'library.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 1),
);
console.log(`Wrote ${items.length} items to public/data/library.json`);
