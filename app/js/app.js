import { api, state, setToken, getToken, can, isHR, role } from './api.js';
import { h, clear, toast, avatar } from './ui.js';
import * as home from './pages/home.js';
import * as people from './pages/people.js';
import * as work from './pages/work.js';
import * as pay from './pages/pay.js';
import * as growth from './pages/growth.js';
import * as insight from './pages/insight.js';

const root = document.getElementById('root');

// Navigation: [group, [[hash, label, icon, visible()]]]
const NAV = [
  ['', [['#/', 'Dashboard', '◧', () => true], ['#/me', 'My workspace', '☺', () => !!state.meta.user.employee_id]]],
  ['People', [
    ['#/employees', 'Employees', '👥', () => can('employees', 'r')],
    ['#/org', 'Org chart', '⑃', () => true],
    ['#/lifecycle', 'Onboarding & offboarding', '⇄', () => isHR() || role() === 'manager'],
  ]],
  ['Talent', [
    ['#/recruiting', 'Recruiting', '✚', () => can('job_openings', 'r')],
    ['#/performance', 'Performance', '◎', () => can('goals', 'r')],
    ['#/talent', 'Talent & skills', '★', () => can('employee_skills', 'r')],
    ['#/learning', 'Learning', '✎', () => can('courses', 'r')],
  ]],
  ['Pay & benefits', [
    ['#/payroll', 'Payroll', '₦', () => isHR()],
    ['#/compensation', 'Compensation', '↗', () => can('compensation_changes', 'r')],
    ['#/benefits', 'Benefits', '♡', () => can('benefit_plans', 'r')],
  ]],
  ['Time', [
    ['#/time', 'Time & leave', '◷', () => can('time_entries', 'r')],
    ['#/scheduling', 'Scheduling', '▦', () => can('shifts', 'r')],
  ]],
  ['Workplace', [
    ['#/engagement', 'Engagement', '✦', () => can('announcements', 'r')],
    ['#/assets', 'Assets', '▣', () => can('assets', 'r')],
  ]],
  ['Insights', [
    ['#/analytics', 'Workforce analytics', '▤', () => isHR()],
    ['#/compliance', 'Compliance', '⚖', () => can('compliance_items', 'r') || can('policies', 'r')],
    ['#/settings', 'Settings', '⚙', () => role() === 'admin'],
  ]],
];

