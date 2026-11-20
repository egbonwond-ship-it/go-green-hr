import { api, money, date, isHR, res, can, today, lookup, me } from '../api.js';
import { h, clear, toast, card, badge, dataTable, editRecord, tabs, progress, pageHead, avatar, modal, buildForm, confirmBox, personCell, photoChanger } from '../ui.js';

export async function employees(el) {
  const tbl = dataTable('employees', {
    columns: ['emp_no', 'first_name', 'last_name', 'job_title', 'department_id', 'location', 'status'],
    filters: ['department_id', 'status', 'location'],
    onRow: (r) => { location.hash = `#/employees/${r.id}`; },
    defaults: { status: 'Onboarding', hire_date: today(), employment_type: 'Full-time' },
    extraActions: () => (isHR() ? h('button', { class: 'btn', onclick: () => exportCsv() }, 'Export CSV') : null),
  });
  el.append(pageHead('Employees', 'The central record for every GO-Green employee. Click a person to open their full profile.'), tbl);
}

async function exportCsv() {
  const rows = await api('r/employees');
  const r = res('employees');
  const cols = r.fields.filter((f) => f.type !== 'password').map((f) => f.name);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((row) => cols.map((c) => esc(r.fields.find((f) => f.name === c).type === 'ref' ? row[`${c}__label`] : row[c])).join(','))].join('\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `go-green-employees-${today()}.csv` });
  document.body.append(a); a.click(); a.remove();
}

