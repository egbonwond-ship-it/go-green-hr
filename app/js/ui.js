// Small DOM toolkit: element builder, modal, toast, forms, data tables, charts.
import { api, lookup, money, date, num, res, can, me, isHR, clearLookups } from './api.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ---------- feedback ----------
export function toast(msg, kind = 'ok') {
  const wrap = document.getElementById('toasts');
  const t = h('div', { class: `toast ${kind}`, role: 'status' }, msg);
  wrap.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

export function modal(title, body, { actions = [], wide = false } = {}) {
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => (a instanceof Node ? a : h('button', { class: `btn ${a.kind || ''}`, onclick: () => a.onClick(close) }, a.label)))) : null));
  document.body.append(back);
  document.addEventListener('keydown', esc);
  setTimeout(() => back.querySelector('input,select,textarea')?.focus(), 30);
  return close;
}

export async function confirmBox(msg, label = 'Confirm', kind = 'danger') {
  return new Promise((resolve) => {
    const close = modal('Please confirm', h('p', {}, msg), { actions: [
      { label: 'Cancel', onClick: (c) => { c(); resolve(false); } },
      { label, kind, onClick: (c) => { c(); resolve(true); } },
    ] });
    void close;
  });
}

// ---------- badges ----------
const TONE = {
  good: ['Active', 'Approved', 'Done', 'Completed', 'Paid', 'Hired', 'Open', 'On track', 'Assigned', 'Confirmed', 'Acknowledged', 'Ready now', 'Applied', 'Low', 'Processed', 'Available'],
  warn: ['Pending', 'In progress', 'Draft', 'Submitted', 'Proposed', 'Probation', 'Onboarding', 'Screening', 'Interview', 'Offer', 'Upcoming', 'Scheduled', 'Enrolled', 'On hold', 'Swap requested', '1-2 years', 'Medium', 'In repair', 'Not started'],
  bad: ['Rejected', 'Terminated', 'Overdue', 'At risk', 'Cancelled', 'Absent', 'Offboarding', 'Closed', 'High', 'Retired', 'Ended', '3+ years'],
};
export function badge(v) {
  if (v == null || v === '') return '';
  const tone = Object.keys(TONE).find((k) => TONE[k].includes(v)) || 'neutral';
  return h('span', { class: `badge ${tone}` }, v);
}
const BADGE_FIELDS = new Set(['status', 'stage', 'readiness', 'risk_of_loss', 'final_pay_status']);

export function initials(name = '') { return name.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase(); }
export function avatar(name, size = '', photo = null) {
  if (photo) return h('img', { class: `avatar photo ${size}`, src: photo, alt: '' });
  let hsh = 0; for (const c of name || '') hsh = (hsh * 31 + c.charCodeAt(0)) % 360;
  return h('span', { class: `avatar ${size}`, style: { '--hue': String(120 + (hsh % 80) - 40) }, 'aria-hidden': 'true' }, initials(name));
}

// ---------- formatting a value for display ----------
export function display(f, row) {
  const v = row[f.name];
  if (f.type === 'ref') return row[`${f.name}__label`] || (v ? `#${v}` : '');
  if (v == null || v === '') return '';
  if (f.type === 'image') return v ? h('img', { class: 'avatar photo lg', src: v, alt: '' }) : '';
  if (f.type === 'money') return money(v);
  if (f.type === 'date') return date(v);
  if (f.type === 'bool') return v ? 'Yes' : 'No';
  if (f.name === 'progress') return h('span', { class: 'person' }, progress(v), `${v}%`);
  if (f.name === 'rating' && v) return h('span', { class: 'stars', 'aria-label': `${v} of 5` }, '★'.repeat(v) + '☆'.repeat(Math.max(0, 5 - v)));
  if (f.type === 'number') return num(v, 2);
  if (BADGE_FIELDS.has(f.name)) return badge(v);
  return String(v);
}

