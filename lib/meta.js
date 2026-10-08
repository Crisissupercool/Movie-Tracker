// Metadata lookups: TMDB (movies + TV) and RAWG (games).
// Only factual metadata comes from here (title, year, poster, seasons).
// Ratings, reviews, notes etc. live in data/library.json.

const TMDB = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';
const RAWG = 'https://api.rawg.io/api';

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

export async function rawgSearch(query, key) {
  const url = `${RAWG}/games?search=${encodeURIComponent(query)}&search_precise=true&page_size=8&key=${encodeURIComponent(key)}`;
  const data = await getJson(url);
  return (data.results || []).map((r) => ({
    id: r.id,
    title: r.name,
    year: (r.released || '').slice(0, 4),
  }));
}

export async function resolveMeta(item, keys) {
  const q = item.query || item.title;

  if (item.type === 'game') {
    if (!keys.rawg) throw new Error('RAWG_API_KEY is not set');
    let id = item.id;
    let resolved = false;
    if (!id) {
      const found = await rawgSearch(q, keys.rawg);
      const pick = (item.year && found.find((f) => f.year === String(item.year))) || found[0];
      if (!pick) throw new Error(`no RAWG match for "${q}"`);
      id = pick.id;
      resolved = true;
    }
    const d = await getJson(`${RAWG}/games/${encodeURIComponent(id)}?key=${encodeURIComponent(keys.rawg)}`);
    return {
      id: d.id,
      resolved,
      title: d.name,
      year: (d.released || '').slice(0, 4) || null,
      poster: d.background_image || null,
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
