const $ = (s) => document.querySelector(s);
const TYPE_ICON = { tv: '📺', movie: '🎬', game: '🎮', unknown: '✨' };
let status = 'pending';

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids.flat().filter(Boolean));
  return n;
}

function say(text, err) {
  $('#msg').textContent = text;
  $('#msg').className = err ? 'err' : '';
}

async function api(method, qs, body) {
  const r = await fetch('/api/admin' + qs, {
    method,
    headers: { 'x-admin-token': sessionStorage.getItem('adminToken') || '', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Error ${r.status}`);
  return j;
}

async function load() {
  say('Loading...');
  try {
    const rows = await api('GET', `?status=${status}`);
    say(rows.length ? `${rows.length} ${status}` : `Nothing ${status}.`);
    $('#tabs').hidden = false;
    $('#list').replaceChildren(...rows.map(row));
  } catch (e) {
    say(e.message, true);
    $('#list').replaceChildren();
  }
}

async function act(id, action, type) {
  try {
    await api('POST', '', { id, action, type });
    await load();
  } catch (e) {
    say(e.message, true);
  }
}

function row(r) {
  const typeSel = el('select', {}, ...['unknown', 'tv', 'movie', 'game'].map((t) => {
    const o = el('option', { value: t, text: `${TYPE_ICON[t]} ${t}` });
    if (t === r.type) o.selected = true;
    return o;
  }));
  const actions = el('div', { class: 'actions' });
  if (r.status !== 'approved') actions.append(typeSel, el('button', { class: 'ok', type: 'button', text: 'Approve', onclick: () => act(r.id, 'approve', typeSel.value) }));
  if (r.status === 'pending') actions.append(el('button', { class: 'no', type: 'button', text: 'Reject', onclick: () => act(r.id, 'reject') }));
  actions.append(el('button', { class: 'no', type: 'button', text: 'Delete', onclick: () => { if (confirm(`Delete "${r.title}" for good?`)) act(r.id, 'delete'); } }));
  return el('div', { class: 'item' },
    el('div', { class: 't', text: `${TYPE_ICON[r.type] || ''} ${r.title}` }),
    r.why && el('div', { class: 'w', text: r.why }),
    r.notes && el('div', { class: 'n', text: `Notes: ${r.notes}` }),
    el('div', { class: 'd', text: new Date(r.created_at).toLocaleString() }),
    actions);
}

$('#login').addEventListener('submit', (e) => {
  e.preventDefault();
  sessionStorage.setItem('adminToken', $('#token').value);
  $('#token').value = '';
  load();
});

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-s]');
  if (!b) return;
  status = b.dataset.s;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  load();
});

if (sessionStorage.getItem('adminToken')) load();
