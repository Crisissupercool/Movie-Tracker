// Look up the right ID for an entry so you can pin it in data/library.json.
// Usage: node scripts/find.mjs <movie|tv|game> "<title>" [year]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';
import { tmdbSearch, igdbSearch } from '../lib/meta.js';

loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

const [type, query, year] = process.argv.slice(2);
if (!['movie', 'tv', 'game'].includes(type) || !query) {
  console.error('Usage: node scripts/find.mjs <movie|tv|game> "<title>" [year]');
  process.exit(1);
}

const keys = { tmdb: process.env.TMDB_API_KEY, igdbId: process.env.IGDB_CLIENT_ID, igdbSecret: process.env.IGDB_CLIENT_SECRET };
if (type === 'game' ? !(keys.igdbId && keys.igdbSecret) : !keys.tmdb) {
  console.error(`${type === 'game' ? 'IGDB_CLIENT_ID / IGDB_CLIENT_SECRET' : 'TMDB_API_KEY'} not set (put it in .env)`);
  process.exit(1);
}

const results = type === 'game' ? await igdbSearch(query, keys) : await tmdbSearch(type, query, year, keys.tmdb);
if (!results.length) console.log('No results.');
for (const r of results.slice(0, 8)) console.log(`${r.id}\t${r.title} (${r.year || '?'})`);
