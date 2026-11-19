// Serves /api/* requests in the browser with the real API router (see api/src/lib/router.js),
// so the preview runs the same business rules as the Azure Functions API.
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { loadBytes, saveBytes, clearBytes } from './storage.js';

const ready = (async () => {
  globalThis.__GG_SQL = await initSqlJs();
  globalThis.__GG_BYTES = await loadBytes();
  return require('../api/src/lib/router.js').handle;
})();

let saveTimer;
const scheduleSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (globalThis.__GG_DB) saveBytes(globalThis.__GG_DB.export()); }, 400);
};

globalThis.__GG_RESET = async () => { await clearBytes(); try { localStorage.removeItem('gg-hr-token'); } catch { /* ignore */ } location.hash = '#/login'; location.reload(); };

const realFetch = globalThis.fetch?.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
  const raw = typeof input === 'string' ? input : input.url;
  const url = new URL(raw, 'https://preview.local/');
  const at = url.pathname.indexOf('/api/');
  if (at === -1) return realFetch(input, init);
  const handle = await ready;
  const method = (init.method || 'GET').toUpperCase();
  const headers = {};
  new Headers(init.headers || {}).forEach((v, k) => { headers[k.toLowerCase()] = v; });
  let body = {};
  if (init.body) { try { body = JSON.parse(init.body); } catch { body = {}; } }
  const res = await handle({ method, path: url.pathname.slice(at), query: Object.fromEntries(url.searchParams.entries()), body, headers });
  if (method !== 'GET') scheduleSave();
  return new Response(res.body === undefined ? null : JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } });
};