// ---------- photos ----------
// Shrinks a chosen picture to a 256px square JPEG, so it is small enough to store with the record.
export function photoToDataUrl(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) { reject(new Error('Choose an image file (JPEG, PNG or WebP).')); return; }
    // Read as a data: URL. The site's Content-Security-Policy allows data: images but not blob: ones.
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That image could not be read. Try a JPEG or PNG.'));
    reader.onload = () => { img.src = reader.result; };
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('That image could not be read. Try a JPEG or PNG.'));
    reader.readAsDataURL(file);
  });
}

// Profile picture that can be clicked to pick a new photo and save it straight away.
export function photoChanger(name, photo, employeeId, onSaved) {
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true, onchange: async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    try {
      const data = await photoToDataUrl(f);
      await api(`r/employees/${employeeId}`, { method: 'PUT', body: { photo: data } });
      toast('Photo updated');
      // Your own photo also shows in the top bar, so refresh the whole page.
      if (employeeId === me()) setTimeout(() => location.reload(), 600); else onSaved?.();
    } catch (e) { toast(e.message, 'err'); }
  } });
  return h('span', { class: 'photo-changer' },
    h('button', { type: 'button', class: 'photo-hit', title: 'Change photo', 'aria-label': `Change photo for ${name}`, onclick: () => file.click() }, avatar(name, 'lg', photo), h('span', { class: 'photo-badge', 'aria-hidden': 'true' }, '✎')),
    h('button', { type: 'button', class: 'btn sm', onclick: () => file.click() }, photo ? 'Change photo' : 'Add photo'),
    file);
}

function photoInput(id, name, val, disabled) {
  const hidden = h('input', { type: 'hidden', name, value: val || '' });
  const preview = h('span', { class: 'photo-preview' });
  const msg = h('span', { class: 'muted small' });
  const show = () => { clear(preview).append(hidden.value ? h('img', { class: 'avatar photo lg', src: hidden.value, alt: 'Employee photo' }) : h('span', { class: 'avatar lg' }, '?')); remove.hidden = !hidden.value; };
  const file = h('input', { id, type: 'file', accept: 'image/jpeg,image/png,image/webp', disabled, onchange: async () => {
    msg.textContent = '';
    const f = file.files[0]; if (!f) return;
    try { hidden.value = await photoToDataUrl(f); show(); } catch (e) { msg.textContent = e.message; }
    file.value = '';
  } });
  const remove = h('button', { type: 'button', class: 'btn sm', disabled, onclick: () => { hidden.value = ''; show(); } }, 'Remove photo');
  const wrap = h('span', { class: 'photo-field' }, preview, h('span', { class: 'photo-actions' }, file, remove, msg), hidden);
  show();
  return wrap;
}

// ---------- forms ----------
export async function buildForm(resource, row = {}, { hide = [], lock = [], only } = {}) {
  const form = h('form', { class: 'form-grid', onsubmit: (e) => e.preventDefault() });
  for (const f of resource.fields) {
    if (f.readonly || hide.includes(f.name)) continue;
    if (only && !only.includes(f.name)) continue;
    // The server fills the owner in for "own" records, so don't ask for it.
    if (f.name === resource.owner && resource.owner !== 'id' && ((!row.id && resource.perms.c === 'own') || (row.id && resource.perms.u === 'own'))) continue;
    const val = row[f.name] ?? (row.id ? '' : f.default ?? '');
    const id = `f_${f.name}`;
    let input;
    const disabled = lock.includes(f.name);
    if (f.type === 'textarea') input = h('textarea', { id, name: f.name, rows: 3, disabled }, val ?? '');
    else if (f.type === 'select') input = h('select', { id, name: f.name, disabled }, h('option', { value: '' }, '—'), f.options.map((o) => h('option', { value: o, selected: o === val }, o)));
    else if (f.type === 'ref') {
      input = h('select', { id, name: f.name, disabled }, h('option', { value: '' }, 'Loading…'));
      lookup(f.ref).then((items) => {
        clear(input);
        input.append(h('option', { value: '' }, '—'));
        items.filter((x) => f.ref !== 'employees' || x.status !== 'Terminated' || x.id === val)
          .forEach((x) => input.append(h('option', { value: x.id, selected: x.id === val }, x.label + (x.sub ? ` · ${x.sub}` : ''))));
      });
    } else if (f.type === 'image') input = photoInput(id, f.name, val, disabled);
    else if (f.type === 'bool') input = h('input', { id, name: f.name, type: 'checkbox', checked: !!val, disabled });
    else {
      const type = { number: 'number', money: 'number', date: 'date', time: 'time', password: 'password' }[f.type] || 'text';
      input = h('input', { id, name: f.name, type, value: val ?? '', step: f.type === 'money' ? '0.01' : f.type === 'number' ? 'any' : undefined, min: f.min, max: f.max, disabled, autocomplete: f.type === 'password' ? 'new-password' : undefined });
    }
    const wide = f.type === 'textarea' || f.type === 'image';
    form.append(h('label', { class: `field ${wide ? 'wide' : ''} ${f.type === 'bool' ? 'check' : ''}`, for: id },
      h('span', {}, f.label, f.required ? h('b', { class: 'req', 'aria-hidden': 'true' }, ' *') : ''), input));
  }
  form.values = () => {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled || el.type === 'file') continue;
      out[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
    }
    return out;
  };
  return form;
}

