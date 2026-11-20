// HTTP router shared by the Azure Functions entry point and the local dev server.
// handle({ method, path, query, body, headers }) -> { status, body, headers? }
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { resources, REF_LABEL } = require('./resources');
const { tables } = require('./schema');
const { DEFAULT_PAYROLL, computePayslip } = require('./payroll');

const JWT_SECRET = process.env.JWT_SECRET || 'go-green-hr-dev-secret-change-me';
const TZ = 'Africa/Lagos';
const HR_ROLES = ['admin', 'hr'];

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const nowTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const isHR = (ctx) => HR_ROLES.includes(ctx.user.role);
const fullName = (e) => (e ? `${e.first_name} ${e.last_name}` : '');

// ---------- bootstrapping ----------
let ready;
function ensureReady() {
  if (!ready) {
    ready = (async () => {
      await db.migrate();
      const u = await db.one('SELECT COUNT(*) AS c FROM users');
      if (!Number(u.c)) {
        const seeds = require('./seed');
        await (process.env.DEMO_DATA === 'false' ? seeds.seedProduction() : seeds.seed());
      }
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

// ---------- auth ----------
async function teamOf(employeeId) {
  if (!employeeId) return [];
  const rows = await db.query("SELECT id, manager_id FROM employees WHERE status <> 'Terminated'");
  const kids = new Map();
  rows.forEach((r) => { if (!kids.has(r.manager_id)) kids.set(r.manager_id, []); kids.get(r.manager_id).push(r.id); });
  const out = new Set([employeeId]);
  const stack = [employeeId];
  while (stack.length) for (const k of kids.get(stack.pop()) || []) if (!out.has(k)) { out.add(k); stack.push(k); }
  return [...out];
}

async function authenticate(headers) {
  const token = headers['x-gg-token'] || (headers.authorization || '').replace(/^Bearer /, '');
  if (!token) fail(401, 'Please sign in');
  let p;
  try { p = jwt.verify(token, JWT_SECRET); } catch { fail(401, 'Session expired, please sign in again'); }
  const user = await db.one('SELECT id, email, role, employee_id, active FROM users WHERE id = ?', [p.uid]);
  if (!user || !user.active) fail(401, 'Account disabled');
  const team = user.role === 'manager' ? await teamOf(user.employee_id) : [user.employee_id].filter(Boolean);
  return { user, team };
}

async function audit(ctx, action, entity, entityId, details) {
  try {
    await db.insert('audit_log', { user_id: ctx?.user?.id, user_email: ctx?.user?.email || 'system', action, entity, entity_id: entityId, details: details ? JSON.stringify(details, (k, v) => (typeof v === 'string' && v.startsWith('data:image/') ? '[photo]' : v)).slice(0, 2000) : null, at: new Date().toISOString() });
  } catch { /* never block a request on audit */ }
}

// ---------- generic resource access ----------
function scopeFor(res, ctx, action) {
  if (res.readonly && action !== 'r') return null;
  if (ctx.user.role === 'admin') return 'all';
  return res.perms[ctx.user.role]?.[action] || null;
}

function scopeWhere(res, ctx, scope, alias = 't') {
  const col = `${alias}.${res.owner}`;
  if (scope === 'all') return { sql: '1=1', params: [] };
  if (scope === 'own') return { sql: `${col} = ?`, params: [ctx.user.employee_id || -1] };
  const ids = ctx.team.length ? ctx.team : [-1];
  return { sql: `${col} IN (${ids.map(() => '?').join(',')})`, params: ids };
}

const ownsRow = (res, ctx, row, scope) => {
  if (scope === 'all') return true;
  const v = row[res.owner];
  if (scope === 'own') return v != null && v === ctx.user.employee_id;
  return ctx.team.includes(v);
};

function selectSql(res) {
  const labels = res.fields.filter((f) => f.type === 'ref' && REF_LABEL[f.ref])
    .map((f) => `(SELECT ${REF_LABEL[f.ref]} FROM ${f.ref} x WHERE x.id = t.${f.name}) AS ${f.name}__label`);
  return `SELECT t.*${labels.length ? ', ' + labels.join(', ') : ''} FROM ${res.table} t`;
}

function sanitize(res, ctx, row) {
  if (res.key === 'users') delete row.password_hash;
  if (isHR(ctx)) return row;
  const mine = row[res.owner] === ctx.user.employee_id;
  const team = ctx.user.role === 'manager' && ctx.team.includes(row[res.owner]);
  if (!mine && !team) for (const f of res.fields) if (f.sensitive) delete row[f.name];
  return row;
}

async function listRows(res, ctx, query = {}) {
  const scope = scopeFor(res, ctx, 'r');
  if (!scope) fail(403, `You do not have access to ${res.label}`);
  const w = scopeWhere(res, ctx, scope);
  const where = [w.sql]; const params = [...w.params];
  // Employees only see payslips once the payroll run has been paid.
  if (res.key === 'payslips' && !isHR(ctx)) where.push("EXISTS (SELECT 1 FROM payroll_runs r WHERE r.id = t.run_id AND r.status = 'Paid')");
  const cols = tables[res.table];
  for (const [k, v] of Object.entries(query)) {
    if (k in cols && v !== '') { where.push(`t.${k} = ?`); params.push(v); }
  }
  if (query.q) {
    const strCols = res.fields.filter((f) => ['text', 'select'].includes(f.type) && !f.virtual && (isHR(ctx) || !f.sensitive)).map((f) => f.name);
    if (strCols.length) { where.push(`(${strCols.map((c) => `t.${c} LIKE ?`).join(' OR ')})`); strCols.forEach(() => params.push(`%${query.q}%`)); }
  }
  const order = (res.order || 'id DESC').split(',').map((o) => `t.${o.trim()}`).join(', ');
  const rows = await db.query(`${selectSql(res)} WHERE ${where.join(' AND ')} ORDER BY ${order}`, params);
  return rows.map((r) => sanitize(res, ctx, r));
}

async function getRow(res, ctx, id, action = 'r') {
  const scope = scopeFor(res, ctx, action);
  if (!scope) fail(403, 'Not allowed');
  const row = await db.one(`${selectSql(res)} WHERE t.id = ?`, [id]);
  if (!row) fail(404, 'Not found');
  if (!ownsRow(res, ctx, row, scope)) fail(403, 'Not allowed');
  return { row, scope };
}

function validate(res, data, partial) {
  const out = {};
  for (const f of res.fields) {
    if (f.readonly) continue;
    let v = data[f.name];
    if (v === undefined) { if (!partial && f.default !== undefined) out[f.name] = f.default; continue; }
    if (v === '' || v === null) v = null;
    else if (['number', 'money', 'ref'].includes(f.type)) {
      v = Number(v);
      if (Number.isNaN(v)) fail(400, `${f.label} must be a number`);
      if (f.min != null && v < f.min) fail(400, `${f.label} must be at least ${f.min}`);
      if (f.max != null && v > f.max) fail(400, `${f.label} must be at most ${f.max}`);
    } else if (f.type === 'bool') v = v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0;
    else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) fail(400, `${f.label} must be a date`);
    else if (f.type === 'select' && !f.options.includes(v)) fail(400, `${f.label} must be one of: ${f.options.join(', ')}`);
    else if (f.type === 'image') {
      v = String(v);
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) fail(400, `${f.label} must be a JPEG, PNG or WebP image`);
      if (v.length > 400000) fail(400, `${f.label} is too large (300 KB at most)`);
    }
    else v = String(v).trim();
    out[f.name] = v;
  }
  if (!partial) for (const f of res.fields) if (f.required && (out[f.name] == null || out[f.name] === '')) fail(400, `${f.label} is required`);
  return out;
}

const workingDays = (a, b) => {
  let n = 0; const d = new Date(`${a}T00:00:00Z`); const end = new Date(`${b}T00:00:00Z`);
  while (d <= end) { const w = d.getUTCDay(); if (w && w !== 6) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
};
const hoursBetween = (a, b) => {
  if (!a || !b) return null;
  const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number);
  let mins = h2 * 60 + m2 - (h1 * 60 + m1); if (mins < 0) mins += 1440;
  return Math.round((mins / 60) * 100) / 100;
};

// Business rules that sit on top of generic CRUD.
const hooks = {
  leave_requests: {
    async before(data, ctx, old) {
      const s = data.start_date || old?.start_date; const e = data.end_date || old?.end_date;
      if (s && e) { if (e < s) fail(400, 'End date is before start date'); if (data.start_date || data.end_date) data.days = workingDays(s, e); }
      if (!old) { data.requested_on = today(); if (!isHR(ctx)) data.status = 'Pending'; }
      if (old && data.status && data.status !== old.status) {
        if (old.employee_id === ctx.user.employee_id && !isHR(ctx) && data.status !== 'Cancelled') fail(403, 'You cannot approve your own leave');
        data.approver_id = ctx.user.employee_id;
      }
    },
    async after(row, ctx, old) {
      if (row.leave_type !== 'Annual') return;
      const was = old?.status === 'Approved'; const is = row.status === 'Approved';
      if (was === is) return;
      const delta = (is ? -1 : 1) * Number(row.days || 0);
      await db.run('UPDATE employees SET leave_balance = COALESCE(leave_balance, 0) + ? WHERE id = ?', [delta, row.employee_id]);
    },
  },
  time_entries: {
    async before(data, ctx, old) {
      const ci = data.clock_in ?? old?.clock_in; const co = data.clock_out ?? old?.clock_out;
      if ((data.clock_in || data.clock_out) && ci && co) data.hours = hoursBetween(ci, co);
      if (data.status && ['Approved', 'Rejected'].includes(data.status)) {
        const owner = data.employee_id ?? old?.employee_id;
        if (!isHR(ctx) && (ctx.user.role !== 'manager' || owner === ctx.user.employee_id)) fail(403, 'Only your manager or HR can approve timesheets');
      }
      if (old?.status === 'Approved' && !isHR(ctx) && ctx.user.role !== 'manager') fail(403, 'Approved timesheets are locked');
    },
  },
  compensation_changes: {
    async before(data, ctx, old) {
      const empId = data.employee_id ?? old?.employee_id;
      if (!old) {
        const e = await db.one('SELECT base_salary FROM employees WHERE id = ?', [empId]);
        data.old_salary = e?.base_salary ?? null;
        if (!isHR(ctx)) data.status = 'Proposed';
      }
      if (data.status && ['Approved', 'Rejected', 'Applied'].includes(data.status) && !isHR(ctx)) fail(403, 'Only HR can approve compensation changes');
    },
    async after(row, ctx, old) {
      if (row.status === 'Applied' && old?.status !== 'Applied') {
        await db.run('UPDATE employees SET base_salary = ? WHERE id = ?', [row.new_salary, row.employee_id]);
      }
    },
  },
  assets: {
    async before(data, ctx, old) {
      if (data.employee_id && (data.employee_id !== old?.employee_id)) { data.status = 'Assigned'; data.assigned_date = data.assigned_date || today(); }
      if (data.employee_id === null && old?.employee_id) { data.status = data.status === 'Assigned' ? 'Available' : (data.status || 'Available'); data.assigned_date = null; }
    },
  },
  recognitions: { async before(data, ctx, old) { if (!old) data.given_date = data.given_date || today(); if (data.to_id && data.to_id === (data.from_id ?? old?.from_id)) fail(400, 'You cannot recognise yourself'); } },
  survey_responses: {
    async before(data, ctx, old) {
      if (old) return;
      data.response_date = today();
      const s = await db.one('SELECT status FROM surveys WHERE id = ?', [data.survey_id]);
      if (s?.status !== 'Open') fail(400, 'This survey is not open');
      const dup = await db.one('SELECT id FROM survey_responses WHERE survey_id = ? AND employee_id = ?', [data.survey_id, data.employee_id]);
      if (dup) fail(400, 'You have already responded to this survey');
    },
  },
  policy_acks: {
    async before(data, ctx, old) {
      if (old) return;
      data.ack_date = today();
      const dup = await db.one('SELECT id FROM policy_acks WHERE policy_id = ? AND employee_id = ?', [data.policy_id, data.employee_id]);
      if (dup) fail(400, 'Already acknowledged');
    },
  },
  course_enrollments: {
    async before(data, ctx, old) {
      if (!old) data.enrolled_date = data.enrolled_date || today();
      if (data.status === 'Completed') { data.progress = 100; data.completed_date = data.completed_date || today(); }
    },
  },
  lifecycle_tasks: { async before(data) { if (data.status === 'Done') data.completed_date = data.completed_date || today(); } },
  employees: {
    async before(data, ctx, old) {
      if (!old) { data.leave_balance = data.leave_balance ?? (await db.getSetting('leave_policy', { annual_days: 20 })).annual_days; }
      if (data.manager_id && old && data.manager_id === old.id) fail(400, 'An employee cannot report to themselves');
    },
  },
  announcements: { async before(data, ctx, old) { if (!old) { data.posted_date = data.posted_date || today(); data.author_id = data.author_id || ctx.user.employee_id; } } },
  users: {
    async before(data, ctx, old, raw) {
      if (raw.password) { if (String(raw.password).length < 8) fail(400, 'Password must be at least 8 characters'); data.password_hash = bcrypt.hashSync(String(raw.password), 10); }
      else if (!old) fail(400, 'Set a password for the new account');
      if (data.email) data.email = data.email.toLowerCase();
    },
  },
};

async function createRow(res, ctx, body) {
  const scope = scopeFor(res, ctx, 'c');
  if (!scope) fail(403, `You cannot add ${res.label}`);
  if (scope === 'own') body[res.owner] = ctx.user.employee_id;
  const data = validate(res, body, false);
  if (scope === 'team' && !ctx.team.includes(data[res.owner])) fail(403, 'You can only add records for your team');
  await hooks[res.key]?.before?.(data, ctx, null, body);
  const id = await db.insert(res.table, data);
  const { row } = await getRow(res, { ...ctx, user: { ...ctx.user, role: 'admin' } }, id);
  await hooks[res.key]?.after?.(row, ctx, null);
  await audit(ctx, 'create', res.key, id, data);
  return sanitize(res, ctx, row);
}

async function updateRow(res, ctx, id, body) {
  const { row: old, scope } = await getRow(res, ctx, id, 'u');
  const data = validate(res, body, true);
  if (scope !== 'all') delete data[res.owner];
  // Employees editing their own profile may only change self-service fields.
  if (res.key === 'employees' && !isHR(ctx)) for (const k of Object.keys(data)) if (!res.fields.find((f) => f.name === k)?.self) delete data[k];
  await hooks[res.key]?.before?.(data, ctx, old, body);
  await db.update(res.table, id, data);
  const { row } = await getRow(res, { ...ctx, user: { ...ctx.user, role: 'admin' } }, id);
  await hooks[res.key]?.after?.(row, ctx, old);
  const changed = Object.fromEntries(Object.keys(data).filter((k) => k !== 'password_hash' && old[k] !== data[k]).map((k) => [k, [old[k], data[k]]]));
  await audit(ctx, 'update', res.key, id, changed);
  return sanitize(res, ctx, row);
}

async function deleteRow(res, ctx, id) {
  const { row } = await getRow(res, ctx, id, 'd');
  if (res.key === 'users' && row.id === ctx.user.id) fail(400, 'You cannot delete your own account');
  await db.remove(res.table, id);
  await audit(ctx, 'delete', res.key, id, { title: res.title ? res.title.map((k) => row[k]).join(' ') : undefined });
  return { ok: true };
}

// ---------- payroll ----------
async function payrollConfig() { return { ...DEFAULT_PAYROLL, ...(await db.getSetting('payroll', {})) }; }

async function payrollEmployees(period) {
  const end = `${period}-31`;
  return db.query(`SELECT e.*, (SELECT d.name FROM departments d WHERE d.id = e.department_id) AS department
    FROM employees e WHERE e.status <> 'Terminated' AND e.hire_date <= ? AND COALESCE(e.base_salary, 0) > 0 ORDER BY e.last_name`, [end]);
}

async function payrollPreview(period, extras = {}) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) fail(400, 'Period must be YYYY-MM');
  const cfg = await payrollConfig();
  const emps = await payrollEmployees(period);
  return emps.map((e) => ({ employee_id: e.id, emp_no: e.emp_no, name: fullName(e), department: e.department, ...computePayslip(e, cfg, extras[e.id] || {}) }));
}

