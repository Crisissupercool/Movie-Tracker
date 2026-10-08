import { CONFIG } from './config.js';

const TYPES = {
  tv: { label: 'TV shows', icon: '📺', name: 'TV' },
  movie: { label: 'Movies', icon: '🎬', name: 'Movies' },
  game: { label: 'Games', icon: '🎮', name: 'Games' },
};
const TYPE_ORDER = ['tv', 'movie', 'game'];

const $ = (sel) => document.querySelector(sel);

// All text goes in via textContent, never innerHTML.
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

const state = {
  library: [],
  visitorRecs: [],
  visitorFailed: false,
  merged: window.matchMedia('(max-width: 720px)').matches,
  pinFinished: null,
  pinRecs: null,
  pinBrowse: null,
  showAll: false,
  query: '',
};

/* ---------- helpers ---------- */

const ratingClass = (r) => (r >= 9 ? 'r-hi' : r >= 7 ? 'r-mid' : r >= 5 ? 'r-ok' : 'r-lo');

function sortPinned(items, pin) {
  if (!pin) return items;
  return [...items.filter((i) => i.type === pin), ...items.filter((i) => i.type !== pin)];
}

// Segmented control: click a category to put it first, click again to clear.
function segmented(container, current, onChange) {
  const opts = [{ value: null, label: 'All' }, ...TYPE_ORDER.map((t) => ({ value: t, label: TYPES[t].icon, title: TYPES[t].name }))];
  container.replaceChildren(
    ...opts.map((o) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(current === o.value),
        title: o.title ? `${o.title} first` : 'No pin',
        'aria-label': o.title ? `${o.title} first` : 'All',
        text: o.label,
        onclick: () => onChange(current === o.value ? null : o.value),
      }),
    ),
  );
}

function ratingBadge(item) {
  if (item.rating == null) return h('span', { class: 'badge muted', text: 'not rated yet' });
  return h('span', { class: `badge ${ratingClass(item.rating)}`, text: `${item.rating}/10` });
}