export async function editRecord(key, row, { onSaved, defaults = {}, hide = [], lock = [], title } = {}) {
  const r = res(key);
  const isNew = !row?.id;
  const canWrite = isNew ? can(key, 'c') : can(key, 'u');
  const form = await buildForm(r, { ...defaults, ...(row || {}) }, { hide, lock: canWrite ? lock : r.fields.map((f) => f.name) });
  const actions = [];
  if (!isNew && can(key, 'd')) actions.push(h('button', { class: 'btn ghost danger left', onclick: async () => {
    if (!(await confirmBox('Delete this record? This cannot be undone.', 'Delete'))) return;
    try { await api(`r/${key}/${row.id}`, { method: 'DELETE' }); toast('Deleted'); close(); clearLookups(); onSaved?.(); } catch (e) { toast(e.message, 'err'); }
  } }, 'Delete'));
  actions.push({ label: canWrite ? 'Cancel' : 'Close', onClick: (c) => c() });
  if (canWrite) actions.push({ label: isNew ? 'Add' : 'Save changes', kind: 'primary', onClick: async (c) => {
    try {
      const body = { ...defaults, ...form.values() };
      await api(isNew ? `r/${key}` : `r/${key}/${row.id}`, { method: isNew ? 'POST' : 'PUT', body });
      toast(isNew ? 'Added' : 'Saved'); c(); clearLookups(); onSaved?.();
    } catch (e) { toast(e.message, 'err'); }
  } });
  const close = modal(title || `${isNew ? 'New' : canWrite ? 'Edit' : 'View'} · ${r.label.replace(/s$/, '')}`, form, { actions, wide: r.fields.length > 8 });
}