const ROUTES = [
  [/^#\/?$/, home.dashboard], [/^#\/me$/, home.workspace],
  [/^#\/employees$/, people.employees], [/^#\/employees\/(\d+)$/, people.profile],
  [/^#\/org$/, people.orgChart], [/^#\/lifecycle$/, people.lifecycle],
  [/^#\/recruiting$/, work.recruiting], [/^#\/time$/, work.time], [/^#\/scheduling$/, work.scheduling], [/^#\/assets$/, work.assets],
  [/^#\/payroll$/, pay.payroll], [/^#\/payroll\/(\d+)$/, pay.runDetail], [/^#\/compensation$/, pay.compensation], [/^#\/benefits$/, pay.benefits],
  [/^#\/performance$/, growth.performance], [/^#\/talent$/, growth.talent], [/^#\/learning$/, growth.learning], [/^#\/engagement$/, growth.engagement],
  [/^#\/analytics$/, insight.analytics], [/^#\/compliance$/, insight.compliance], [/^#\/settings$/, insight.settings],
];

function loginPage() {
  const err = h('div', { class: 'error', role: 'alert' });
  const email = h('input', { type: 'email', name: 'email', required: true, autocomplete: 'username', placeholder: 'you@go-greentechnologies.com' });
  const password = h('input', { type: 'password', name: 'password', required: true, autocomplete: 'current-password' });
  const submit = async (e) => {
    e.preventDefault(); err.textContent = '';
    try {
      const { token } = await api('auth/login', { method: 'POST', body: { email: email.value, password: password.value } });
      setToken(token); await boot(); location.hash = '#/';
    } catch (ex) { err.textContent = ex.message; }
  };
  const demo = [['admin@gogreen.demo', 'Admin'], ['hr@gogreen.demo', 'HR Director'], ['payroll@gogreen.demo', 'Payroll officer (HR)'], ['manager@gogreen.demo', 'Line manager'], ['employee@gogreen.demo', 'Employee']];
  // Only the demo site lists its sample logins. Production shows a plain sign-in form.
  const demoBox = h('div', { class: 'demo-accounts', hidden: true }, h('b', {}, 'Demo accounts'), h('span', { class: 'muted' }, ' · password GoGreen@2026'),
    demo.map(([em, label]) => h('button', { type: 'button', onclick: () => { email.value = em; password.value = 'GoGreen@2026'; } }, h('span', {}, label), h('span', { class: 'muted' }, em))));
  api('health').then((r) => { if (r?.demo) demoBox.hidden = false; }).catch(() => {});
  clear(root).append(h('div', { class: 'login' },
    h('div', { class: 'login-art' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' } },
        h('span', { class: 'logo-card' }, h('img', { src: '/logo-full.svg', alt: 'GO-Green Technologies' })),
        h('span', { class: 'tagline' }, 'PEOPLE · PAY · TIME · TALENT')),
      h('div', {}, h('div', { class: 'eyebrow' }, 'HR Portal'), h('h1', {}, 'One home for every GO-Green person, process and payslip.')),
      h('div', { class: 'tiles' }, [['₦', 'Payroll, PAYE & pension'], ['☺', 'Employee self-service'], ['✚', 'Recruiting & onboarding'], ['◎', 'Performance & learning'], ['▤', 'Workforce analytics'], ['⚖', 'Compliance & audit trail']].map(([i, t]) => h('div', { class: 'tile' }, h('i', { 'aria-hidden': 'true' }, i), t))),
      h('p', { class: 'small', style: { color: '#9fbfa8', margin: 0 } }, 'GO-Green Technologies · Lagos · Abuja · Port Harcourt · Ibadan')),
    h('div', { class: 'login-form' }, h('form', { onsubmit: submit },
      h('img', { class: 'logo-mobile', src: '/logo-full.svg', alt: 'GO-Green Technologies' }),
      h('h2', {}, 'Sign in to GO-Green HR'), h('p', { class: 'muted' }, 'Use your work email and password.'),
      h('label', { class: 'field' }, h('span', {}, 'Email'), email),
      h('label', { class: 'field' }, h('span', {}, 'Password'), password),
      err, h('button', { class: 'btn primary big', type: 'submit' }, 'Sign in'),
      demoBox))));
  email.focus();
}

function shell() {
  const side = h('nav', { class: 'side', 'aria-label': 'Main' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'GO-Green HR home' }, h('span', { class: 'logo-card' }, h('img', { src: '/logo-full.svg', alt: 'GO-Green Technologies' })), h('span', { class: 'brand-sub' }, 'HR Portal')),
    NAV.map(([group, items]) => {
      const vis = items.filter(([, , , show]) => show());
      if (!vis.length) return null;
      return h('div', { class: 'nav-group' }, group ? h('span', {}, group) : null,
        h('div', { class: 'nav' }, vis.map(([href, label, ico]) => h('a', { href, 'data-href': href, onclick: () => side.classList.remove('open') }, h('span', { class: 'ico', 'aria-hidden': 'true' }, ico), label))));
    }));
  const u = state.meta.user;
  const themeBtn = h('button', { class: 'icon-btn', title: 'Toggle theme', 'aria-label': 'Toggle dark mode', onclick: () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; try { localStorage.setItem('gg-theme', next); } catch { /* ignore */ }
  } }, '☾');
  const top = h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Open menu', onclick: () => side.classList.toggle('open') }, '☰'),
    h('span', { class: 'spacer' }),
    state.meta.db === 'sqlite' ? h('span', { class: 'badge neutral hide-sm', title: 'Running on the local demo database. Set SQL_CONNECTION_STRING to use Azure SQL.' }, 'Demo database') : null,
    themeBtn,
    h('div', { class: 'who' }, h('div', { class: 'meta' }, h('b', {}, u.name), h('span', {}, u.job_title || u.email)), avatar(u.name, '', u.photo), h('span', { class: 'role-pill hide-sm' }, u.role)),
    h('button', { class: 'btn sm hide-sm', onclick: changePassword }, 'Password'),
    h('button', { class: 'btn sm', onclick: () => { setToken(null); state.meta = null; location.hash = '#/login'; } }, 'Sign out'));
  const content = h('main', { class: 'content', id: 'content', tabindex: -1 });
  clear(root).append(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, top, content)));
}

async function changePassword() {
  const { modal } = await import('./ui.js');
  const cur = h('input', { type: 'password', autocomplete: 'current-password' });
  const nxt = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8 });
  modal('Change password', h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'Current password'), cur), h('label', { class: 'field' }, h('span', {}, 'New password (8+ characters)'), nxt)), {
    actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Update', kind: 'primary', onClick: async (c) => {
      try { await api('auth/password', { method: 'POST', body: { current: cur.value, next: nxt.value } }); toast('Password updated'); c(); } catch (e) { toast(e.message, 'err'); }
    } }],
  });
}

async function boot() {
  state.meta = await api('meta');
  document.title = 'GO-Green HR';
  shell();
}

async function render() {
  const hash = location.hash || '#/';
  if (!getToken()) { if (hash !== '#/login') location.hash = '#/login'; return loginPage(); }
  if (hash === '#/login') { location.hash = '#/'; return; }
  if (!state.meta) { try { await boot(); } catch { return; } }
  if (!document.getElementById('content')) shell();
  const content = document.getElementById('content');
  document.querySelectorAll('.nav a').forEach((a) => {
    const href = a.dataset.href;
    a.classList.toggle('active', href === '#/' ? hash === '#/' || hash === '#' : hash.startsWith(href));
  });
  const path = hash.split('?')[0];
  const match = ROUTES.find(([re]) => re.test(path));
  clear(content);
  if (!match) { content.append(h('p', {}, 'Page not found. ', h('a', { href: '#/' }, 'Go to dashboard'))); return; }
  try {
    const node = await match[1](content, ...path.match(match[0]).slice(1));
    if (node) content.append(node);
  } catch (e) {
    content.append(h('div', { class: 'card' }, h('h3', {}, 'Could not load this page'), h('p', { class: 'muted' }, e.message)));
  }
  content.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

try { const t = localStorage.getItem('gg-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ }
window.addEventListener('hashchange', render);
render();