async function payrollRun(ctx, { period, extras = {} }) {
  const existing = await db.one('SELECT * FROM payroll_runs WHERE period = ?', [period]);
  if (existing && existing.status !== 'Draft') fail(409, `Payroll for ${period} is already ${existing.status.toLowerCase()}`);
  const slips = await payrollPreview(period, extras);
  if (!slips.length) fail(400, 'No eligible employees for this period');
  const sum = (k) => Math.round(slips.reduce((t, x) => t + x[k], 0) * 100) / 100;
  const totals = { employee_count: slips.length, total_gross: sum('gross'), total_net: sum('net'), total_paye: sum('paye'), total_pension: Math.round((sum('pension_employee') + sum('pension_employer')) * 100) / 100 };
  let runId;
  if (existing) {
    runId = existing.id;
    await db.run('DELETE FROM payslips WHERE run_id = ?', [runId]);
    await db.update('payroll_runs', runId, { ...totals, run_date: today(), created_by: ctx.user.id });
  } else {
    runId = await db.insert('payroll_runs', { period, status: 'Draft', run_date: today(), created_by: ctx.user.id, ...totals });
  }
  await db.insertMany('payslips', slips.map((x) => ({ ...x, run_id: runId, period })));
  await audit(ctx, existing ? 'rerun' : 'create', 'payroll_runs', runId, { period, ...totals });
  return payrollDetail(runId);
}