export async function profile(el, id) {
  id = Number(id);
  const e = await api(`r/employees/${id}`);
  const name = `${e.first_name} ${e.last_name}`;
  const reload = () => profile(clear(el), id);
  const q = { employee_id: id };
  const r = res('employees');
  const val = (n) => { const f = r.fields.find((x) => x.name === n); const v = e[n]; if (v == null || v === '') return f?.type === 'ref' ? (e[`${n}__label`] || '—') : '—'; if (f?.type === 'ref') return e[`${n}__label`]; if (f?.type === 'money') return money(v); if (f?.type === 'date') return date(v); return v; };
  const kv = (names) => h('div', { class: 'kv' }, names.filter((n) => e[n] !== undefined || r.fields.find((f) => f.name === n)?.type === 'ref').map((n) => h('div', {}, h('span', {}, r.fields.find((f) => f.name === n)?.label || n), h('b', {}, val(n)))));
  const actions = [];
  if (can('employees', 'u') && isHR()) actions.push(h('button', { class: 'btn', onclick: () => editRecord('employees', e, { onSaved: reload }) }, 'Edit record'));
  if (isHR() && !['Terminated', 'Offboarding'].includes(e.status)) actions.push(h('button', { class: 'btn danger', onclick: () => startOffboarding(e, reload) }, 'Start offboarding'));
  if (isHR() && e.status === 'Onboarding') actions.push(h('button', { class: 'btn primary', onclick: async () => { await api('lifecycle/complete', { method: 'POST', body: { kind: 'onboarding', employee_id: id } }); toast('Onboarding complete · now on probation'); reload(); } }, 'Complete onboarding'));
  if (isHR() && e.status === 'Offboarding') actions.push(h('button', { class: 'btn danger solid', onclick: async () => { if (await confirmBox(`Complete offboarding for ${name}? Their login is disabled, assets are returned to stock and benefits end.`, 'Complete offboarding')) { await api('lifecycle/complete', { method: 'POST', body: { kind: 'offboarding', employee_id: id } }); toast('Offboarding complete'); reload(); } } }, 'Complete offboarding'));

  el.append(h('p', {}, h('a', { href: '#/employees' }, '← All employees')));
  el.append(card(null, h('div', { class: 'profile-head' }, isHR() || e.id === me() ? photoChanger(name, e.photo, e.id, reload) : avatar(name, 'lg', e.photo),
    h('div', { class: 'grow' }, h('h1', {}, name), h('div', { class: 'muted' }, `${e.job_title} · ${e.department_id__label || ''} · ${e.location || ''}`),
      h('div', { style: { marginTop: '6px' } }, badge(e.status), ' ', h('span', { class: 'muted small' }, `${e.emp_no} · joined ${date(e.hire_date)}${e.manager_id__label ? ` · reports to ${e.manager_id__label}` : ''}`))),
    h('div', { class: 'actions', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, actions))));
  el.append(h('div', { style: { height: '16px' } }));
  const t = [
    { id: 'overview', label: 'Overview', render: () => h('div', { class: 'stack' }, card('Work', kv(['email', 'phone', 'manager_id', 'department_id', 'employment_type', 'grade', 'hire_date', 'leave_balance'])),
      e.base_salary !== undefined ? card('Personal', kv(['dob', 'gender', 'marital_status', 'state_of_origin', 'address', 'emergency_name', 'emergency_phone'])) : null,
      e.base_salary !== undefined ? card('Pay & statutory', kv(['base_salary', 'bank_name', 'bank_account', 'pension_pfa', 'pension_pin', 'tax_id', 'nhf_no', 'annual_rent'])) : null) },
    { id: 'comp', label: 'Compensation', show: can('compensation_changes', 'r'), render: () => dataTable('compensation_changes', { query: q, defaults: { employee_id: id, effective_date: today(), status: 'Proposed' }, columns: ['effective_date', 'change_type', 'old_salary', 'new_salary', 'status'] }) },
    { id: 'pay', label: 'Payslips', show: isHR(), render: () => dataTable('payslips', { query: q, columns: ['period', 'gross', 'paye', 'pension_employee', 'net'], onRow: async (row) => (await import('./pay.js')).showPayslip(row.id) }) },
    { id: 'time', label: 'Leave & time', show: can('leave_requests', 'r'), render: () => h('div', { class: 'stack' }, dataTable('leave_requests', { query: q, title: 'Leave', defaults: { employee_id: id }, columns: ['leave_type', 'start_date', 'end_date', 'days', 'status'] }), dataTable('time_entries', { query: q, title: 'Timesheets', defaults: { employee_id: id, work_date: today() }, columns: ['work_date', 'clock_in', 'clock_out', 'hours', 'project', 'status'] })) },
    { id: 'perf', label: 'Performance', show: can('goals', 'r'), render: () => h('div', { class: 'stack' }, dataTable('goals', { query: q, title: 'Goals', defaults: { employee_id: id }, columns: ['title', 'due_date', 'progress', 'status'] }), dataTable('performance_reviews', { query: q, title: 'Reviews', defaults: { employee_id: id }, columns: ['cycle', 'reviewer_id', 'rating', 'status'] }), dataTable('employee_skills', { query: q, title: 'Skills', defaults: { employee_id: id }, columns: ['skill', 'proficiency', 'certified'] })) },
    { id: 'learn', label: 'Training', show: can('course_enrollments', 'r'), render: () => dataTable('course_enrollments', { query: q, defaults: { employee_id: id }, columns: ['course_id', 'status', 'progress', 'completed_date', 'score'] }) },
    { id: 'benefits', label: 'Benefits', show: isHR(), render: () => dataTable('benefit_enrollments', { query: q, defaults: { employee_id: id }, columns: ['plan_id', 'coverage', 'dependents', 'start_date', 'status'] }) },
    { id: 'assets', label: 'Assets', show: can('assets', 'r'), render: () => dataTable('assets', { query: q, allowCreate: false, columns: ['tag', 'name', 'category', 'assigned_date', 'condition_note'] }) },
    { id: 'life', label: 'On/offboarding', show: can('lifecycle_tasks', 'r'), render: () => dataTable('lifecycle_tasks', { query: q, defaults: { employee_id: id, status: 'Pending' }, columns: ['kind', 'title', 'owner', 'due_date', 'status'] }) },
  ];
  el.append(tabs(t, 'overview'));
}

export async function startOffboarding(e, onDone) {
  const r = { ...res('separations'), perms: { c: 'all' } };
  const form = await buildForm(r, { employee_id: e.id, notice_date: today(), last_day: '', separation_type: 'Resignation', final_pay_status: 'Pending' }, { hide: ['exit_interview', 'final_pay_status'], lock: ['employee_id'] });
  modal(`Start offboarding · ${e.first_name} ${e.last_name}`, h('div', {}, h('p', { class: 'muted' }, 'Creates a separation record and an offboarding checklist, including a return task for every asset assigned to this person.'), form), {
    wide: true,
    actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Start offboarding', kind: 'primary', onClick: async (c) => {
      try { const out = await api('lifecycle/offboard', { method: 'POST', body: { ...form.values(), employee_id: e.id } }); toast(`Offboarding started · ${out.tasks} tasks created`); c(); onDone?.(); } catch (err) { toast(err.message, 'err'); }
    } }],
  });
}