function card(item, { showRating = true } = {}) {
  const meta = [
    item.year,
    item.platform,
    item.seasons ? `${item.seasons} season${item.seasons > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');

  const poster = item.poster
    ? h('img', { class: 'poster', src: item.poster, alt: '', loading: 'lazy' })
    : h('div', { class: 'poster ph', text: TYPES[item.type].icon });

  const hasMore = item.review || (item.screenshots && item.screenshots.length);

  return h(
    'button',
    { class: 'card', type: 'button', onclick: () => openItem(item.key) },
    poster,
    h(
      'div',
      { class: 'info' },
      h('div', { class: 'title', text: item.title }),
      meta && h('div', { class: 'meta', text: meta }),
      h(
        'div',
        { class: 'badges' },
        showRating && ratingBadge(item),
        item.replay && h('span', { class: 'badge', text: 'Replay' }),
        hasMore && h('span', { class: 'badge link', text: 'Open review' }),
      ),
      item.note && h('div', { class: 'note', text: item.note }),
    ),
  );
}

function fillCards(container, items, opts) {
  container.replaceChildren(...items.map((i) => card(i, opts)));
}

/* ---------- sections ---------- */

function renderNow() {
  const items = state.library.filter((i) => i.status === 'now');
  $('#now').hidden = items.length === 0;
  fillCards($('#now-list'), items);
}

function renderFinished() {
  const finished = state.library.filter((i) => i.status === 'finished');
  $('#finished').hidden = finished.length === 0;
  const body = $('#finished-body');
  const pins = $('#finished-pins');
  const merge = $('#merge');

  merge.setAttribute('aria-pressed', String(state.merged));
  merge.querySelector('.merge-label').textContent = state.merged ? 'Split' : 'Combine';
  merge.title = state.merged ? 'Split back into categories' : 'Combine all categories into one list';
  pins.hidden = !state.merged;

  if (state.merged) {
    segmented(pins, state.pinFinished, (v) => { state.pinFinished = v; renderFinished(); });
    const all = sortPinned(finished, state.pinFinished);
    const limit = CONFIG.recentLimit * 3;
    const shown = state.showAll ? all : all.slice(0, limit);
    const list = h('div', { class: 'cards' });
    fillCards(list, shown);
    body.replaceChildren(list, moreButton(Math.max(0, all.length - limit)));
    return;
  }

  const cols = h('div', { class: 'cols' });
  let overflow = 0; // items beyond the per-category limit
  for (const t of TYPE_ORDER) {
    const all = finished.filter((i) => i.type === t);
    if (!all.length) continue;
    overflow += Math.max(0, all.length - CONFIG.recentLimit);
    const shown = state.showAll ? all : all.slice(0, CONFIG.recentLimit);
    const list = h('div', { class: 'cards' });
    fillCards(list, shown);
    cols.append(h('div', { class: 'col' }, h('h3', { text: TYPES[t].label }), list));
  }
  body.replaceChildren(cols, moreButton(overflow));
}

// overflow = how many items are hidden when collapsed (0 means nothing to expand).
function moreButton(overflow) {
  if (!overflow) return '';
  return h('p', {}, h('button', {
    type: 'button',
    class: 'merge',
    text: state.showAll ? 'Show fewer' : `Show all (+${overflow})`,
    onclick: () => { state.showAll = !state.showAll; renderFinished(); },
  }));
}

function renderRecs() {
  const items = state.library.filter((i) => i.recommended);
  $('#mine').hidden = items.length === 0;
  segmented($('#recs-sort'), state.pinRecs, (v) => { state.pinRecs = v; renderRecs(); });
  const sorted = [...items].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  fillCards($('#recs-list'), sortPinned(sorted, state.pinRecs));
}

function renderNext() {
  const items = state.library.filter((i) => i.status === 'next');
  $('#next').hidden = items.length === 0;
  fillCards($('#next-list'), items, { showRating: false });
}

function renderBrowse() {
  segmented($('#browse-sort'), state.pinBrowse, (v) => { state.pinBrowse = v; renderBrowse(); });
  const list = $('#browse-list');
  if (state.visitorFailed) {
    list.replaceChildren(h('li', { class: 'empty', text: "Couldn't load recommendations right now." }));
    return;
  }
  const q = state.query.trim().toLowerCase();
  const filtered = state.visitorRecs.filter(
    (r) => !q || r.title.toLowerCase().includes(q) || (r.why || '').toLowerCase().includes(q),
  );
  const sorted = sortPinned(filtered, state.pinBrowse);
  if (!sorted.length) {
    list.replaceChildren(h('li', { class: 'empty', text: q ? 'Nothing matches.' : 'No recommendations yet. Be the first!' }));
    return;
  }
  list.replaceChildren(
    ...sorted.map((r) =>
      h(
        'li',
        {},
        h('div', { class: 't', text: `${TYPES[r.type]?.icon ?? '✨'} ${r.title}` }),
        r.why && h('div', { class: 'w', text: r.why }),
      ),
    ),
  );
}

function renderAll() {
  renderNow();
  renderFinished();
  renderRecs();
  renderNext();
  renderBrowse();
}

/* ---------- detail dialog ---------- */

const dlg = $('#item-dialog');

function openItem(key) {
  const item = state.library.find((i) => i.key === key);
  if (!item) return;
  const meta = [
    TYPES[item.type].name,
    item.year,
    item.platform,
    item.seasons ? `${item.seasons} season${item.seasons > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');

  const poster = item.poster
    ? h('img', { class: 'poster', src: item.poster, alt: '' })
    : h('div', { class: 'poster ph', text: TYPES[item.type].icon });

  dlg.replaceChildren(
    h('button', { class: 'close', type: 'button', 'aria-label': 'Close', text: '×', onclick: () => dlg.close() }),
    h(
      'div',
      { class: 'detail-head' },
      poster,
      h(
        'div',
        {},
        h('h2', { text: item.title }),
        h('div', { class: 'meta', text: meta }),
        item.rating != null && h('div', { class: 'big-rating', text: `${item.rating}/10` }),
        h('div', { class: 'badges' }, item.replay && h('span', { class: 'badge', text: 'Replay' })),
        item.note && h('div', { class: 'note', text: item.note }),
      ),
    ),
    item.review && h('div', { class: 'review' }, item.review.split(/\n{2,}/).map((p) => h('p', { text: p }))),
    item.screenshots?.length
      ? h(
          'div',
          {},
          h('h3', { text: item.type === 'game' ? 'Screenshots from my gameplay' : 'Screenshots' }),
          h(
            'div',
            { class: 'shots' },
            item.screenshots.map((src) =>
              h('a', { href: src, target: '_blank', rel: 'noopener' }, h('img', { src, alt: '', loading: 'lazy' })),
            ),
          ),
        )
      : null,
  );
  if (!dlg.open) dlg.showModal();
  history.replaceState(null, '', `#item=${encodeURIComponent(key)}`);
}

dlg.addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

function openFromHash() {
  const m = location.hash.match(/^#item=(.+)$/);
  if (m) openItem(decodeURIComponent(m[1]));
}
window.addEventListener('hashchange', openFromHash);

/* ---------- visitor form ---------- */

const form = $('#rec-form');
const msg = $('#form-msg');
const sendBtn = $('#send-btn');

if (CONFIG.turnstileSiteKey) {
  $('#turnstile-slot').append(h('div', { class: 'cf-turnstile', 'data-sitekey': CONFIG.turnstileSiteKey, 'data-theme': 'dark' }));
  document.head.append(h('script', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js', async: true, defer: true }));
}

function say(text, kind) {
  msg.textContent = text;
  msg.className = kind || '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!String(data.title || '').trim()) {
    say('Please enter a title.', 'err');
    return;
  }
  sendBtn.disabled = true;
  say('Sending...');
  try {
    const r = await fetch('/api/recs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        type: data.type,
        why: data.why,
        notes: data.notes,
        website: data.website,
        turnstileToken: data['cf-turnstile-response'],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      say("Thanks! I'll take a look, and it shows up in Browse once I approve it.", 'ok');
      form.reset();
    } else {
      say(j.message || 'Could not send, try again.', 'err');
    }
  } catch {
    say('Network problem, try again.', 'err');
  } finally {
    sendBtn.disabled = false;
    window.turnstile?.reset();
  }
});

$('#browse-search').addEventListener('input', (e) => { state.query = e.target.value; renderBrowse(); });
$('#merge').addEventListener('click', () => { state.merged = !state.merged; state.showAll = false; renderFinished(); });

/* ---------- boot ---------- */

async function boot() {
  const [lib, recs] = await Promise.allSettled([
    fetch('data/library.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch('/api/recs').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
  ]);
  if (lib.status === 'fulfilled') state.library = lib.value.items || [];
  else console.error('library failed', lib.reason);
  if (recs.status === 'fulfilled') state.visitorRecs = recs.value;
  else state.visitorFailed = true;
  renderAll();
  openFromHash();
}

boot();