async function payrollDetail(id) {
  const run = await db.one('SELECT * FROM payroll_runs WHERE id = ?', [id]);
  if (!run) fail(404, 'Payroll run not found');
  const slips = await db.query(`SELECT p.*, e.emp_no, CONCAT(e.first_name, ' ', e.last_name) AS name, e.bank_name, e.bank_account, e.pension_pfa, e.pension_pin, e.state_of_origin, e.location,
      (SELECT d.name FROM departments d WHERE d.id = e.department_id) AS department
    FROM payslips p LEFT JOIN employees e ON e.id = p.employee_id WHERE p.run_id = ? ORDER BY e.last_name`, [id]);
  const byPfa = {};
  slips.forEach((s) => { const k = s.pension_pfa || 'Unassigned'; byPfa[k] = (byPfa[k] || 0) + Number(s.pension_employee) + Number(s.pension_employer); });
  const remittances = {
    paye: slips.reduce((t, s) => t + Number(s.paye), 0),
    nhf: slips.reduce((t, s) => t + Number(s.nhf), 0),
    pension_by_pfa: byPfa,
    nsitf: slips.reduce((t, s) => t + Number(s.gross), 0) * 0.01,
    itf: slips.reduce((t, s) => t + Number(s.gross), 0) * 0.01,
  };
  return { run, slips, remittances };
}