// ---------- data table ----------
// table(key, { query, columns, onRow, actions, defaults, hide, title, empty })
export function dataTable(key, opts = {}) {
  const r = res(key);
  const box = h('section', { class: 'card table-card' });
  if (!r) return box;
  let rows = []; let q = ''; const filters = {};
  const cols = (opts.columns || r.fields.filter((f) => f.list !== false && f.type !== 'password' && f.type !== 'textarea').map((f) => f.name))
    .map((n) => r.fields.find((f) => f.name === n)).filter(Boolean);
  const filterable = r.fields.filter((f) => (opts.filters || ['status', 'stage', 'category', 'leave_type', 'kind', 'department_id', 'site']).includes(f.name) && (f.type === 'select' || f.type === 'ref'));

  const body = h('tbody');
  const count = h('span', { class: 'muted small' });
  const render = () => {
    const needle = q.toLowerCase();
    const list = rows.filter((row) => (!needle || cols.some((c) => String(c.type === 'ref' ? row[`${c.name}__label`] || '' : row[c.name] ?? '').toLowerCase().includes(needle)))
      && Object.entries(filters).every(([k, v]) => !v || String(row[k]) === String(v)));
    clear(body);
    if (!list.length) body.append(h('tr', {}, h('td', { colspan: cols.length + 1, class: 'empty' }, opts.empty || 'Nothing here yet.')));
    for (const row of list.slice(0, 500)) {
      const tr = h('tr', { tabindex: 0, onclick: () => open(row), onkeydown: (e) => { if (e.key === 'Enter') open(row); } },
        cols.map((c) => h('td', { class: ['money', 'number'].includes(c.type) ? 'num' : '' }, c.name === r.owner && c.type === 'ref' && r.owner !== 'id' ? personCell(row[`${c.name}__label`]) : display(c, row))));
      if (opts.rowActions) tr.append(h('td', { class: 'row-actions', onclick: (e) => e.stopPropagation() }, opts.rowActions(row, load)));
      body.append(tr);
    }
    count.textContent = `${list.length} of ${rows.length}`;
  };
  const open = (row) => (opts.onRow ? opts.onRow(row, load) : editRecord(key, row, { onSaved: load, hide: opts.hide, lock: opts.lock }));
  const load = async () => {
    try { rows = await api(`r/${key}`, { query: opts.query }); render(); } catch (e) { clear(body).append(h('tr', {}, h('td', { colspan: cols.length + 1, class: 'empty' }, e.message))); }
  };
  const head = h('div', { class: 'table-tools' },
    opts.title ? h('h3', {}, opts.title) : null,
    h('input', { type: 'search', placeholder: `Search ${r.label.toLowerCase()}…`, 'aria-label': `Search ${r.label}`, oninput: (e) => { q = e.target.value; render(); } }),
    filterable.map((f) => {
      const s = h('select', { 'aria-label': f.label, onchange: (e) => { filters[f.name] = e.target.value; render(); } }, h('option', { value: '' }, `All ${f.label.toLowerCase()}`));
      if (f.type === 'select') f.options.forEach((o) => s.append(h('option', { value: o }, o)));
      else lookup(f.ref).then((items) => items.forEach((x) => s.append(h('option', { value: x.id }, x.label))));
      return s;
    }),
    h('span', { class: 'spacer' }), count,
    opts.extraActions ? opts.extraActions(load) : null,
    can(key, 'c') && opts.allowCreate !== false ? h('button', { class: 'btn primary', onclick: () => editRecord(key, null, { onSaved: load, defaults: opts.defaults, hide: opts.hide }) }, `+ Add`) : null);
  box.append(head, h('div', { class: 'table-scroll' }, h('table', { class: 'data' },
    h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: ['money', 'number'].includes(c.type) ? 'num' : '' }, c.label)), opts.rowActions ? h('th', {}, '') : null)), body)));
  box.reload = load;
  load();
  return box;
}
export const personCell = (name, photo) => (name ? h('span', { class: 'person' }, avatar(name, 'xs', photo), name) : '');

// ---------- layout helpers ----------
export function pageHead(title, sub, ...actions) {
  return h('header', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'muted' }, sub) : null), h('div', { class: 'actions' }, actions));
}

export function tabs(items, initial) {
  // items: [{ id, label, render: () => Node }]
  const visible = items.filter((x) => x && (x.show === undefined || x.show));
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  const panel = h('div', { class: 'tab-panel' });
  const select = (id) => {
    const it = visible.find((x) => x.id === id) || visible[0];
    if (!it) return;
    [...bar.children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === it.id)));
    clear(panel).append(it.render());
    try { sessionStorage.setItem(`tab:${location.hash.split('?')[0]}`, it.id); } catch { /* ignore */ }
  };
  visible.forEach((it) => bar.append(h('button', { role: 'tab', 'data-id': it.id, onclick: () => select(it.id) }, it.label)));
  let start = initial;
  try { start = start || sessionStorage.getItem(`tab:${location.hash.split('?')[0]}`); } catch { /* ignore */ }
  setTimeout(() => select(start), 0);
  return h('div', {}, visible.length > 1 ? bar : null, panel);
}