// ---------- Org chart ----------
export async function orgChart(el) {
  const rows = await api('orgchart');
  const depts = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
  const byMgr = new Map();
  rows.forEach((r) => { const k = rows.some((x) => x.id === r.manager_id) ? r.manager_id : null; if (!byMgr.has(k)) byMgr.set(k, []); byMgr.get(k).push(r); });
  const size = (id) => (byMgr.get(id) || []).reduce((t, c) => t + 1 + size(c.id), 0);
  let search = ''; let dept = '';
  const tree = h('div', { class: 'org' });
  const collapsed = new Set();
  const matches = (r) => (!search || `${r.first_name} ${r.last_name} ${r.job_title}`.toLowerCase().includes(search)) && (!dept || r.department === dept);
  const visible = (r) => matches(r) || (byMgr.get(r.id) || []).some(visible);
  const node = (r) => {
    const kids = (byMgr.get(r.id) || []).filter(visible);
    const nm = `${r.first_name} ${r.last_name}`;
    const open = !collapsed.has(r.id) || search || dept;
    return h('li', {},
      kids.length ? h('button', { class: 'org-toggle', 'aria-label': open ? 'Collapse' : 'Expand', onclick: () => { collapsed.has(r.id) ? collapsed.delete(r.id) : collapsed.add(r.id); draw(); } }, open ? '−' : '+') : h('span', { style: { display: 'inline-block', width: '28px' } }),
      h('span', { class: 'org-node', style: matches(r) && (search || dept) ? { borderColor: 'var(--brand)' } : {}, onclick: () => { location.hash = `#/employees/${r.id}`; } }, avatar(nm, '', r.photo), h('div', {}, h('b', {}, nm), h('span', {}, `${r.job_title} · ${r.department || ''}`)),
        size(r.id) ? h('span', { class: 'count', title: 'People in this reporting line' }, size(r.id)) : null),
      kids.length && open ? h('ul', {}, kids.map(node)) : null);
  };
  const draw = () => clear(tree).append(h('ul', {}, (byMgr.get(null) || []).filter(visible).map(node)));
  el.append(pageHead('Org chart', `${rows.length} people across ${depts.length} departments. Click a person to open their profile.`,
    h('input', { type: 'search', placeholder: 'Find a person or role…', oninput: (e) => { search = e.target.value.toLowerCase(); draw(); } }),
    h('select', { class: 'inline-input', onchange: (e) => { dept = e.target.value; draw(); } }, h('option', { value: '' }, 'All departments'), depts.map((d) => h('option', { value: d }, d))),
    h('button', { class: 'btn', onclick: () => { rows.forEach((r) => { if ((byMgr.get(r.id) || []).length && r.manager_id) collapsed.add(r.id); }); draw(); } }, 'Collapse all'),
    h('button', { class: 'btn', onclick: () => { collapsed.clear(); draw(); } }, 'Expand all')));
  el.append(card(null, tree));
  draw();
  if (can('departments', 'r')) el.append(h('div', { style: { height: '16px' } }), dataTable('departments', { title: 'Departments', columns: ['name', 'code', 'head_id', 'cost_center', 'location'] }));
}