// ---------- lifecycle (onboarding / offboarding / hiring) ----------
const DEFAULT_ONBOARDING = [
  ['Send offer letter & contract for signature', 'Paperwork', 'HR', -7], ['Collect guarantor forms, IDs and certificates', 'Paperwork', 'HR', 0],
  ['Collect bank, PFA/RSA PIN and TIN details', 'Payroll', 'Employee', 0], ['Create email, HR portal and system accounts', 'IT & access', 'IT', -1],
  ['Issue laptop and access card', 'Equipment', 'IT', 0], ['Enrol in HMO health plan', 'Paperwork', 'HR', 3],
  ['Health, safety & environment induction', 'Training', 'HR', 1], ['Acknowledge code of conduct & policies', 'Paperwork', 'Employee', 2],
  ['Meet the team and assign onboarding buddy', 'Introductions', 'Manager', 1], ['Agree 30-60-90 day goals', 'Introductions', 'Manager', 7],
  ['Add to payroll', 'Payroll', 'Finance', 5], ['Probation check-in (90 days)', 'Introductions', 'Manager', 90],
];
const DEFAULT_OFFBOARDING = [
  ['Acknowledge resignation / issue termination letter', 'Exit', 'HR', -30], ['Knowledge transfer and handover plan', 'Knowledge transfer', 'Manager', -10],
  ['Conduct exit interview', 'Exit', 'HR', -2], ['Revoke system, email and building access', 'IT & access', 'IT', 0],
  ['Compute final pay, leave encashment and deductions', 'Payroll', 'Finance', 0], ['Issue certificate of service', 'Exit', 'HR', 5],
  ['Notify PFA and HMO of exit', 'Paperwork', 'HR', 5],
];
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function startOnboarding(ctx, employeeId) {
  const e = await db.one('SELECT * FROM employees WHERE id = ?', [employeeId]);
  if (!e) fail(404, 'Employee not found');
  const tpl = await db.getSetting('onboarding_template', DEFAULT_ONBOARDING);
  await db.insertMany('lifecycle_tasks', tpl.map(([title, category, owner, offset]) => ({ employee_id: e.id, kind: 'Onboarding', title, category, owner, due_date: addDays(e.hire_date || today(), offset), status: 'Pending', completed_date: null })));
  await db.update('employees', e.id, { status: 'Onboarding' });
  await audit(ctx, 'start_onboarding', 'employees', e.id);
  return { ok: true, tasks: tpl.length };
}

async function startOffboarding(ctx, body) {
  const e = await db.one('SELECT * FROM employees WHERE id = ?', [body.employee_id]);
  if (!e) fail(404, 'Employee not found');
  const sepRes = resources.separations;
  const sep = validate(sepRes, { notice_date: today(), final_pay_status: 'Pending', ...body }, false);
  const sepId = await db.insert('separations', sep);
  const tpl = await db.getSetting('offboarding_template', DEFAULT_OFFBOARDING);
  const assets = await db.query('SELECT * FROM assets WHERE employee_id = ?', [e.id]);
  const tasks = tpl.map(([title, category, owner, offset]) => ({ employee_id: e.id, kind: 'Offboarding', title, category, owner, due_date: addDays(sep.last_day, offset), status: 'Pending', completed_date: null }));
  assets.forEach((a) => tasks.push({ employee_id: e.id, kind: 'Offboarding', title: `Return asset ${a.tag} (${a.name})`, category: 'Equipment', owner: 'IT', due_date: sep.last_day, status: 'Pending', completed_date: null }));
  await db.insertMany('lifecycle_tasks', tasks);
  await db.update('employees', e.id, { status: 'Offboarding' });
  await audit(ctx, 'start_offboarding', 'employees', e.id, { separation: sepId });
  return { ok: true, separation_id: sepId, tasks: tasks.length };
}

async function completeLifecycle(ctx, kind, employeeId) {
  const e = await db.one('SELECT * FROM employees WHERE id = ?', [employeeId]);
  if (!e) fail(404, 'Employee not found');
  if (kind === 'onboarding') {
    await db.update('employees', e.id, { status: 'Probation' });
  } else {
    const sep = await db.one('SELECT last_day FROM separations WHERE employee_id = ? ORDER BY id DESC', [e.id]);
    await db.update('employees', e.id, { status: 'Terminated', termination_date: sep?.last_day || today() });
    await db.run("UPDATE assets SET employee_id = NULL, status = 'Available', assigned_date = NULL WHERE employee_id = ?", [e.id]);
    await db.run('UPDATE users SET active = 0 WHERE employee_id = ?', [e.id]);
    await db.run("UPDATE benefit_enrollments SET status = 'Ended' WHERE employee_id = ?", [e.id]);
  }
  await audit(ctx, `complete_${kind}`, 'employees', e.id);
  return { ok: true };
}

