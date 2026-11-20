import { api, state, money, date, me, isHR, role, res, today, can } from '../api.js';
import { h, clear, toast, stat, card, badge, dataTable, editRecord, tabs, progress, pageHead, avatar, modal } from '../ui.js';
import { showPayslip } from './pay.js';

const greet = () => { const hr = Number(new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false })); return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; };

export function clockCard(d, onChange) {
  const clocked = d?.clocked_in;
  const timeEl = h('div', { class: 'time' });
  const tick = () => { timeEl.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' }); };
  tick(); const iv = setInterval(() => { if (!document.body.contains(timeEl)) clearInterval(iv); else tick(); }, 15000);
  return card('Time clock', h('div', { class: 'clock' }, timeEl,
    h('div', { class: 'grow' }, h('div', {}, clocked ? `Clocked in at ${clocked.clock_in}` : 'You are not clocked in'), h('div', { class: 'muted small' }, 'Lagos time (WAT)')),
    h('button', { class: `btn ${clocked ? 'danger solid' : 'primary'}`, onclick: async () => {
      try { const r = await api('me/clock', { method: 'POST' }); toast(r.clocked_in ? `Clocked in at ${r.at}` : `Clocked out at ${r.at}`); onChange?.(); } catch (e) { toast(e.message, 'err'); }
    } }, clocked ? 'Clock out' : 'Clock in')));
}

export function surveyPrompt(s, onDone) {
  let score = null;
  const btns = h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', margin: '8px 0' } });
  for (let i = 0; i <= 10; i++) btns.append(h('button', { class: 'btn sm', onclick: (e) => { score = i; [...btns.children].forEach((b) => b.classList.remove('primary')); e.target.classList.add('primary'); } }, String(i)));
  const comment = h('textarea', { rows: 2, placeholder: 'Anything you would like to add? (optional)', class: 'inline-input', style: { width: '100%' } });
  modal(s.title, h('div', {}, h('p', {}, s.question), h('div', { class: 'muted small' }, '0 = not at all likely, 10 = extremely likely'), btns, comment), {
    actions: [{ label: 'Later', onClick: (c) => c() }, { label: 'Submit', kind: 'primary', onClick: async (c) => {
      if (score == null) return toast('Pick a score from 0 to 10', 'err');
      try { await api('r/survey_responses', { method: 'POST', body: { survey_id: s.id, employee_id: me(), score, comment: comment.value } }); toast('Thanks for your feedback!'); c(); onDone?.(); } catch (e) { toast(e.message, 'err'); }
    } }],
  });
}

export async function dashboard(el) {
  const d = await api('dashboard');
  const reload = () => dashboard(clear(el));
  const name = state.meta.user.name.split(' ')[0];
  el.append(pageHead(`${greet()}, ${name}`, new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })));

  if (d.kpis) {
    const k = d.kpis; const pend = (d.approvals?.leave.length || 0) + (d.approvals?.timesheets || 0) + (d.approvals?.comp || 0);
    el.append(h('div', { class: 'stats' },
      stat('Headcount', k.headcount, `${k.onboarding} onboarding · ${k.offboarding} leaving`),
      stat('Open roles', k.open_roles, `${k.candidates_active} candidates in pipeline`),
      stat('Pending approvals', pend, 'Leave, timesheets and pay changes'),
      stat('Compliance due (30 days)', k.compliance_due, k.compliance_overdue ? `${k.compliance_overdue} overdue` : 'Nothing overdue', k.compliance_overdue ? 'alert' : ''),
      k.last_payroll ? stat(`Payroll ${k.last_payroll.period}`, money(k.last_payroll.total_net, { compact: true }), `Net pay · ${k.last_payroll.status}`) : null));
  }

  const left = h('div', { class: 'stack' }); const right = h('div', { class: 'stack' });
  el.append(h('div', { class: 'grid g2' }, left, right));

  if (d.me) {
    left.append(clockCard(d.me, reload));
    const todo = [];
    d.me.policies_to_ack.forEach((p) => todo.push(h('li', {}, h('span', { class: 'grow' }, h('div', {}, `Acknowledge: ${p.title}`), h('div', { class: 'sub' }, 'Policy sign-off required')),
      h('button', { class: 'btn sm primary', onclick: async () => { try { await api('r/policy_acks', { method: 'POST', body: { policy_id: p.id, employee_id: me() } }); toast('Acknowledged'); reload(); } catch (e) { toast(e.message, 'err'); } } }, 'I have read this'))));
    d.me.open_surveys.forEach((s) => todo.push(h('li', {}, h('span', { class: 'grow' }, h('div', {}, s.title), h('div', { class: 'sub' }, 'Pulse survey · 1 minute')), h('button', { class: 'btn sm primary', onclick: () => surveyPrompt(s, reload) }, 'Respond'))));
    d.me.tasks.forEach((t) => todo.push(h('li', {}, h('span', { class: 'grow' }, h('div', {}, t.title), h('div', { class: 'sub' }, `${t.kind} task · due ${date(t.due_date)}`)),
      h('button', { class: 'btn sm', onclick: async () => { try { await api(`r/lifecycle_tasks/${t.id}`, { method: 'PUT', body: { status: 'Done' } }); toast('Marked done'); reload(); } catch (e) { toast(e.message, 'err'); } } }, 'Mark done'))));
    left.append(card('Your to-do list', todo.length ? h('ul', { class: 'list' }, todo) : h('p', { class: 'muted' }, 'You are all caught up.')));

    const e = d.me.employee;
    left.append(h('div', { class: 'grid g2' },
      stat('Annual leave left', `${e?.leave_balance ?? 0} days`, d.me.upcoming_leave.length ? `Next: ${date(d.me.upcoming_leave[0].start_date)} (${d.me.upcoming_leave[0].status})` : 'No upcoming leave'),
      d.me.latest_payslip ? h('div', { class: 'stat', style: { cursor: 'pointer' }, onclick: () => showPayslip(d.me.latest_payslip.id) }, h('div', { class: 'stat-label' }, `Latest payslip · ${d.me.latest_payslip.period}`), h('div', { class: 'stat-value' }, money(d.me.latest_payslip.net)), h('div', { class: 'stat-sub' }, 'Net pay · click to view')) : stat('Latest payslip', '—', 'No payslips yet')));
    if (d.me.shifts.length) left.append(card('Your next shifts', h('ul', { class: 'list' }, d.me.shifts.map((s) => h('li', {}, h('span', { class: 'grow' }, h('div', {}, `${date(s.shift_date)} · ${s.start_time}–${s.end_time}`), h('div', { class: 'sub' }, `${s.site} · ${s.shift_role || ''}`)))))));
    if (d.me.goals.length) left.append(card('Your goals', h('ul', { class: 'list' }, d.me.goals.map((g) => h('li', {}, h('span', { class: 'grow' }, g.title), progress(g.progress), h('span', { class: 'small muted', style: { width: '36px', textAlign: 'right' } }, `${g.progress || 0}%`))))));
  }

  if (d.approvals) {
    const a = d.approvals;
    const items = a.leave.map((l) => h('li', {}, avatar(l.name, 'xs'), h('span', { class: 'grow' }, h('div', {}, `${l.name} · ${l.leave_type} leave`), h('div', { class: 'sub' }, `${date(l.start_date)} – ${date(l.end_date)} · ${l.days} days`)),
      h('button', { class: 'btn sm', onclick: () => decide(l.id, 'Rejected') }, 'Reject'), h('button', { class: 'btn sm primary', onclick: () => decide(l.id, 'Approved') }, 'Approve')));
    const decide = async (id, status) => { try { await api(`r/leave_requests/${id}`, { method: 'PUT', body: { status } }); toast(`Leave ${status.toLowerCase()}`); reload(); } catch (e) { toast(e.message, 'err'); } };
    const extra = [];
    if (a.timesheets) extra.push(h('li', {}, h('span', { class: 'grow' }, `${a.timesheets} timesheet entries waiting`), h('a', { class: 'btn sm', href: '#/time' }, 'Review')));
    if (a.comp) extra.push(h('li', {}, h('span', { class: 'grow' }, `${a.comp} compensation changes to approve or apply`), h('a', { class: 'btn sm', href: '#/compensation' }, 'Review')));
    right.append(card(`Approvals${d.team_size ? ` · team of ${d.team_size}` : ''}`, items.length || extra.length ? h('ul', { class: 'list' }, items, extra) : h('p', { class: 'muted' }, 'No approvals waiting.')));
    if (d.team_on_leave.length) right.append(card('Out of office today', h('ul', { class: 'list' }, d.team_on_leave.map((x) => h('li', {}, avatar(x.name, 'xs'), h('span', { class: 'grow' }, x.name), h('span', { class: 'sub' }, `${x.leave_type} until ${date(x.end_date)}`))))));
  }

  right.append(card('Announcements', d.announcements.length ? h('ul', { class: 'list' }, d.announcements.map((x) => h('li', { style: { alignItems: 'flex-start' } }, h('span', { class: 'grow' }, h('div', {}, h('b', {}, x.title), x.pinned ? h('span', { class: 'badge neutral', style: { marginLeft: '6px' } }, 'Pinned') : ''), h('div', { class: 'sub' }, x.body), h('div', { class: 'sub' }, date(x.posted_date)))))) : h('p', { class: 'muted' }, 'No announcements.')));
  right.append(card('Recognition wall', d.recognitions.length ? h('ul', { class: 'list' }, d.recognitions.map((r) => h('li', { style: { alignItems: 'flex-start' } }, avatar(r.to_name, 'xs'), h('span', { class: 'grow' }, h('div', {}, h('b', {}, r.to_name), ' · ', h('span', { class: 'badge good' }, r.badge)), h('div', { class: 'sub' }, `"${r.message}" from ${r.from_name}`))))) : h('p', { class: 'muted' }, 'Be the first to recognise a colleague.'),
    can('recognitions', 'c') ? h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onclick: () => editRecord('recognitions', null, { onSaved: reload, hide: ['from_id', 'given_date'] }) }, 'Recognise a colleague')) : null));
  if (d.celebrations.length) right.append(card('Celebrations this month', h('ul', { class: 'list' }, d.celebrations.map((c) => h('li', {}, h('span', { 'aria-hidden': 'true' }, c.kind === 'Birthday' ? '🎂' : '🎉'), h('span', { class: 'grow' }, c.name), h('span', { class: 'sub' }, `${c.kind} · ${date(`2000-${c.day}`).replace(' 2000', '')}`))))));
}