export function stat(label, value, sub, tone) {
  return h('div', { class: `stat ${tone || ''}` }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), sub ? h('div', { class: 'stat-sub' }, sub) : null);
}
export const card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h3', { class: 'card-title' }, title) : null, kids);

// ---------- charts (SVG, single-hue, hover tooltips) ----------
const tip = () => document.getElementById('chart-tip');
function showTip(e, text) { const t = tip(); t.textContent = text; t.hidden = false; const x = Math.min(e.clientX + 12, innerWidth - t.offsetWidth - 8); t.style.left = `${x}px`; t.style.top = `${e.clientY - 34}px`; }
const hideTip = () => { tip().hidden = true; };

// Horizontal bars: categories ranked by value.
export function barList(data, { format = (v) => num(v), max } = {}) {
  const m = max || Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return h('p', { class: 'muted' }, 'No data yet.');
  return h('div', { class: 'barlist', role: 'list' }, data.map((d) => h('div', { class: 'barrow', role: 'listitem', onmousemove: (e) => showTip(e, `${d.label}: ${format(d.value)}`), onmouseleave: hideTip },
    h('span', { class: 'bar-label' }, d.label),
    h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${Math.max(1.5, (d.value / m) * 100)}%` } })),
    h('span', { class: 'bar-value' }, format(d.value)))));
}

// Vertical columns over time (one series).
export function columns(data, { format = (v) => num(v), height = 180, labelEvery = 1, shortLabel = (l) => l } = {}) {
  if (!data.length) return h('p', { class: 'muted' }, 'No data yet.');
  const W = 640; const H = height; const pad = { l: 8, r: 8, t: 22, b: 30 };
  const m = Math.max(1, ...data.map((d) => d.value));
  const bw = (W - pad.l - pad.r) / data.length;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'colchart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', data.map((d) => `${d.label} ${format(d.value)}`).join(', '));
  const ns = (t, a) => { const el = document.createElementNS('http://www.w3.org/2000/svg', t); Object.entries(a).forEach(([k, v]) => el.setAttribute(k, v)); return el; };
  svg.append(ns('line', { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, class: 'axis' }));
  data.forEach((d, i) => {
    const bh = ((H - pad.t - pad.b) * d.value) / m;
    const x = pad.l + i * bw + 1; const w = Math.max(2, bw - 2 - Math.min(14, bw * 0.3));
    const g = ns('g', {});
    g.append(ns('rect', { x: x, y: pad.t, width: bw - 2, height: H - pad.t - pad.b, class: 'hit' }));
    const bar = ns('path', { class: 'col', d: roundedTop(x + (bw - 2 - w) / 2, H - pad.b - bh, w, bh, Math.min(4, w / 2)) });
    g.append(bar);
    if (i % labelEvery === 0) { const t = ns('text', { x: x + (bw - 2) / 2, y: H - 9, class: 'tick', 'text-anchor': 'middle' }); t.textContent = shortLabel(d.label); g.append(t); }
    g.addEventListener('mousemove', (e) => showTip(e, `${d.label}: ${format(d.value)}`));
    g.addEventListener('mouseleave', hideTip);
    svg.append(g);
  });
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
  const pi = data.indexOf(peak);
  const lbl = ns('text', { x: pad.l + pi * bw + (bw - 2) / 2, y: Math.max(15, H - pad.b - ((H - pad.t - pad.b) * peak.value) / m - 5), class: 'peak', 'text-anchor': 'middle' });
  lbl.textContent = format(peak.value); svg.append(lbl);
  return svg;
}
function roundedTop(x, y, w, hgt, r) {
  if (hgt <= 0) return `M${x},${y} h${w}`;
  r = Math.min(r, hgt);
  return `M${x},${y + hgt} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + hgt} Z`;
}

export function progress(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return h('span', { class: 'progress', title: `${p}%` }, h('span', { style: { width: `${p}%` } }));
}

export const ownerFilter = () => (isHR() ? {} : { employee_id: me() });