async function hireCandidate(ctx, body) {
  const c = await db.one('SELECT * FROM candidates WHERE id = ?', [body.candidate_id]);
  if (!c) fail(404, 'Candidate not found');
  const job = await db.one('SELECT * FROM job_openings WHERE id = ?', [c.job_id]);
  const [first, ...rest] = c.full_name.split(' ');
  const count = await db.one('SELECT COUNT(*) AS c FROM employees');
  const empData = validate(resources.employees, {
    emp_no: `GG-${String(Number(count.c) + 1001).padStart(4, '0')}`, first_name: first, last_name: rest.join(' ') || '-',
    email: body.email || c.email, phone: c.phone, job_title: body.job_title || job?.title, department_id: body.department_id || job?.department_id,
    manager_id: body.manager_id || job?.hiring_manager_id, location: job?.location, employment_type: job?.employment_type || 'Full-time',
    hire_date: body.hire_date || today(), status: 'Onboarding', base_salary: body.base_salary || c.expected_salary,
  }, false);
  await hooks.employees.before(empData, ctx, null);
  const empId = await db.insert('employees', empData);
  await db.update('candidates', c.id, { stage: 'Hired' });
  await startOnboarding(ctx, empId);
  const tempPassword = `Welcome@${Math.floor(1000 + Math.random() * 9000)}`;
  if (empData.email && !(await db.one('SELECT id FROM users WHERE email = ?', [empData.email.toLowerCase()]))) {
    await db.insert('users', { email: empData.email.toLowerCase(), password_hash: bcrypt.hashSync(tempPassword, 10), role: 'employee', employee_id: empId, active: 1 });
  }
  if (job) {
    const hired = await db.one("SELECT COUNT(*) AS c FROM candidates WHERE job_id = ? AND stage = 'Hired'", [job.id]);
    if (Number(hired.c) >= Number(job.openings || 1)) await db.update('job_openings', job.id, { status: 'Closed' });
  }
  await audit(ctx, 'hire', 'candidates', c.id, { employee_id: empId });
  return { ok: true, employee_id: empId, login: empData.email, temp_password: tempPassword };
}

// ---------- dashboards & analytics ----------
const monthsBack = (n) => { const out = []; const d = new Date(`${today().slice(0, 7)}-01T00:00:00Z`); for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() - i); out.push(x.toISOString().slice(0, 7)); } return out; };

async function dashboard(ctx) {
  const me = ctx.user.employee_id;
  const t = today();
  const out = { today: t, role: ctx.user.role };
  if (me) {
    const e = await db.one('SELECT id, first_name, last_name, job_title, leave_balance, hire_date, status FROM employees WHERE id = ?', [me]);
    const open = await db.one('SELECT id, clock_in FROM time_entries WHERE employee_id = ? AND work_date = ? AND clock_out IS NULL', [me, t]);
    const shifts = await db.query('SELECT shift_date, start_time, end_time, site, shift_role FROM shifts WHERE employee_id = ? AND shift_date >= ? ORDER BY shift_date, start_time', [me, t]);
    const tasks = await db.query("SELECT id, title, due_date, kind FROM lifecycle_tasks WHERE employee_id = ? AND owner = 'Employee' AND status <> 'Done' ORDER BY due_date", [me]);
    const pols = await db.query('SELECT p.id, p.title FROM policies p WHERE p.requires_ack = 1 AND NOT EXISTS (SELECT 1 FROM policy_acks a WHERE a.policy_id = p.id AND a.employee_id = ?)', [me]);
    const slip = (await db.query("SELECT p.id, p.period, p.net FROM payslips p JOIN payroll_runs r ON r.id = p.run_id WHERE p.employee_id = ? AND r.status = 'Paid' ORDER BY p.period DESC", [me]))[0] || null;
    const goals = await db.query("SELECT title, progress, status FROM goals WHERE employee_id = ? AND status <> 'Completed' ORDER BY due_date", [me]);
    const surveys = await db.query("SELECT s.id, s.title, s.question FROM surveys s WHERE s.status = 'Open' AND NOT EXISTS (SELECT 1 FROM survey_responses r WHERE r.survey_id = s.id AND r.employee_id = ?)", [me]);
    const myLeave = await db.query("SELECT leave_type, start_date, end_date, days, status FROM leave_requests WHERE employee_id = ? AND end_date >= ? AND status IN ('Pending', 'Approved') ORDER BY start_date", [me, t]);
    out.me = { employee: e, clocked_in: open, shifts: shifts.slice(0, 5), tasks, policies_to_ack: pols, latest_payslip: slip, goals: goals.slice(0, 4), open_surveys: surveys, upcoming_leave: myLeave };
  }
  out.announcements = (await db.query('SELECT id, title, body, posted_date, pinned FROM announcements ORDER BY pinned DESC, posted_date DESC')).slice(0, 4);
  out.recognitions = (await db.query(`SELECT r.badge, r.message, r.given_date, (SELECT CONCAT(x.first_name, ' ', x.last_name) FROM employees x WHERE x.id = r.from_id) AS from_name,
    (SELECT CONCAT(x.first_name, ' ', x.last_name) FROM employees x WHERE x.id = r.to_id) AS to_name FROM recognitions r ORDER BY r.given_date DESC, r.id DESC`)).slice(0, 5);
  const active = await db.query("SELECT id, first_name, last_name, dob, hire_date FROM employees WHERE status <> 'Terminated'");
  const md = t.slice(5, 7);
  out.celebrations = [
    ...active.filter((e) => e.dob && e.dob.slice(5, 7) === md).map((e) => ({ name: fullName(e), kind: 'Birthday', day: e.dob.slice(5) })),
    ...active.filter((e) => e.hire_date && e.hire_date.slice(5, 7) === md && e.hire_date.slice(0, 4) < t.slice(0, 4)).map((e) => ({ name: fullName(e), kind: `${Number(t.slice(0, 4)) - Number(e.hire_date.slice(0, 4))} year work anniversary`, day: e.hire_date.slice(5) })),
  ].sort((a, b) => a.day.localeCompare(b.day));

  if (ctx.user.role === 'manager' || isHR(ctx)) {
    const scope = isHR(ctx) ? null : ctx.team.filter((x) => x !== me);
    const inScope = (col) => (scope ? (scope.length ? `${col} IN (${scope.join(',')})` : '1=0') : '1=1');
    out.approvals = {
      leave: await db.query(`SELECT l.id, l.leave_type, l.start_date, l.end_date, l.days, (SELECT CONCAT(x.first_name, ' ', x.last_name) FROM employees x WHERE x.id = l.employee_id) AS name FROM leave_requests l WHERE l.status = 'Pending' AND ${inScope('l.employee_id')} AND l.employee_id <> ? ORDER BY l.start_date`, [me || -1]),
      timesheets: Number((await db.one(`SELECT COUNT(*) AS c FROM time_entries WHERE status = 'Submitted' AND ${inScope('employee_id')} AND employee_id <> ?`, [me || -1])).c),
      comp: isHR(ctx) ? Number((await db.one("SELECT COUNT(*) AS c FROM compensation_changes WHERE status IN ('Proposed', 'Approved')")).c) : 0,
    };
    out.team_on_leave = await db.query(`SELECT l.leave_type, l.end_date, (SELECT CONCAT(x.first_name, ' ', x.last_name) FROM employees x WHERE x.id = l.employee_id) AS name FROM leave_requests l WHERE l.status = 'Approved' AND l.start_date <= ? AND l.end_date >= ? AND ${inScope('l.employee_id')}`, [t, t]);
    if (scope) out.team_size = scope.length;
  }
  if (isHR(ctx)) {
    const cnt = async (sql, p = []) => Number((await db.one(sql, p)).c);
    const last = (await db.query('SELECT period, total_net, total_gross, status FROM payroll_runs ORDER BY period DESC'))[0] || null;
    out.kpis = {
      headcount: await cnt("SELECT COUNT(*) AS c FROM employees WHERE status <> 'Terminated'"),
      onboarding: await cnt("SELECT COUNT(*) AS c FROM employees WHERE status = 'Onboarding'"),
      offboarding: await cnt("SELECT COUNT(*) AS c FROM employees WHERE status = 'Offboarding'"),
      open_roles: await cnt("SELECT COUNT(*) AS c FROM job_openings WHERE status = 'Open'"),
      candidates_active: await cnt("SELECT COUNT(*) AS c FROM candidates WHERE stage NOT IN ('Hired', 'Rejected')"),
      compliance_due: await cnt("SELECT COUNT(*) AS c FROM compliance_items WHERE status <> 'Completed' AND due_date <= ?", [addDays(t, 30)]),
      compliance_overdue: await cnt("SELECT COUNT(*) AS c FROM compliance_items WHERE status <> 'Completed' AND due_date < ?", [t]),
      last_payroll: last,
    };
  }
  return out;
}