// ---------- Employee self-service ----------
export async function workspace(el) {
  const id = me();
  const emp = await api(`r/employees/${id}`);
  const q = { employee_id: id };
  const reloadPage = () => workspace(clear(el));
  el.append(pageHead('My workspace', 'Your profile, pay, time off, benefits, learning and more in one place.'));
  el.append(tabs([
    { id: 'profile', label: 'Profile', render: () => profileTab(emp, reloadPage) },
    { id: 'pay', label: 'Payslips', render: () => dataTable('payslips', { query: q, columns: ['period', 'gross', 'pension_employee', 'paye', 'net'], onRow: (r) => showPayslip(r.id), allowCreate: false }) },
    { id: 'leave', label: 'Leave', render: () => h('div', { class: 'stack' },
      h('div', { class: 'stats' }, stat('Annual leave balance', `${emp.leave_balance ?? 0} days`, 'Approved annual leave is deducted automatically')),
      dataTable('leave_requests', { query: q, title: 'My leave requests', columns: ['leave_type', 'start_date', 'end_date', 'days', 'status'], hide: ['approver_id', 'requested_on', 'status'], empty: 'No leave requests yet.' })) },
    { id: 'time', label: 'Timesheets', render: () => h('div', { class: 'stack' }, clockCardLoader(), dataTable('time_entries', { query: q, columns: ['work_date', 'clock_in', 'clock_out', 'hours', 'project', 'status'], defaults: { work_date: today(), status: 'Submitted' }, hide: ['status'] })) },
    { id: 'shifts', label: 'My shifts', show: can('shifts', 'r'), render: () => dataTable('shifts', { query: q, columns: ['shift_date', 'start_time', 'end_time', 'site', 'shift_role', 'status'] }) },
    { id: 'benefits', label: 'Benefits', render: () => benefitsTab(id) },
    { id: 'learning', label: 'Learning', render: () => learningTab(id) },
    { id: 'goals', label: 'Goals & reviews', render: () => h('div', { class: 'stack' },
      dataTable('goals', { query: q, title: 'My goals', columns: ['title', 'category', 'due_date', 'progress', 'status'] }),
      dataTable('performance_reviews', { query: q, title: 'My reviews', columns: ['cycle', 'reviewer_id', 'rating', 'status', 'review_date'] }),
      dataTable('employee_skills', { query: q, title: 'My skills', columns: ['skill', 'proficiency', 'certified'] })) },
    { id: 'assets', label: 'My equipment', render: () => dataTable('assets', { query: q, columns: ['tag', 'name', 'category', 'assigned_date', 'condition_note'], empty: 'No equipment assigned to you.' }) },
    { id: 'policies', label: 'Policies', render: () => policiesTab(id) },
  ]));
}