// ---------- Onboarding & offboarding ----------
export async function lifecycle(el) {
  const draw = async () => {
    clear(el);
    const [tasks, emps] = await Promise.all([api('r/lifecycle_tasks'), api('r/employees')]);
    const people = emps.filter((x) => ['Onboarding', 'Offboarding'].includes(x.status));
    el.append(pageHead('Onboarding & offboarding', 'Checklists for joiners and leavers. Hiring a candidate in Recruiting starts onboarding automatically.',
      isHR() ? h('button', { class: 'btn', onclick: () => pickEmployee('Start onboarding checklist', emps.filter((x) => !['Terminated', 'Offboarding'].includes(x.status)), async (eid) => { const o = await api('lifecycle/onboard', { method: 'POST', body: { employee_id: eid } }); toast(`${o.tasks} onboarding tasks created`); draw(); }) }, 'Start onboarding') : null,
      isHR() ? h('button', { class: 'btn danger', onclick: () => pickEmployee('Start offboarding', emps.filter((x) => !['Terminated', 'Offboarding'].includes(x.status)), (eid) => startOffboarding(emps.find((x) => x.id === eid), draw)) }, 'Start offboarding') : null));
    const cards = people.map((p) => {
      const list = tasks.filter((t) => t.employee_id === p.id && t.kind === (p.status === 'Onboarding' ? 'Onboarding' : 'Offboarding'));
      const done = list.filter((t) => t.status === 'Done').length;
      const pct = list.length ? Math.round((done / list.length) * 100) : 0;
      const nm = `${p.first_name} ${p.last_name}`;
      return card(null,
        h('div', { class: 'profile-head', style: { marginBottom: '10px' } }, avatar(nm), h('div', { class: 'grow' }, h('a', { href: `#/employees/${p.id}` }, h('b', {}, nm)), h('div', { class: 'muted small' }, `${p.job_title} · ${p.status === 'Onboarding' ? `starts ${date(p.hire_date)}` : 'leaving'}`)), badge(p.status)),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } }, progress(pct), h('span', { class: 'small muted' }, `${done} of ${list.length} done`)),
        h('ul', { class: 'list' }, list.map((t) => h('li', {},
          h('input', { type: 'checkbox', checked: t.status === 'Done', disabled: !can('lifecycle_tasks', 'u'), 'aria-label': t.title, onchange: async (ev) => { try { await api(`r/lifecycle_tasks/${t.id}`, { method: 'PUT', body: { status: ev.target.checked ? 'Done' : 'Pending' } }); draw(); } catch (e) { toast(e.message, 'err'); } } }),
          h('span', { class: 'grow', style: t.status === 'Done' ? { textDecoration: 'line-through', color: 'var(--muted)' } : {} }, h('div', {}, t.title), h('div', { class: 'sub' }, `${t.owner} · due ${date(t.due_date)}`)),
          t.status !== 'Done' && t.due_date < today() ? badge('Overdue') : null))),
        isHR() && pct === 100 ? h('button', { class: 'btn primary', style: { marginTop: '10px' }, onclick: async () => { await api('lifecycle/complete', { method: 'POST', body: { kind: p.status === 'Onboarding' ? 'onboarding' : 'offboarding', employee_id: p.id } }); toast('Completed'); draw(); } }, `Complete ${p.status.toLowerCase()}`) : null);
    });
    el.append(cards.length ? h('div', { class: 'grid g3' }, cards) : card(null, h('p', { class: 'muted' }, 'Nobody is onboarding or offboarding right now.')));
    el.append(h('div', { style: { height: '16px' } }));
    el.append(tabs([
      { id: 'tasks', label: 'All tasks', render: () => dataTable('lifecycle_tasks', { columns: ['employee_id', 'kind', 'title', 'owner', 'due_date', 'status'], filters: ['kind', 'status', 'category'] }) },
      { id: 'sep', label: 'Separations & exit interviews', show: can('separations', 'r'), render: () => dataTable('separations', { columns: ['employee_id', 'separation_type', 'notice_date', 'last_day', 'reason', 'final_pay_status', 'rehire_eligible'], allowCreate: false }) },
    ]));
  };
  await draw();
}

function pickEmployee(title, list, onPick) {
  const sel = h('select', { class: 'inline-input', style: { width: '100%' } }, list.map((x) => h('option', { value: x.id }, `${x.first_name} ${x.last_name} · ${x.job_title}`)));
  modal(title, h('label', { class: 'field' }, h('span', {}, 'Employee'), sel), { actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Continue', kind: 'primary', onClick: async (c) => { c(); try { await onPick(Number(sel.value)); } catch (e) { toast(e.message, 'err'); } } }] });
}

export { personCell, lookup };