async function analytics(ctx) {
  const t = today();
  const emps = await db.query('SELECT e.*, (SELECT d.name FROM departments d WHERE d.id = e.department_id) AS department FROM employees e');
  const active = emps.filter((e) => e.status !== 'Terminated');
  const group = (rows, key) => { const m = {}; rows.forEach((r) => { const k = (typeof key === 'function' ? key(r) : r[key]) || 'Unspecified'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); };
  const months = monthsBack(12);
  const hires = months.map((mo) => ({ label: mo, value: emps.filter((e) => (e.hire_date || '').startsWith(mo)).length }));
  const exits = months.map((mo) => ({ label: mo, value: emps.filter((e) => (e.termination_date || '').startsWith(mo)).length }));
  const leavers12 = exits.reduce((a, x) => a + x.value, 0);
  const tenureYears = active.map((e) => (new Date(t) - new Date(e.hire_date)) / (365.25 * 864e5)).filter((x) => x >= 0);
  const ageYears = active.filter((e) => e.dob).map((e) => (new Date(t) - new Date(e.dob)) / (365.25 * 864e5));
  const ageBand = (a) => (a < 25 ? 'Under 25' : a < 35 ? '25-34' : a < 45 ? '35-44' : a < 55 ? '45-54' : '55+');

  const runs = await db.query('SELECT period, total_gross, total_net, total_paye, total_pension FROM payroll_runs ORDER BY period');
  const lastRun = runs[runs.length - 1];
  let payByDept = [];
  if (lastRun) {
    const slips = await db.query(`SELECT p.gross, (SELECT d.name FROM departments d WHERE d.id = e.department_id) AS department FROM payslips p
      JOIN payroll_runs r ON r.id = p.run_id LEFT JOIN employees e ON e.id = p.employee_id WHERE r.period = ?`, [lastRun.period]);
    const m = {}; slips.forEach((s) => { m[s.department || 'Unassigned'] = (m[s.department || 'Unassigned'] || 0) + Number(s.gross); });
    payByDept = Object.entries(m).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  }

  const year = t.slice(0, 4);
  const leave = await db.query("SELECT leave_type, days FROM leave_requests WHERE status = 'Approved' AND start_date >= ?", [`${year}-01-01`]);
  const leaveByType = {}; leave.forEach((l) => { leaveByType[l.leave_type] = (leaveByType[l.leave_type] || 0) + Number(l.days || 0); });

  const enr = await db.query('SELECT ce.status, c.mandatory FROM course_enrollments ce LEFT JOIN courses c ON c.id = ce.course_id');
  const mand = enr.filter((x) => x.mandatory);
  const reviews = await db.query("SELECT rating FROM performance_reviews WHERE rating IS NOT NULL AND status <> 'Draft'");
  const surveys = await db.query('SELECT id, title, open_date FROM surveys ORDER BY open_date');
  const enps = [];
  for (const s of surveys) {
    const rs = await db.query('SELECT score FROM survey_responses WHERE survey_id = ?', [s.id]);
    if (!rs.length) continue;
    const pro = rs.filter((r) => r.score >= 9).length; const det = rs.filter((r) => r.score <= 6).length;
    enps.push({ label: s.title, value: Math.round(((pro - det) / rs.length) * 100), responses: rs.length });
  }
  const cands = await db.query('SELECT stage FROM candidates');
  const stages = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'];
  const funnel = stages.map((st, i) => ({ label: st, value: cands.filter((c) => stages.indexOf(c.stage) >= i).length }));
  const since = addDays(t, -28);
  const hrs = await db.query('SELECT employee_id, work_date, hours FROM time_entries WHERE work_date >= ? AND hours IS NOT NULL', [since]);
  const totalHrs = hrs.reduce((a, h) => a + Number(h.hours), 0);
  const people = new Set(hrs.map((h) => h.employee_id)).size;
  const weeks = Math.max(1, new Set(hrs.map((h) => h.work_date)).size / 5);
  const compliance = await db.query('SELECT status, due_date FROM compliance_items');

  const avgHead = active.length + leavers12 / 2;
  return {
    as_of: t,
    headline: {
      headcount: active.length,
      turnover_rate: avgHead ? Math.round((leavers12 / avgHead) * 1000) / 10 : 0,
      avg_tenure: tenureYears.length ? Math.round((tenureYears.reduce((a, b) => a + b, 0) / tenureYears.length) * 10) / 10 : 0,
      avg_age: ageYears.length ? Math.round(ageYears.reduce((a, b) => a + b, 0) / ageYears.length) : 0,
      female_share: active.length ? Math.round((active.filter((e) => e.gender === 'Female').length / active.length) * 100) : 0,
      monthly_payroll: lastRun ? Number(lastRun.total_gross) : 0,
      training_completion: enr.length ? Math.round((enr.filter((x) => x.status === 'Completed').length / enr.length) * 100) : 0,
      mandatory_completion: mand.length ? Math.round((mand.filter((x) => x.status === 'Completed').length / mand.length) * 100) : 0,
      avg_rating: reviews.length ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10 : 0,
      enps: enps.length ? enps[enps.length - 1].value : null,
      avg_weekly_hours: people ? Math.round((totalHrs / people / weeks) * 10) / 10 : 0,
      compliance_on_track: compliance.length ? Math.round((compliance.filter((c) => c.status === 'Completed' || c.due_date >= t).length / compliance.length) * 100) : 100,
    },
    by_department: group(active, 'department'),
    by_location: group(active, 'location'),
    by_gender: group(active, 'gender'),
    by_type: group(active, 'employment_type'),
    by_age: ['Under 25', '25-34', '35-44', '45-54', '55+'].map((label) => ({ label, value: ageYears.filter((a) => ageBand(a) === label).length })),
    hires, exits,
    payroll_trend: runs.slice(-12).map((r) => ({ label: r.period, gross: Number(r.total_gross), net: Number(r.total_net), paye: Number(r.total_paye) })),
    payroll_by_department: payByDept,
    leave_by_type: Object.entries(leaveByType).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    rating_distribution: [1, 2, 3, 4, 5].map((r) => ({ label: String(r), value: reviews.filter((x) => x.rating === r).length })),
    enps, funnel,
  };
}

async function orgChart() {
  const rows = await db.query(`SELECT e.id, e.first_name, e.last_name, e.job_title, e.manager_id, e.location, e.status, e.department_id, e.photo,
    (SELECT d.name FROM departments d WHERE d.id = e.department_id) AS department FROM employees e WHERE e.status <> 'Terminated' ORDER BY e.last_name`);
  return rows;
}

async function clock(ctx) {
  const me = ctx.user.employee_id; if (!me) fail(400, 'Your account is not linked to an employee record');
  const t = today(); const now = nowTime();
  const open = await db.one('SELECT * FROM time_entries WHERE employee_id = ? AND work_date = ? AND clock_out IS NULL', [me, t]);
  if (open) {
    await db.update('time_entries', open.id, { clock_out: now, hours: hoursBetween(open.clock_in, now), status: 'Submitted' });
    await audit(ctx, 'clock_out', 'time_entries', open.id);
    return { clocked_in: false, at: now };
  }
  const id = await db.insert('time_entries', { employee_id: me, work_date: t, clock_in: now, status: 'Open', project: 'General' });
  await audit(ctx, 'clock_in', 'time_entries', id);
  return { clocked_in: true, at: now };
}

async function publicSettings() {
  const p = await payrollConfig();
  const company = await db.getSetting('company', { name: 'GO-Green Technologies' });
  return { company, currency: p.currency, symbol: p.symbol, locale: p.locale };
}

// ---------- routing ----------
async function route(req) {
  const { method } = req;
  const parts = req.path.replace(/^\/+|\/+$/g, '').replace(/^api\/?/, '').split('/').filter(Boolean);
  const body = req.body || {};
  const [a, b, c, dd] = parts;

  if (a === 'health') return { db: db.dialect, location: db.dialect === 'sqlite' ? 'local SQLite' : 'Azure SQL', demo: process.env.DEMO_DATA !== 'false', ok: true };

  await ensureReady();

  if (a === 'auth' && b === 'login' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const user = await db.one('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !user.active || !bcrypt.compareSync(String(body.password || ''), user.password_hash || '')) fail(401, 'Incorrect email or password');
    await db.run('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), user.id]);
    await audit({ user }, 'login', 'users', user.id);
    return { token: jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '12h' }) };
  }

  const ctx = await authenticate(req.headers || {});
  const needHR = () => { if (!isHR(ctx)) fail(403, 'HR access required'); };
  const needAdmin = () => { if (ctx.user.role !== 'admin') fail(403, 'Admin access required'); };

  if (a === 'auth' && b === 'password' && method === 'POST') {
    const u = await db.one('SELECT password_hash FROM users WHERE id = ?', [ctx.user.id]);
    if (!bcrypt.compareSync(String(body.current || ''), u.password_hash)) fail(400, 'Current password is incorrect');
    if (String(body.next || '').length < 8) fail(400, 'New password must be at least 8 characters');
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(String(body.next), 10), ctx.user.id]);
    await audit(ctx, 'change_password', 'users', ctx.user.id);
    return { ok: true };
  }

  if (a === 'meta' && method === 'GET') {
    const me = ctx.user.employee_id ? await db.one('SELECT id, first_name, last_name, job_title, department_id, photo FROM employees WHERE id = ?', [ctx.user.employee_id]) : null;
    const res = {};
    for (const r of Object.values(resources)) {
      const perms = { r: scopeFor(r, ctx, 'r'), c: scopeFor(r, ctx, 'c'), u: scopeFor(r, ctx, 'u'), d: scopeFor(r, ctx, 'd') };
      if (!perms.r && !perms.c) continue;
      res[r.key] = { key: r.key, label: r.label, module: r.module, owner: r.owner, title: r.title, readonly: !!r.readonly, perms, fields: r.fields };
    }
    return { user: { ...ctx.user, name: me ? fullName(me) : ctx.user.email, job_title: me?.job_title, photo: me?.photo || null }, team: ctx.team, resources: res, settings: await publicSettings(), db: db.dialect };
  }

  if (a === 'lookup' && b && method === 'GET') {
    // Lightweight id/label lists for dropdowns. Everyone signed in may look up names.
    const label = REF_LABEL[b]; if (!label || b === 'users') fail(404, 'Unknown lookup');
    const extra = b === 'employees' ? ", x.status AS status, x.job_title AS sub" : '';
    return db.query(`SELECT x.id AS id, ${label} AS label${extra} FROM ${b} x ORDER BY ${label}`);
  }

  if (a === 'r' && b) {
    const res = resources[b]; if (!res) fail(404, 'Unknown module');
    if (method === 'GET' && !c) return listRows(res, ctx, req.query || {});
    if (method === 'GET' && c) return sanitize(res, ctx, (await getRow(res, ctx, Number(c))).row);
    if (method === 'POST' && !c) return createRow(res, ctx, body);
    if ((method === 'PUT' || method === 'PATCH') && c) return updateRow(res, ctx, Number(c), body);
    if (method === 'DELETE' && c) return deleteRow(res, ctx, Number(c));
  }

  if (a === 'dashboard') return dashboard(ctx);
  if (a === 'orgchart') return orgChart();
  if (a === 'analytics') { needHR(); return analytics(ctx); }
  if (a === 'me' && b === 'clock' && method === 'POST') return clock(ctx);

  if (a === 'payroll') {
    if (b === 'payslip' && c) {
      const s = await db.one(`SELECT p.*, e.emp_no, CONCAT(e.first_name, ' ', e.last_name) AS name, e.job_title, e.bank_name, e.bank_account, e.pension_pfa, e.pension_pin, e.tax_id,
        (SELECT d.name FROM departments d WHERE d.id = e.department_id) AS department FROM payslips p LEFT JOIN employees e ON e.id = p.employee_id WHERE p.id = ?`, [Number(c)]);
      if (!s) fail(404, 'Payslip not found');
      if (!isHR(ctx) && s.employee_id !== ctx.user.employee_id) fail(403, 'Not allowed');
      if (!isHR(ctx) && (await db.one('SELECT status FROM payroll_runs WHERE id = ?', [s.run_id]))?.status !== 'Paid') fail(403, 'This payslip is not released yet');
      return { slip: s, company: (await publicSettings()).company };
    }
    needHR();
    if (b === 'config' && method === 'GET') return payrollConfig();
    if (b === 'preview' && method === 'POST') return payrollPreview(body.period, body.extras);
    if (b === 'run' && method === 'POST') return payrollRun(ctx, body);
    if (b === 'runs' && c && !dd && method === 'GET') return payrollDetail(Number(c));
    if (b === 'runs' && c && dd === 'status' && method === 'POST') {
      const run = await db.one('SELECT * FROM payroll_runs WHERE id = ?', [Number(c)]); if (!run) fail(404, 'Not found');
      const flow = { Draft: 'Approved', Approved: 'Paid' };
      if (body.status === 'Draft' && run.status === 'Approved') { /* reopen */ } else if (flow[run.status] !== body.status) fail(400, `A ${run.status} run cannot move to ${body.status}`);
      if (body.status === 'Approved' && run.created_by === ctx.user.id && ctx.user.role !== 'admin') fail(403, 'A different HR user or an admin must approve this run (four-eyes rule)');
      await db.update('payroll_runs', run.id, { status: body.status });
      await audit(ctx, `payroll_${body.status.toLowerCase()}`, 'payroll_runs', run.id, { period: run.period });
      return payrollDetail(run.id);
    }
    if (b === 'runs' && c && dd === 'delete' && method === 'POST') {
      const run = await db.one('SELECT * FROM payroll_runs WHERE id = ?', [Number(c)]);
      if (!run || run.status !== 'Draft') fail(400, 'Only draft runs can be deleted');
      await db.run('DELETE FROM payslips WHERE run_id = ?', [run.id]); await db.remove('payroll_runs', run.id);
      await audit(ctx, 'delete', 'payroll_runs', run.id, { period: run.period });
      return { ok: true };
    }
  }

  if (a === 'lifecycle') {
    needHR();
    if (b === 'onboard' && method === 'POST') return startOnboarding(ctx, Number(body.employee_id));
    if (b === 'offboard' && method === 'POST') return startOffboarding(ctx, { ...body, employee_id: Number(body.employee_id) });
    if (b === 'complete' && method === 'POST') return completeLifecycle(ctx, body.kind, Number(body.employee_id));
  }
  if (a === 'recruiting' && b === 'hire' && method === 'POST') { needHR(); return hireCandidate(ctx, body); }

  if (a === 'compliance' && b === 'policies' && method === 'GET') {
    const total = Number((await db.one("SELECT COUNT(*) AS c FROM employees WHERE status <> 'Terminated'")).c);
    const pols = await db.query('SELECT p.id, p.title, p.version, p.requires_ack, (SELECT COUNT(*) FROM policy_acks a WHERE a.policy_id = p.id) AS acks FROM policies p ORDER BY p.title');
    return pols.map((p) => ({ ...p, acks: Number(p.acks), total, rate: total ? Math.round((Number(p.acks) / total) * 100) : 0 }));
  }

  if (a === 'settings') {
    if (method === 'GET') { needAdmin(); return { company: await db.getSetting('company', {}), payroll: await payrollConfig(), leave_policy: await db.getSetting('leave_policy', { annual_days: 20 }), onboarding_template: await db.getSetting('onboarding_template', DEFAULT_ONBOARDING), offboarding_template: await db.getSetting('offboarding_template', DEFAULT_OFFBOARDING) }; }
    if (method === 'PUT') {
      needAdmin();
      for (const k of ['company', 'payroll', 'leave_policy', 'onboarding_template', 'offboarding_template']) if (body[k] !== undefined) await db.setSetting(k, body[k]);
      await audit(ctx, 'update', 'settings', null, Object.keys(body));
      return { ok: true };
    }
  }

  fail(404, `No route for ${method} /api/${parts.join('/')}`);
}

async function handle(req) {
  try {
    const out = await route(req);
    return { status: 200, body: out };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    console.error(e);
    return { status: 500, body: { error: 'Something went wrong on the server', detail: process.env.NODE_ENV === 'production' ? undefined : e.message } };
  }
}

module.exports = { handle, ensureReady };