function clockCardLoader() {
  const box = h('div');
  api('dashboard').then((d) => box.append(clockCard(d.me, () => location.reload())));
  return box;
}

function profileTab(emp, reload) {
  const r = res('employees');
  const show = (n) => { const f = r.fields.find((x) => x.name === n); const v = emp[n]; if (f?.type === 'ref') return emp[`${n}__label`] || '—'; if (f?.type === 'money') return money(v); if (f?.type === 'date') return date(v); return v ?? '—'; };
  const group = (title, names) => card(title, h('div', { class: 'kv' }, names.map((n) => h('div', {}, h('span', {}, r.fields.find((f) => f.name === n)?.label || n), h('b', {}, show(n))))));
  const name = `${emp.first_name} ${emp.last_name}`;
  return h('div', { class: 'stack' },
    card(null, h('div', { class: 'profile-head' }, avatar(name, 'lg', emp.photo), h('div', { class: 'grow' }, h('h2', {}, name), h('div', { class: 'muted' }, `${emp.job_title} · ${emp.department_id__label || ''} · ${emp.location || ''}`), h('div', { style: { marginTop: '6px' } }, badge(emp.status), ' ', h('span', { class: 'muted small' }, `${emp.emp_no} · joined ${date(emp.hire_date)}`))),
      h('button', { class: 'btn primary', onclick: () => editSelf(emp, reload) }, 'Update my details'))),
    group('Work', ['email', 'phone', 'manager_id', 'employment_type', 'grade', 'hire_date']),
    group('Personal', ['dob', 'gender', 'marital_status', 'state_of_origin', 'address', 'emergency_name', 'emergency_phone']),
    group('Pay & statutory', ['base_salary', 'bank_name', 'bank_account', 'pension_pfa', 'pension_pin', 'tax_id', 'nhf_no', 'annual_rent']));
}

