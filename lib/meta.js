// Metadata lookups: TMDB (movies + TV) and IGDB (games, via a free Twitch developer app).
// Only factual metadata comes from here (title, year, poster, seasons).
// Ratings, reviews, notes etc. live in data/library.json.

const TMDB = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';
const IGDB = 'https://api.igdb.com/v4';
const IGDB_IMG = 'https://images.igdb.com/igdb/image/upload/t_cover_big/';

async function getJson(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) {
    const safe = url.replace(/(api_key|key)=[^&]+/, '$1=***');
    throw new Error(`${r.status} ${r.statusText} for ${safe}`);
  }
  return r.json();
}

function tmdbReq(path, params, key) {
  const url = new URL(TMDB + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }
  const init = { headers: { accept: 'application/json' } };
  if (key.startsWith('eyJ')) init.headers.Authorization = `Bearer ${key}`; // v4 read token
  else url.searchParams.set('api_key', key); // v3 key
  return getJson(url.toString(), init);
}

export async function tmdbSearch(type, query, year, key) {
  const params = { query, include_adult: 'false' };
  if (year) params[type === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = year;
  const data = await tmdbReq(type === 'movie' ? '/search/movie' : '/search/tv', params, key);
  return (data.results || []).map((r) => ({
    id: r.id,
    title: r.title || r.name,
    year: (r.release_date || r.first_air_date || '').slice(0, 4),
  }));
}

// IGDB auth: a Twitch app gives a client id + secret, which we trade for a short-lived token.
let igdbToken = null;
async function igdbAuth(keys) {
  if (!keys.igdbId || !keys.igdbSecret) throw new Error('IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not set');
  if (igdbToken && igdbToken.expires > Date.now() + 60000) return igdbToken;
  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', keys.igdbId);
  url.searchParams.set('client_secret', keys.igdbSecret);
  url.searchParams.set('grant_type', 'client_credentials');
  const r = await fetch(url, { method: 'POST' });
  if (!r.ok) throw new Error(`Twitch auth failed (${r.status}), check IGDB_CLIENT_ID / IGDB_CLIENT_SECRET`);
  const j = await r.json();
  igdbToken = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  return igdbToken;
}

async function igdbQuery(keys, body, attempt = 0) {
  const token = await igdbAuth(keys);
  const r = await fetch(`${IGDB}/games`, {
    method: 'POST',
    headers: { 'Client-ID': keys.igdbId, Authorization: `Bearer ${token.value}`, Accept: 'application/json' },
    body,
  });
  if (r.status === 429 && attempt < 4) {
    // IGDB allows ~4 requests/second; back off and retry.
    await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    return igdbQuery(keys, body, attempt + 1);
  }
  if (!r.ok) throw new Error(`IGDB ${r.status} ${r.statusText}`);
  return r.json();
}

const yearOf = (unix) => (unix ? String(new Date(unix * 1000).getUTCFullYear()) : '');

export async function igdbSearch(query, keys) {
  const q = String(query).replace(/["\\]/g, ' ');
  const rows = await igdbQuery(keys, `search "${q}"; fields name,first_release_date; limit 8;`);
  return rows.map((r) => ({ id: r.id, title: r.name, year: yearOf(r.first_release_date) }));
}

export async function resolveMeta(item, keys) {
  const q = item.query || item.title;

  if (item.type === 'game') {
    let id = item.id;
    let resolved = false;
    if (!id) {
      const found = await igdbSearch(q, keys);
      const pick = (item.year && found.find((f) => f.year === String(item.year))) || found[0];
      if (!pick) throw new Error(`no IGDB match for "${q}"`);
      id = pick.id;
      resolved = true;
    }
    const [d] = await igdbQuery(keys, `fields name,first_release_date,cover.image_id; where id = ${Number(id)};`);
    if (!d) throw new Error(`IGDB has no game with id ${id}`);
    return {
      id: d.id,
      resolved,
      title: d.name,
      year: yearOf(d.first_release_date) || null,
      poster: d.cover?.image_id ? `${IGDB_IMG}${d.cover.image_id}.jpg` : null,
    };
  }

  if (!keys.tmdb) throw new Error('TMDB_API_KEY is not set');
  let id = item.id;
  let resolved = false;
  if (!id) {
    const found = await tmdbSearch(item.type, q, item.year, keys.tmdb);
    if (!found.length) throw new Error(`no TMDB match for "${q}"`);
    id = found[0].id;
    resolved = true;
  }
  const d = await tmdbReq(`/${item.type}/${id}`, {}, keys.tmdb);
  return {
    id: d.id,
    resolved,
    title: d.title || d.name,
    year: (d.release_date || d.first_air_date || '').slice(0, 4) || null,
    poster: d.poster_path ? TMDB_IMG + d.poster_path : null,
    seasons: item.type === 'tv' ? d.number_of_seasons || null : null,
  };
}
