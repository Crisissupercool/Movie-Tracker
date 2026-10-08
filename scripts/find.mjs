// Look up the right ID for an entry so you can pin it in data/library.json.
// Usage: node scripts/find.mjs <movie|tv|game> "<title>" [year]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';
import { tmdbSearch, rawgSearch } from '../lib/meta.js';

loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

const [type, query, year] = process.argv.slice(2);
if (!['movie', 'tv', 'game'].includes(type) || !query) {
  console.error('Usage: node scripts/find.mjs <movie|tv|game> "<title>" [year]');
  process.exit(1);
}

const key = type === 'game' ? process.env.RAWG_API_KEY : process.env.TMDB_API_KEY;
if (!key) {
  console.error(`${type === 'game' ? 'RAWG_API_KEY' : 'TMDB_API_KEY'} is not set (put it in .env)`);
  process.exit(1);
}

const results = type === 'game' ? await rawgSearch(query, key) : await tmdbSearch(type, query, year, key);
if (!results.length) console.log('No results.');
for (const r of results.slice(0, 8)) console.log(`${r.id}\t${r.title} (${r.year || '?'})`);