async function editSelf(emp, reload) {
  const { buildForm } = await import('../ui.js');
  const r = res('employees');
  const only = isHR() ? undefined : r.fields.filter((f) => f.self).map((f) => f.name);
  const form = await buildForm(r, emp, { only });
  modal('Update my details', h('div', {}, h('p', { class: 'muted' }, isHR() ? 'As HR you can edit every field.' : 'You can update your photo, contact, bank and statutory details. Ask HR to change anything else.'), form), {
    wide: true,
    actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Save', kind: 'primary', onClick: async (c) => {
      try { await api(`r/employees/${emp.id}`, { method: 'PUT', body: form.values() }); toast('Details updated'); c(); reload(); } catch (e) { toast(e.message, 'err'); }
    } }],
  });
}

function benefitsTab(id) {
  const box = h('div', { class: 'stack' });
  const mine = dataTable('benefit_enrollments', { query: { employee_id: id }, title: 'My enrolments', columns: ['plan_id', 'coverage', 'dependents', 'start_date', 'status'], allowCreate: false });
  box.append(mine);
  api('r/benefit_plans').then((plans) => {
    box.append(card('Available plans', h('ul', { class: 'list' }, plans.filter((p) => p.active).map((p) => h('li', { style: { alignItems: 'flex-start' } },
      h('span', { class: 'grow' }, h('div', {}, h('b', {}, p.name), ' · ', h('span', { class: 'muted' }, p.category)), h('div', { class: 'sub' }, p.description), h('div', { class: 'sub' }, `${p.provider || ''} · Eligibility: ${p.eligibility || 'All'} · Your cost: ${money(p.employee_cost)}/month`)),
      h('button', { class: 'btn sm', onclick: () => editRecord('benefit_enrollments', null, { defaults: { plan_id: p.id, start_date: today(), status: 'Pending' }, hide: ['status'], lock: ['plan_id'], title: `Enrol in ${p.name}`, onSaved: () => mine.reload() }) }, 'Enrol'))))));
  });
  return box;
}

function learningTab(id) {
  const box = h('div', { class: 'stack' });
  const mine = dataTable('course_enrollments', { query: { employee_id: id }, title: 'My training', columns: ['course_id', 'status', 'progress', 'enrolled_date', 'completed_date'], allowCreate: false });
  box.append(mine);
  api('r/courses').then((cs) => box.append(card('Course catalogue', h('ul', { class: 'list' }, cs.map((c) => h('li', {},
    h('span', { class: 'grow' }, h('div', {}, h('b', {}, c.title), c.mandatory ? h('span', { class: 'badge warn', style: { marginLeft: '6px' } }, 'Mandatory') : ''), h('div', { class: 'sub' }, `${c.category} · ${c.provider} · ${c.duration_hours}h · ${c.delivery}`)),
    h('button', { class: 'btn sm', onclick: async () => { try { await api('r/course_enrollments', { method: 'POST', body: { course_id: c.id, employee_id: id, status: 'Enrolled', progress: 0 } }); toast('Enrolled'); mine.reload(); } catch (e) { toast(e.message, 'err'); } } }, 'Enrol')))))));
  return box;
}

function policiesTab(id) {
  const box = h('div');
  Promise.all([api('r/policies'), api('r/policy_acks', { query: { employee_id: id } })]).then(([pols, acks]) => {
    const done = new Map(acks.map((a) => [a.policy_id, a.ack_date]));
    box.append(card('Company policies', h('ul', { class: 'list' }, pols.map((p) => h('li', { style: { alignItems: 'flex-start' } },
      h('span', { class: 'grow' }, h('div', {}, h('b', {}, p.title), h('span', { class: 'muted' }, ` · v${p.version} · effective ${date(p.effective_date)}`)), h('div', { class: 'sub' }, p.body)),
      done.has(p.id) ? badge('Acknowledged') : p.requires_ack ? h('button', { class: 'btn sm primary', onclick: async () => { try { await api('r/policy_acks', { method: 'POST', body: { policy_id: p.id, employee_id: id } }); toast('Acknowledged'); clear(box).append(policiesTab(id)); } catch (e) { toast(e.message, 'err'); } } }, 'Acknowledge') : h('span', { class: 'muted small' }, 'For information'))))));
  });
  return box;
}

export { greet, role };
