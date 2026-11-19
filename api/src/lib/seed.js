// Demo data for Go-Green Technologies. Runs automatically on first start when the
// database has no users. Re-run with `npm run seed -- --reset` (local SQLite only).
const bcrypt = require('bcryptjs');
const db = require('./db');
const { DEFAULT_PAYROLL, computePayslip } = require('./payroll');

let seedState = 20261119;
const rnd = () => { seedState = (seedState * 1103515245 + 12345) % 2147483648; return seedState / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (ym, n) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const isWeekday = (date) => { const w = new Date(`${date}T00:00:00Z`).getUTCDay(); return w !== 0 && w !== 6; };

const DEPTS = [
  ['Executive Office', 'EXO', 'CC-100', 'Lagos HQ'], ['Human Resources', 'HRM', 'CC-110', 'Lagos HQ'], ['Finance', 'FIN', 'CC-120', 'Lagos HQ'],
  ['Solar Engineering', 'SOL', 'CC-200', 'Lagos HQ'], ['EV & Clean Mobility', 'EVM', 'CC-210', 'Abuja'], ['Recycling Operations', 'REC', 'CC-220', 'Lagos HQ'],
  ['Sales & Partnerships', 'SAL', 'CC-300', 'Lagos HQ'], ['Customer Success', 'CUS', 'CC-310', 'Ibadan'], ['IT & Data', 'ITD', 'CC-130', 'Lagos HQ'],
  ['Sustainability & ESG', 'ESG', 'CC-140', 'Port Harcourt'],
];

// [first, last, gender, title, deptIndex, managerIndex|null, grade, salary, location, hireDate]
const PEOPLE = [
  ['Adaeze', 'Okafor', 'Female', 'Chief Executive Officer', 0, null, 'GG8', 72000000, 'Lagos HQ', '2017-03-01'],
  ['Mojisola', 'Adekunle', 'Female', 'HR Director', 1, 0, 'GG7', 38000000, 'Lagos HQ', '2019-06-10'],
  ['Emeka', 'Nwosu', 'Male', 'Chief Financial Officer', 2, 0, 'GG7', 45000000, 'Lagos HQ', '2018-01-15'],
  ['Tunde', 'Bakare', 'Male', 'Head of Solar Engineering', 3, 0, 'GG7', 36000000, 'Lagos HQ', '2018-09-03'],
  ['Halima', 'Abubakar', 'Female', 'Head of EV & Mobility', 4, 0, 'GG7', 34000000, 'Abuja', '2020-02-17'],
  ['Chinedu', 'Eze', 'Male', 'Head of Recycling Operations', 5, 0, 'GG6', 28000000, 'Lagos HQ', '2019-11-04'],
  ['Funmilayo', 'Adeyemi', 'Female', 'Head of Sales & Partnerships', 6, 0, 'GG7', 33000000, 'Lagos HQ', '2020-05-11'],
  ['Ibrahim', 'Musa', 'Male', 'IT & Data Lead', 8, 0, 'GG6', 27000000, 'Lagos HQ', '2021-01-11'],
  ['Ngozi', 'Obi', 'Female', 'Head of Sustainability & ESG', 9, 0, 'GG6', 26000000, 'Port Harcourt', '2021-04-06'],
  ['Kelechi', 'Uche', 'Male', 'Customer Success Manager', 7, 6, 'GG5', 16500000, 'Ibadan', '2021-08-02'],
  ['Bisola', 'Ogunleye', 'Female', 'HR Business Partner', 1, 1, 'GG5', 14000000, 'Lagos HQ', '2022-02-14'],
  ['Yusuf', 'Bello', 'Male', 'Payroll & Benefits Officer', 1, 1, 'GG4', 9600000, 'Lagos HQ', '2022-07-04'],
  ['Amaka', 'Chukwu', 'Female', 'Talent Acquisition Specialist', 1, 1, 'GG4', 9000000, 'Lagos HQ', '2023-03-13'],
  ['Segun', 'Afolabi', 'Male', 'Financial Controller', 2, 2, 'GG5', 18000000, 'Lagos HQ', '2020-10-05'],
  ['Zainab', 'Lawal', 'Female', 'Accountant', 2, 13, 'GG4', 8400000, 'Lagos HQ', '2023-06-19'],
  ['Olumide', 'Ajayi', 'Male', 'Senior Solar PV Engineer', 3, 3, 'GG5', 17000000, 'Lagos HQ', '2020-03-09'],
  ['Chiamaka', 'Okonkwo', 'Female', 'Solar PV Engineer', 3, 15, 'GG4', 10800000, 'Lagos HQ', '2022-09-12'],
  ['Femi', 'Oyelaran', 'Male', 'Solar Installation Supervisor', 3, 15, 'GG3', 7200000, 'Lagos HQ', '2021-11-22'],
  ['Musa', 'Danjuma', 'Male', 'Solar Installation Technician', 3, 17, 'GG2', 4200000, 'Lagos HQ', '2023-01-09'],
  ['Blessing', 'Etim', 'Female', 'Solar Installation Technician', 3, 17, 'GG2', 4200000, 'Lagos HQ', '2024-02-05'],
  ['Ifeanyi', 'Okeke', 'Male', 'Battery Storage Engineer', 3, 3, 'GG4', 11400000, 'Lagos HQ', '2022-05-16'],
  ['Aisha', 'Garba', 'Female', 'EV Charging Engineer', 4, 4, 'GG4', 11000000, 'Abuja', '2022-08-01'],
  ['Daniel', 'Akpan', 'Male', 'Fleet Electrification Analyst', 4, 4, 'GG3', 8000000, 'Abuja', '2023-09-04'],
  ['Hauwa', 'Sani', 'Female', 'EV Field Technician', 4, 21, 'GG2', 4500000, 'Abuja', '2024-04-15'],
  ['Obinna', 'Ibe', 'Male', 'Recycling Plant Supervisor', 5, 5, 'GG3', 7000000, 'Lagos HQ', '2021-06-14'],
  ['Kemi', 'Adebayo', 'Female', 'Waste Sorting Lead', 5, 24, 'GG2', 4000000, 'Lagos HQ', '2022-10-03'],
  ['Sunday', 'Okon', 'Male', 'Plant Operator', 5, 24, 'GG1', 3000000, 'Lagos HQ', '2023-02-20'],
  ['Patience', 'Udo', 'Female', 'Plant Operator', 5, 24, 'GG1', 3000000, 'Lagos HQ', '2024-07-08'],
  ['Gbenga', 'Oladipo', 'Male', 'Logistics Coordinator', 5, 5, 'GG3', 6000000, 'Lagos HQ', '2022-12-05'],
  ['Tolu', 'Fashola', 'Female', 'Partnerships Manager', 6, 6, 'GG5', 15000000, 'Lagos HQ', '2021-09-20'],
  ['Victor', 'Onyeka', 'Male', 'Enterprise Sales Executive', 6, 29, 'GG4', 9600000, 'Lagos HQ', '2023-04-03'],
  ['Esther', 'Ojo', 'Female', 'Sales Executive', 6, 29, 'GG3', 7200000, 'Abuja', '2024-01-15'],
  ['Ahmed', 'Yakubu', 'Male', 'Sales Executive', 6, 29, 'GG3', 7200000, 'Port Harcourt', '2024-09-02'],
  ['Joy', 'Nnamdi', 'Female', 'Customer Support Specialist', 7, 9, 'GG2', 4800000, 'Ibadan', '2023-05-22'],
  ['Samuel', 'Adewale', 'Male', 'Customer Support Specialist', 7, 9, 'GG2', 4800000, 'Ibadan', '2024-03-11'],
  ['Grace', 'Ekpo', 'Female', 'Field Service Coordinator', 7, 9, 'GG3', 6000000, 'Ibadan', '2022-11-14'],
  ['Kunle', 'Ogundipe', 'Male', 'Software Engineer', 8, 7, 'GG4', 12000000, 'Remote', '2022-06-06'],
  ['Fatima', 'Aliyu', 'Female', 'Data Analyst', 8, 7, 'GG4', 10200000, 'Lagos HQ', '2023-08-14'],
  ['Peter', 'Effiong', 'Male', 'IT Support Engineer', 8, 7, 'GG3', 6600000, 'Lagos HQ', '2023-10-23'],
  ['Rukayat', 'Salami', 'Female', 'ESG Reporting Analyst', 9, 8, 'GG4', 9000000, 'Port Harcourt', '2023-02-06'],
  ['Chidi', 'Anyanwu', 'Male', 'Carbon Credits Specialist', 9, 8, 'GG4', 9600000, 'Port Harcourt', '2024-05-20'],
  ['Temitope', 'Alade', 'Female', 'Graduate Trainee', 3, 15, 'GG1', 3000000, 'Lagos HQ', '2025-09-01'],
  ['Uchenna', 'Madu', 'Male', 'Graduate Trainee', 5, 24, 'GG1', 3000000, 'Lagos HQ', '2025-09-01'],
  ['Opeyemi', 'Balogun', 'Female', 'Executive Assistant', 0, 0, 'GG3', 6000000, 'Lagos HQ', '2022-03-07'],
  ['Mohammed', 'Usman', 'Male', 'Solar Sales Engineer', 6, 29, 'GG4', 10000000, 'Abuja', '2025-03-17'],
  // recent and upcoming joiners (onboarding)
  ['Ebere', 'Nwachukwu', 'Female', 'HSE Officer', 9, 8, 'GG3', 7800000, 'Port Harcourt', addDays(TODAY, -6)],
  ['Babatunde', 'Lawson', 'Male', 'Solar Installation Technician', 3, 17, 'GG2', 4200000, 'Lagos HQ', addDays(TODAY, 4)],
  // leavers (terminated in the last year) and one in offboarding
  ['Dayo', 'Ilori', 'Male', 'Sales Executive', 6, 29, 'GG3', 7200000, 'Lagos HQ', '2022-04-11'],
  ['Nneka', 'Igwe', 'Female', 'Accountant', 2, 13, 'GG4', 8400000, 'Lagos HQ', '2021-07-05'],
  ['Ola', 'Coker', 'Male', 'Plant Operator', 5, 24, 'GG1', 3000000, 'Lagos HQ', '2023-03-06'],
  ['Efe', 'Omoregie', 'Female', 'Customer Support Specialist', 7, 9, 'GG2', 4800000, 'Ibadan', '2022-08-15'],
];
const TERMINATED = { 47: [addDays(TODAY, -300), 'Resignation', 'Career change'], 48: [addDays(TODAY, -160), 'Resignation', 'Relocation abroad'], 49: [addDays(TODAY, -75), 'Termination', 'Repeated safety violations'] };
const OFFBOARDING = 50;
const ONBOARDING = [45, 46];

const BANKS = ['Access Bank', 'GTBank', 'Zenith Bank', 'First Bank', 'UBA', 'Stanbic IBTC', 'Fidelity Bank', 'Wema Bank', 'Moniepoint MFB'];
const PFAS = ['Stanbic IBTC Pension', 'ARM Pension', 'Premium Pension', 'Leadway Pensure', 'Access Pensions', 'Crusader Sterling Pensions'];
const STATES = ['Lagos', 'Ogun', 'Oyo', 'Anambra', 'Enugu', 'Imo', 'Rivers', 'Kano', 'Kaduna', 'FCT', 'Edo', 'Delta', 'Akwa Ibom', 'Kwara', 'Osun'];
const STREETS = ['Admiralty Way, Lekki', 'Allen Avenue, Ikeja', 'Adeola Odeku St, Victoria Island', 'Herbert Macaulay Way, Yaba', 'Wuse II, Abuja', 'Garki Area 11, Abuja', 'Bodija, Ibadan', 'GRA Phase 2, Port Harcourt', 'Opebi Road, Ikeja', 'Ago Palace Way, Okota'];

const POLICY_TEMPLATES = [
  ['Code of Conduct', '3.1', '2026-01-01', 'Code of conduct', 1, 'All employees must act with integrity, avoid conflicts of interest, and report concerns through the whistleblowing channel.'],
  ['Leave Policy', '2.4', '2026-01-01', 'Leave', 1, 'Annual leave is 20 working days for confirmed staff. Up to 5 unused days may be carried into Q1. Sick leave up to 12 days with medical certificate. Maternity 16 weeks, paternity 14 days.'],
  ['Health, Safety & Environment Policy', '4.0', '2025-07-01', 'Health & safety', 1, 'PPE is mandatory on all sites. Stop-work authority applies to everyone.'],
  ['Data Protection & Privacy Policy (NDPA 2023)', '1.2', '2025-10-01', 'Data protection', 1, 'Personal data is processed lawfully, minimised and kept secure. Breaches must be reported to the DPO within 24 hours.'],
  ['Anti-Harassment Policy', '2.0', '2025-01-01', 'Anti-harassment', 1, 'Zero tolerance for harassment of any kind. Report to HR or the confidential hotline.'],
  ['Hybrid & Remote Work Policy', '1.1', '2026-03-01', 'Remote work', 0, 'Office roles may work remotely up to two days a week with manager approval.'],
];

async function seed({ reset = false } = {}) {
  if (reset && db.dialect === 'sqlite') {
    const { tables } = require('./schema');
    for (const tname of Object.keys(tables)) await db.run(`DELETE FROM ${tname}`);
    await db.run("DELETE FROM sqlite_sequence").catch(() => {});
  }
  console.log(`[seed] Seeding Go-Green Technologies demo data into ${db.location} ...`);

  await db.setSetting('company', { name: 'GO-Green Technologies', legal_name: 'GO-Green Technologies', address: 'Lagos, Nigeria', email: 'info@go-greentechnologies.com', website: 'www.go-greentechnologies.com', phone: '0805 671 9672', rc_number: '', tin: '', timezone: 'Africa/Lagos' });
  await db.setSetting('payroll', DEFAULT_PAYROLL);
  await db.setSetting('leave_policy', { annual_days: 20, carry_over_max: 5, sick_days: 12, maternity_weeks: 16, paternity_days: 14 });

  const deptIds = [];
  for (const [name, code, cost_center, location] of DEPTS) deptIds.push(await db.insert('departments', { name, code, cost_center, location }));

  const empIds = [];
  for (let i = 0; i < PEOPLE.length; i++) {
    const [first, last, gender, title, di, , grade, salary, location, hire] = PEOPLE[i];
    const status = TERMINATED[i] ? 'Terminated' : i === OFFBOARDING ? 'Offboarding' : ONBOARDING.includes(i) ? 'Onboarding' : (hire > addDays(TODAY, -90) ? 'Probation' : 'Active');
    const age = grade === 'GG8' ? 52 : grade === 'GG7' ? int(40, 50) : grade === 'GG1' ? int(22, 26) : int(26, 45);
    empIds.push(await db.insert('employees', {
      emp_no: `GG-${String(1001 + i).padStart(4, '0')}`, first_name: first, last_name: last,
      email: `${first}.${last}@gogreen.demo`.toLowerCase(), phone: `+234 80${int(1, 9)} ${int(100, 999)} ${int(1000, 9999)}`,
      gender, dob: `${2026 - age}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
      marital_status: pick(['Single', 'Married', 'Married', 'Single']), address: `${int(1, 120)} ${pick(STREETS)}`, state_of_origin: pick(STATES),
      job_title: title, grade, department_id: deptIds[di], location,
      employment_type: title.includes('Trainee') ? 'Intern' : 'Full-time', hire_date: hire, status,
      base_salary: salary, bank_name: pick(BANKS), bank_account: String(int(1000000000, 2147483647)).padStart(10, '0').slice(0, 10),
      pension_pfa: pick(PFAS), pension_pin: `PEN${int(100000000, 999999999)}${int(100, 999)}`, tax_id: `${int(10000000, 99999999)}-0001`,
      nhf_no: `NHF${int(1000000, 9999999)}`, annual_rent: Math.round(salary * (0.12 + rnd() * 0.1) / 10000) * 10000,
      emergency_name: `${pick(['Mrs', 'Mr', 'Dr'])} ${last}`, emergency_phone: `+234 70${int(1, 9)} ${int(100, 999)} ${int(1000, 9999)}`,
      leave_balance: int(6, 20), termination_date: TERMINATED[i] ? TERMINATED[i][0] : null,
    }));
  }
  for (let i = 0; i < PEOPLE.length; i++) if (PEOPLE[i][5] != null) await db.update('employees', empIds[i], { manager_id: empIds[PEOPLE[i][5]] });
  const heads = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 9, 8: 7, 9: 8 };
  for (const [d, p] of Object.entries(heads)) await db.update('departments', deptIds[d], { head_id: empIds[p] });
  const E = (i) => empIds[i];
  const activeIdx = PEOPLE.map((_, i) => i).filter((i) => !TERMINATED[i]);
  const current = activeIdx.filter((i) => !ONBOARDING.includes(i));

  // Demo logins
  const pw = bcrypt.hashSync('GoGreen@2026', 10);
  await db.insertMany('users', [
    { email: 'admin@gogreen.demo', password_hash: pw, role: 'admin', employee_id: E(7), active: 1 },
    { email: 'hr@gogreen.demo', password_hash: pw, role: 'hr', employee_id: E(1), active: 1 },
    { email: 'payroll@gogreen.demo', password_hash: pw, role: 'hr', employee_id: E(11), active: 1 },
    { email: 'manager@gogreen.demo', password_hash: pw, role: 'manager', employee_id: E(3), active: 1 },
    { email: 'employee@gogreen.demo', password_hash: pw, role: 'employee', employee_id: E(16), active: 1 },
  ]);

  // Lifecycle: onboarding checklists, separations, offboarding
  const onboardTpl = [['Send offer letter & contract for signature', 'Paperwork', 'HR', -7], ['Collect guarantor forms, IDs and certificates', 'Paperwork', 'HR', 0], ['Collect bank, PFA/RSA PIN and TIN details', 'Payroll', 'Employee', 0], ['Create email, HR portal and system accounts', 'IT & access', 'IT', -1], ['Issue laptop and access card', 'Equipment', 'IT', 0], ['Enrol in HMO health plan', 'Paperwork', 'HR', 3], ['Health, safety & environment induction', 'Training', 'HR', 1], ['Acknowledge code of conduct & policies', 'Paperwork', 'Employee', 2], ['Meet the team and assign onboarding buddy', 'Introductions', 'Manager', 1], ['Agree 30-60-90 day goals', 'Introductions', 'Manager', 7], ['Add to payroll', 'Payroll', 'Finance', 5], ['Probation check-in (90 days)', 'Introductions', 'Manager', 90]];
  const tasks = [];
  for (const i of ONBOARDING) {
    const hire = PEOPLE[i][9];
    onboardTpl.forEach(([title, category, owner, off]) => {
      const due = addDays(hire, off);
      const done = due < TODAY && rnd() > 0.15;
      tasks.push({ employee_id: E(i), kind: 'Onboarding', title, category, owner, due_date: due, status: done ? 'Done' : (due <= addDays(TODAY, 2) ? 'In progress' : 'Pending'), completed_date: done ? due : null });
    });
  }
  const lastDay = addDays(TODAY, 12);
  await db.insert('separations', { employee_id: E(OFFBOARDING), notice_date: addDays(TODAY, -18), last_day: lastDay, separation_type: 'Resignation', reason: 'Pursuing further studies', rehire_eligible: 1, final_pay_status: 'Pending', exit_interview: null });
  [['Acknowledge resignation letter', 'Exit', 'HR', -30, 'Done'], ['Knowledge transfer and handover plan', 'Knowledge transfer', 'Manager', -10, 'In progress'], ['Conduct exit interview', 'Exit', 'HR', -2, 'Pending'], ['Revoke system, email and building access', 'IT & access', 'IT', 0, 'Pending'], ['Compute final pay, leave encashment and deductions', 'Payroll', 'Finance', 0, 'Pending'], ['Return asset GG-LT-0034 (Laptop)', 'Equipment', 'IT', 0, 'Pending'], ['Issue certificate of service', 'Exit', 'HR', 5, 'Pending']]
    .forEach(([title, category, owner, off, status]) => tasks.push({ employee_id: E(OFFBOARDING), kind: 'Offboarding', title, category, owner, due_date: addDays(lastDay, off), status, completed_date: status === 'Done' ? addDays(lastDay, off) : null }));
  for (const [i, [day, type, reason]] of Object.entries(TERMINATED)) {
    await db.insert('separations', { employee_id: E(Number(i)), notice_date: addDays(day, -30), last_day: day, separation_type: type, reason, rehire_eligible: type === 'Resignation' ? 1 : 0, final_pay_status: 'Paid', exit_interview: type === 'Resignation' ? 'Positive experience overall; cited limited growth path in current role and commute time.' : 'Declined exit interview.' });
  }
  await db.insertMany('lifecycle_tasks', tasks);

  // Recruiting
  const jobs = [
    ['Senior Solar PV Design Engineer', 3, 'Lagos HQ', 'Full-time', 1, 15000000, 20000000, 'Open', -21, 3, 'Design utility and C&I solar PV systems (50kW-5MW). PVsyst, AutoCAD, COREN registration preferred.'],
    ['EV Charging Field Technician', 4, 'Abuja', 'Full-time', 2, 4200000, 5400000, 'Open', -14, 4, 'Install and maintain AC/DC fast chargers across the FCT.'],
    ['HR Generalist', 1, 'Lagos HQ', 'Full-time', 1, 7200000, 9000000, 'Open', -9, 1, 'Support onboarding, employee relations and HR operations. CIPM membership is an advantage.'],
    ['Recycling Plant Operator', 5, 'Lagos HQ', 'Full-time', 3, 2800000, 3400000, 'Open', -30, 5, 'Operate shredders and balers at the Ikeja recycling hub. Shift work.'],
    ['Data Engineer', 8, 'Remote', 'Full-time', 1, 12000000, 16000000, 'On hold', -45, 7, 'Build pipelines for energy-yield and fleet telemetry data.'],
    ['Sustainability Intern', 9, 'Port Harcourt', 'Intern', 2, 1800000, 2400000, 'Closed', -120, 8, 'Six-month ESG reporting internship.'],
  ];
  const jobIds = [];
  for (const [title, di, location, type, openings, lo, hi, status, off, hm, desc] of jobs) jobIds.push(await db.insert('job_openings', { title, department_id: deptIds[di], location, employment_type: type, openings, salary_min: lo, salary_max: hi, status, posted_date: addDays(TODAY, off), hiring_manager_id: E(hm), description: desc }));
  const CANDS = ['Ayodele Martins', 'Chioma Nwankwo', 'Babajide Ogun', 'Precious Eke', 'Abdullahi Idris', 'Folake Ademola', 'Nkechi Agu', 'Tobi Bankole', 'Ruth Akinola', 'Emmanuel Osagie', 'Sadiq Bala', 'Chisom Obiora', 'Lola Akande', 'Godwin Inyang', 'Maryam Shehu', 'Seun Adigun', 'Ifeoma Ejiofor', 'Taiwo Olatunji', 'Kehinde Olatunji', 'Uzoma Ihejirika', 'Bukola Ayeni', 'Hassan Abdul', 'Damilola Ige', 'Ekene Nzeribe', 'Yemisi Sowande', 'Osaro Igbinedion'];
  const stageMix = ['Applied', 'Applied', 'Screening', 'Screening', 'Interview', 'Interview', 'Offer', 'Rejected'];
  await db.insertMany('candidates', CANDS.map((full_name, k) => {
    const j = k % 5; const stage = k === 25 ? 'Hired' : pick(stageMix);
    return { job_id: jobIds[k === 25 ? 5 : j], full_name, email: `${full_name.toLowerCase().replace(' ', '.')}@mail.demo`, phone: `+234 81${int(0, 9)} ${int(100, 999)} ${int(1000, 9999)}`, source: pick(['Careers page', 'LinkedIn', 'Referral', 'Jobberman', 'Agency']), stage, rating: stage === 'Applied' ? null : int(2, 5), expected_salary: Math.round((jobs[j][5] + rnd() * (jobs[j][6] - jobs[j][5])) / 100000) * 100000, applied_date: addDays(TODAY, -int(2, 40)), notes: stage === 'Interview' ? 'Strong technical round. Panel interview scheduled.' : stage === 'Offer' ? 'Offer sent, awaiting acceptance.' : null };
  }));

  // Assets
  const assets = [];
  let n = 1;
  for (const i of activeIdx) {
    const laptop = { tag: `GG-LT-${String(n++).padStart(4, '0')}`, name: pick(['Dell Latitude 5440', 'HP EliteBook 840 G10', 'Lenovo ThinkPad T14', 'MacBook Air M3']), category: 'Laptop', serial_no: `SN${int(10000000, 99999999)}`, purchase_date: addDays(PEOPLE[i][9] < '2023-01-01' ? '2023-01-10' : PEOPLE[i][9], -5), cost: pick([1350000, 1600000, 1850000, 2200000]), status: 'Assigned', employee_id: E(i), assigned_date: PEOPLE[i][9] < '2023-01-01' ? '2023-01-12' : PEOPLE[i][9], condition_note: pick(['Good', 'Good', 'Fair', 'Excellent']) };
    if (i !== 46) assets.push(laptop);
    if (rnd() > 0.6) assets.push({ tag: `GG-PH-${String(n++).padStart(4, '0')}`, name: pick(['Samsung Galaxy A55', 'iPhone 13', 'Tecno Camon 30']), category: 'Phone', serial_no: `IMEI${int(10000000, 99999999)}`, purchase_date: '2024-02-01', cost: pick([450000, 780000, 320000]), status: 'Assigned', employee_id: E(i), assigned_date: '2024-02-05', condition_note: 'Good' });
  }
  const off = assets.find((a) => a.employee_id === E(OFFBOARDING)); if (off) off.tag = 'GG-LT-0034';
  [['GG-VH-0001', 'Toyota Hilux (install crew)', 'Vehicle', 28500000, 'Assigned', E(17)], ['GG-VH-0002', 'Toyota Hiace (recycling logistics)', 'Vehicle', 31000000, 'Assigned', E(28)], ['GG-VH-0003', 'BYD Atto 3 (EV demo car)', 'Vehicle', 42000000, 'Assigned', E(4)],
    ['GG-SK-0001', 'Solar installer toolkit + harness', 'Solar kit', 650000, 'Assigned', E(18)], ['GG-SK-0002', 'Solar installer toolkit + harness', 'Solar kit', 650000, 'Assigned', E(19)], ['GG-SK-0003', 'IV curve tracer', 'Solar kit', 4800000, 'Available', null],
    ['GG-LT-0900', 'Dell Latitude 5440', 'Laptop', 1600000, 'Available', null], ['GG-LT-0901', 'Lenovo ThinkPad T14', 'Laptop', 1500000, 'Available', null], ['GG-LT-0902', 'HP EliteBook 840 G8', 'Laptop', 1100000, 'In repair', null], ['GG-LT-0903', 'Dell Latitude 7400', 'Laptop', 900000, 'Retired', null],
    ['GG-MN-0001', 'Dell 27" monitor', 'Monitor', 380000, 'Available', null], ['GG-AC-0001', 'Spare access card', 'Access card', 15000, 'Available', null]]
    .forEach(([tag, name, category, cost, status, emp]) => assets.push({ tag, name, category, serial_no: `SN${int(10000000, 99999999)}`, purchase_date: '2024-06-01', cost, status, employee_id: emp, assigned_date: emp ? '2024-06-03' : null, condition_note: status === 'In repair' ? 'Battery swelling, sent to vendor' : 'Good' }));
  await db.insertMany('assets', assets);

  // Payroll history: last 6 closed months
  const cfg = DEFAULT_PAYROLL;
  const thisMonth = TODAY.slice(0, 7);
  for (let k = 6; k >= 1; k--) {
    const period = addMonths(thisMonth, -k);
    const eligible = PEOPLE.map((p, i) => ({ p, i })).filter(({ p, i }) => p[9] <= `${period}-31` && (!TERMINATED[i] || TERMINATED[i][0] >= `${period}-01`));
    const slips = eligible.map(({ p, i }) => {
      const bonus = period.endsWith('-12') ? Math.round(p[7] / 12) : 0;
      return { employee_id: E(i), period, ...computePayslip({ base_salary: p[7], annual_rent: Math.round(p[7] * 0.15) }, cfg, { bonus }) };
    });
    const sum = (key) => Math.round(slips.reduce((t, s) => t + s[key], 0) * 100) / 100;
    const runId = await db.insert('payroll_runs', { period, status: 'Paid', run_date: `${period}-24`, employee_count: slips.length, total_gross: sum('gross'), total_net: sum('net'), total_paye: sum('paye'), total_pension: Math.round((sum('pension_employee') + sum('pension_employer')) * 100) / 100, created_by: 3 });
    await db.insertMany('payslips', slips.map((s) => ({ ...s, run_id: runId })));
  }

  // Compensation history
  await db.insertMany('compensation_changes', [
    [15, '2026-01-01', 15500000, 17000000, 'Merit increase', 'Exceeded H2 2025 targets; led 1.2MW Ikorodu project.', 'Applied'],
    [17, '2026-01-01', 6400000, 7200000, 'Promotion', 'Promoted from Lead Technician to Installation Supervisor.', 'Applied'],
    [29, '2026-04-01', 13500000, 15000000, 'Market adjustment', 'Benchmarked against Lagos energy sector P50.', 'Applied'],
    [37, '2026-07-01', 9200000, 10200000, 'Merit increase', 'Strong H1 2026 review.', 'Applied'],
    [16, addDays(TODAY, 42), 10800000, 12000000, 'Merit increase', 'Consistently exceeds design QA targets.', 'Proposed'],
    [20, addDays(TODAY, 42), 11400000, 13200000, 'Promotion', 'Proposed promotion to Senior Battery Storage Engineer.', 'Approved'],
    [26, addDays(TODAY, 42), 3000000, 3300000, 'Cost of living', 'Inflation adjustment for GG1 grade.', 'Proposed'],
  ].map(([i, effective_date, old_salary, new_salary, change_type, reason, status]) => ({ employee_id: E(i), effective_date, old_salary, new_salary, change_type, reason, status })));

  // Benefits
  const plans = [
    ['HMO Gold (family)', 'Health (HMO)', 'Hygeia HMO', 85000, 0, 'GG5 and above', 'Comprehensive inpatient/outpatient cover incl. dental and optical for employee, spouse and up to 4 children.'],
    ['HMO Silver', 'Health (HMO)', 'AXA Mansard Health', 45000, 0, 'All confirmed staff', 'Outpatient and inpatient cover at 300+ partner hospitals.'],
    ['Contributory Pension (RSA)', 'Pension', 'Employee-selected PFA', 0, 0, 'All staff (PRA 2014)', 'Employer 10% + employee 8% of basic, housing and transport.'],
    ['Group Life Assurance', 'Life assurance', 'Leadway Assurance', 6000, 0, 'All staff', '3x annual total emolument, as required by the Pension Reform Act 2014.'],
    ['Green Commute Allowance', 'Transport', 'Go-Green', 25000, 0, 'Staff who commute by EV, bike or BRT', 'Monthly allowance for low-carbon commuting.'],
    ['Wellness & Gym', 'Wellness', 'i-Fitness', 15000, 5000, 'All staff', 'Gym membership and quarterly health checks.'],
  ];
  const planIds = [];
  for (const [name, category, provider, er, ee, eligibility, description] of plans) planIds.push(await db.insert('benefit_plans', { name, category, provider, employer_cost: er, employee_cost: ee, eligibility, description, active: 1 }));
  const enrol = [];
  for (const i of activeIdx) {
    const senior = ['GG5', 'GG6', 'GG7', 'GG8'].includes(PEOPLE[i][6]);
    const start = PEOPLE[i][9] > '2024-01-01' ? PEOPLE[i][9] : '2024-01-01';
    const st = ONBOARDING.includes(i) ? 'Pending' : 'Active';
    enrol.push({ employee_id: E(i), plan_id: planIds[senior ? 0 : 1], coverage: senior ? 'Family' : pick(['Employee only', 'Employee + spouse', 'Family']), dependents: senior ? int(1, 4) : int(0, 3), start_date: start, status: st });
    enrol.push({ employee_id: E(i), plan_id: planIds[2], coverage: 'Employee only', dependents: 0, start_date: start, status: st });
    enrol.push({ employee_id: E(i), plan_id: planIds[3], coverage: 'Employee only', dependents: 0, start_date: start, status: st });
    if (rnd() > 0.7) enrol.push({ employee_id: E(i), plan_id: planIds[4], coverage: 'Employee only', dependents: 0, start_date: start, status: 'Active' });
    if (rnd() > 0.55) enrol.push({ employee_id: E(i), plan_id: planIds[5], coverage: 'Employee only', dependents: 0, start_date: start, status: 'Active' });
  }
  await db.insertMany('benefit_enrollments', enrol);

  // Time tracking: last 15 working days
  const times = [];
  const projects = { 3: 'Solar installs', 4: 'EV charging', 5: 'Recycling ops', 7: 'Client support' };
  for (let k = 15; k >= 1; k--) {
    const day = addDays(TODAY, -k); if (!isWeekday(day)) continue;
    for (const i of current) {
      if (rnd() < 0.08) continue;
      const inH = int(7, 9); const inM = pick(['00', '15', '30', '45']); const len = 8 + int(0, 2) + (rnd() > 0.8 ? 1 : 0);
      const ci = `${String(inH).padStart(2, '0')}:${inM}`; const co = `${String(inH + len).padStart(2, '0')}:${inM}`;
      times.push({ employee_id: E(i), work_date: day, clock_in: ci, clock_out: co, hours: len, project: projects[PEOPLE[i][4]] || pick(['General', 'Internal']), status: k > 2 || rnd() > 0.35 ? 'Approved' : 'Submitted', notes: null });
    }
  }
  await db.insertMany('time_entries', times);

  // Leave
  const leaves = [];
  const types = ['Annual', 'Annual', 'Annual', 'Sick', 'Compassionate', 'Study'];
  for (let k = 0; k < 34; k++) {
    const i = pick(current); const start = addDays(TODAY, int(-200, 50)); const len = int(1, 8);
    let s = start; while (!isWeekday(s)) s = addDays(s, 1);
    const e = addDays(s, len);
    let days = 0; for (let d = s; d <= e; d = addDays(d, 1)) if (isWeekday(d)) days++;
    const status = s > TODAY ? pick(['Pending', 'Pending', 'Approved']) : pick(['Approved', 'Approved', 'Approved', 'Rejected']);
    leaves.push({ employee_id: E(i), leave_type: pick(types), start_date: s, end_date: e, days, reason: pick(['Family vacation', 'Medical appointment', 'Wedding ceremony', 'Exam preparation', 'Rest', 'Bereavement']), status, approver_id: status === 'Pending' ? null : E(PEOPLE[i][5] ?? 1), requested_on: addDays(s, -int(5, 20)) });
  }
  leaves.push({ employee_id: E(16), leave_type: 'Annual', start_date: addDays(TODAY, 21), end_date: addDays(TODAY, 25), days: 5, reason: 'Christmas travel to Enugu', status: 'Pending', approver_id: null, requested_on: TODAY });
  leaves.push({ employee_id: E(20), leave_type: 'Annual', start_date: addDays(TODAY, 8), end_date: addDays(TODAY, 10), days: 3, reason: 'Family event', status: 'Pending', approver_id: null, requested_on: addDays(TODAY, -2) });
  leaves.push({ employee_id: E(18), leave_type: 'Sick', start_date: addDays(TODAY, -1), end_date: addDays(TODAY, 1), days: 3, reason: 'Malaria', status: 'Approved', approver_id: E(17), requested_on: addDays(TODAY, -1) });
  await db.insertMany('leave_requests', leaves);

  // Scheduling: field/ops crews, next 14 days
  const crew = current.filter((i) => [3, 4, 5, 7].includes(PEOPLE[i][4]) && !PEOPLE[i][3].startsWith('Head'));
  const shifts = [];
  for (let k = -3; k <= 14; k++) {
    const day = addDays(TODAY, k); if (!isWeekday(day) && PEOPLE[0]) { if (rnd() > 0.3) continue; }
    for (const i of crew) {
      const dept = PEOPLE[i][4];
      const morning = rnd() > 0.35;
      const site = dept === 3 ? pick(['Lekki Solar Farm', 'Field', 'Lagos HQ']) : dept === 4 ? 'Abuja Depot' : dept === 5 ? 'Ikeja Recycling Hub' : 'Field';
      shifts.push({ employee_id: E(i), shift_date: day, start_time: morning ? '07:00' : '14:00', end_time: morning ? '15:00' : '22:00', site, shift_role: PEOPLE[i][3], status: k < 0 ? 'Completed' : k < 3 ? 'Confirmed' : 'Scheduled', notes: null });
    }
  }
  await db.insertMany('shifts', shifts);

  // Performance: goals and reviews
  const goalBank = [['Commission 2MW of C&I solar capacity', 'Business'], ['Reduce plant downtime to under 3%', 'Business'], ['Cut office diesel use by 40%', 'Sustainability'], ['Achieve 90% CSAT on support tickets', 'Customer'], ['Complete PMP certification', 'Personal development'], ['Onboard 15 new enterprise clients', 'Business'], ['Divert 1,200 tonnes of plastic from landfill', 'Sustainability'], ['Mentor two graduate trainees', 'Team'], ['Deploy 40 new EV chargers in Abuja', 'Business'], ['Publish 2026 ESG report', 'Sustainability']];
  const goals = []; const reviews = [];
  for (const i of current) {
    const g1 = int(0, goalBank.length - 1); const picks = [goalBank[g1], goalBank[(g1 + int(1, goalBank.length - 1)) % goalBank.length]];
    for (const [title, category] of picks) {
      const progress = int(5, 100);
      goals.push({ employee_id: E(i), title, category, due_date: pick(['2026-12-31', '2026-12-15', '2027-03-31']), progress, status: progress === 100 ? 'Completed' : progress < 30 ? pick(['At risk', 'On track']) : 'On track', description: null });
    }
    if (PEOPLE[i][9] < '2026-01-01' && PEOPLE[i][5] != null) {
      const rating = pick([3, 3, 4, 4, 4, 5, 2, 3, 4, 5]);
      reviews.push({ employee_id: E(i), reviewer_id: E(PEOPLE[i][5]), cycle: 'H1 2026', rating, strengths: pick(['Takes ownership and delivers on time.', 'Excellent client relationships.', 'Deep technical expertise and safety focus.', 'Great team player, mentors others.']), improvements: pick(['Delegate more to grow the team.', 'Improve documentation of field work.', 'Sharpen stakeholder communication.', 'Build data analysis skills.']), status: 'Acknowledged', review_date: '2026-07-15' });
      if (rnd() > 0.5) reviews.push({ employee_id: E(i), reviewer_id: E(PEOPLE[i][5]), cycle: 'H2 2026', rating: null, strengths: null, improvements: null, status: 'Draft', review_date: null });
    }
  }
  await db.insertMany('goals', goals);
  await db.insertMany('performance_reviews', reviews);

  // Talent: skills and succession
  const skillMap = { 3: ['Solar PV design', 'PVsyst', 'AutoCAD', 'Working at height', 'Inverter commissioning'], 4: ['EV charger installation', 'OCPP', 'Electrical safety', 'Fleet analytics'], 5: ['Plant operations', 'Forklift', 'Waste classification', 'Lean'], 6: ['B2B sales', 'Negotiation', 'CRM (HubSpot)'], 7: ['Customer service', 'Zendesk', 'Field coordination'], 8: ['Python', 'SQL', 'Azure', 'Power BI'], 9: ['GHG accounting', 'GRI reporting', 'Carbon markets'], 1: ['Employee relations', 'Nigerian labour law', 'Payroll'], 2: ['IFRS', 'Tax', 'Treasury'], 0: ['Strategy', 'Leadership'] };
  const skills = [];
  for (const i of current) {
    const pool = skillMap[PEOPLE[i][4]] || ['Communication'];
    const chosen = [...new Set([pick(pool), pick(pool), pick(pool)])];
    chosen.forEach((skill) => skills.push({ employee_id: E(i), skill, proficiency: pick(['Intermediate', 'Advanced', 'Advanced', 'Expert', 'Beginner']), certified: rnd() > 0.7 ? 1 : 0 }));
  }
  await db.insertMany('employee_skills', skills);
  await db.insertMany('succession_plans', [
    ['Chief Financial Officer', 2, 13, '1-2 years', 'Low', 'Segun to lead FY2026 audit and investor reporting.'],
    ['Head of Solar Engineering', 3, 15, 'Ready now', 'Medium', 'Olumide acting head during Q1 leave cover.'],
    ['HR Director', 1, 10, '1-2 years', 'Low', 'Bisola enrolled in CIPM Fellowship pathway.'],
    ['Head of Recycling Operations', 5, 24, '3+ years', 'High', 'Needs P&L exposure; rotate into logistics.'],
    ['IT & Data Lead', 7, 36, '1-2 years', 'Medium', 'Azure architecture certification planned.'],
    ['Head of EV & Mobility', 4, 21, '3+ years', 'Low', 'Leadership programme in 2027.'],
  ].map(([position, inc, suc, readiness, risk_of_loss, notes]) => ({ position, incumbent_id: E(inc), successor_id: E(suc), readiness, risk_of_loss, notes })));

  // Learning & development
  const courses = [
    ['HSE Induction & Working at Height', 'Health & safety', 'Internal HSE', 6, 1, 'Classroom'], ['Anti-Bribery & Code of Conduct', 'Compliance', 'Internal', 2, 1, 'Online'],
    ['NDPA 2023 Data Protection Essentials', 'Compliance', 'NDPC-accredited', 3, 1, 'Online'], ['Solar PV Installation Level 2', 'Technical', 'NAPTIN', 40, 0, 'Blended'],
    ['EV Charging Infrastructure', 'Technical', 'Schneider Electric', 16, 0, 'Online'], ['First Aid & Fire Safety', 'Health & safety', 'Red Cross Nigeria', 8, 1, 'Classroom'],
    ['Leading High-Performing Teams', 'Leadership', 'Lagos Business School', 24, 0, 'Classroom'], ['GHG Accounting Fundamentals', 'Sustainability', 'GHG Protocol', 10, 0, 'Online'],
    ['Customer Service Excellence', 'Soft skills', 'Internal', 4, 0, 'Online'], ['Anti-Sexual Harassment', 'Compliance', 'Internal', 2, 1, 'Online'],
  ];
  const courseIds = [];
  for (const [title, category, provider, duration_hours, mandatory, delivery] of courses) courseIds.push(await db.insert('courses', { title, category, provider, duration_hours, mandatory, delivery, description: `${title} - ${delivery.toLowerCase()} course delivered by ${provider}.` }));
  const enr = [];
  for (const i of activeIdx) {
    [0, 1, 2, 5, 9].forEach((c) => {
      const isNew = ONBOARDING.includes(i);
      const st = isNew ? 'Enrolled' : pick(['Completed', 'Completed', 'Completed', 'Completed', 'In progress', 'Overdue']);
      enr.push({ employee_id: E(i), course_id: courseIds[c], status: st, progress: st === 'Completed' ? 100 : st === 'Enrolled' ? 0 : int(10, 80), enrolled_date: isNew ? PEOPLE[i][9] : '2026-02-01', completed_date: st === 'Completed' ? addDays('2026-02-01', int(5, 200)) : null, score: st === 'Completed' ? int(65, 100) : null });
    });
    if (rnd() > 0.6) { const c = pick([3, 4, 6, 7, 8]); enr.push({ employee_id: E(i), course_id: courseIds[c], status: pick(['In progress', 'Completed', 'Enrolled']), progress: int(0, 100), enrolled_date: '2026-05-04', completed_date: null, score: null }); }
  }
  await db.insertMany('course_enrollments', enr);

  // Engagement
  const sv = [
    ['Q2 2026 Pulse', 'How likely are you to recommend Go-Green as a place to work?', 'Closed', '2026-05-04', '2026-05-18'],
    ['Q3 2026 Pulse', 'How likely are you to recommend Go-Green as a place to work?', 'Closed', '2026-08-03', '2026-08-17'],
    ['Q4 2026 Pulse', 'How likely are you to recommend Go-Green as a place to work?', 'Open', addDays(TODAY, -5), addDays(TODAY, 9)],
  ];
  const svIds = [];
  for (const [title, question, status, open_date, close_date] of sv) svIds.push(await db.insert('surveys', { title, question, status, open_date, close_date }));
  const resp = [];
  const comments = ['Love the mission and the team.', 'Would like clearer career paths.', 'Field allowances should be reviewed.', 'Great leadership communication this quarter.', 'More training budget please.', null, null, null];
  svIds.forEach((sid, k) => {
    current.forEach((i) => {
      if (k === 2 && (rnd() > 0.45 || i === 16)) return; if (rnd() > 0.85) return;
      const base = [7, 8, 8][k];
      resp.push({ survey_id: sid, employee_id: E(i), score: Math.max(0, Math.min(10, base + int(-3, 2))), comment: pick(comments), response_date: addDays(sv[k][3], int(0, 4)) });
    });
  });
  await db.insertMany('survey_responses', resp);
  await db.insertMany('recognitions', [
    [3, 15, 'Above & Beyond', 'Olumide stayed late three nights to get the Ikorodu array commissioned before the rains. Legend!', -2],
    [1, 12, 'Team Player', 'Amaka filled four technician roles in two weeks. Thank you!', -4],
    [5, 25, 'Safety Star', 'Kemi spotted and fixed a conveyor guard issue before anyone got hurt.', -6],
    [9, 33, 'Customer Hero', 'Joy turned an angry client into a renewal. Brilliant work.', -8],
    [4, 21, 'Innovator', 'Aisha designed a load-balancing hack that let us add 6 chargers without a transformer upgrade.', -11],
    [8, 39, 'Green Champion', 'Rukayat delivered our first GRI-aligned ESG report ahead of schedule.', -15],
    [16, 17, 'Team Player', 'Femi always makes time to explain wiring diagrams. Thanks boss!', -18],
    [7, 36, 'Innovator', 'Kunle automated the solar yield dashboard; saves us 2 days a month.', -22],
    [6, 30, 'Above & Beyond', 'Victor closed the Dangote Industrial Park deal!', -26],
  ].map(([from, to, badge, message, off]) => ({ from_id: E(from), to_id: E(to), badge, message, given_date: addDays(TODAY, off) })));
  await db.insertMany('announcements', [
    { title: 'Q4 pulse survey is open', body: 'Tell us how we are doing. It takes one minute and responses are confidential to HR. Closes in 9 days.', audience: 'Everyone', posted_date: addDays(TODAY, -5), author_id: E(1), pinned: 1 },
    { title: 'End-of-year party: 12 December', body: 'Join us at the Lekki Solar Farm for our zero-waste end-of-year celebration. Families welcome!', audience: 'Everyone', posted_date: addDays(TODAY, -3), author_id: E(0), pinned: 0 },
    { title: 'New Nigeria Tax Act PAYE bands now live in payroll', body: 'Payroll uses the 2026 PAYE bands and rent relief. Upload your rent receipt to HR to claim rent relief.', audience: 'Everyone', posted_date: addDays(TODAY, -20), author_id: E(11), pinned: 0 },
    { title: 'Mandatory HSE refresher for field teams', body: 'All installation and plant crews must complete the Working at Height refresher before 15 December.', audience: 'Field teams', posted_date: addDays(TODAY, -9), author_id: E(1), pinned: 0 },
  ]);

  // Compliance
  const next = (day) => { const d = `${thisMonth}-${String(day).padStart(2, '0')}`; return d >= TODAY ? d : `${addMonths(thisMonth, 1)}-${String(day).padStart(2, '0')}`; };
  await db.insertMany('compliance_items', [
    ['Remit monthly PAYE to LIRS', 'Statutory remittance', 'LIRS', next(10), 'Monthly', 'Upcoming', 11, 'Due by the 10th of the following month. Other states remitted to their SIRS.'],
    ['Remit pension contributions to PFAs', 'Statutory remittance', 'PenCom', next(7), 'Monthly', 'Upcoming', 11, 'Within 7 working days of salary payment (PRA 2014, s.11).'],
    ['Remit NHF contributions', 'Statutory remittance', 'FMBN (NHF)', next(30), 'Monthly', 'Upcoming', 11, '2.5% of basic; remit within one month.'],
    ['NSITF Employee Compensation Scheme (1% of payroll)', 'Statutory remittance', 'NSITF', next(16), 'Monthly', 'Upcoming', 2, 'Employee Compensation Act 2010.'],
    ['Remit PAYE for October', 'Statutory remittance', 'LIRS', `${thisMonth}-10`, 'Monthly', 'Completed', 11, 'Receipt filed.'],
    ['File employer annual PAYE returns (Form H1)', 'Tax filing', 'LIRS', '2027-01-31', 'Annually', 'Upcoming', 2, 'Annual returns of all emoluments paid in 2026.'],
    ['ITF 1% training levy and annual returns', 'Statutory remittance', 'ITF', '2027-04-01', 'Annually', 'Upcoming', 2, 'ITF Amendment Act 2011.'],
    ['NDPA annual data protection compliance audit', 'Data protection', 'NDPC', '2027-03-31', 'Annually', 'In progress', 7, 'File audit returns via a licensed DPCO.'],
    ['Renew factory registration (Ikeja recycling hub)', 'Licence', 'Federal Ministry of Labour', addDays(TODAY, -4), 'Annually', 'Overdue', 5, 'Factories Act. Inspection booked; awaiting certificate.'],
    ['NESREA environmental permit renewal', 'Environmental', 'NESREA', addDays(TODAY, 24), 'Annually', 'In progress', 8, 'Recycling operations permit.'],
    ['Quarterly HSE fire drill', 'Health & safety', 'Other', addDays(TODAY, 18), 'Quarterly', 'Upcoming', 1, 'All sites.'],
    ['Group life policy renewal', 'Labour law', 'Other', addDays(TODAY, 40), 'Annually', 'Upcoming', 11, 'Required by PRA 2014 s.4(5).'],
  ].map(([title, category, regulator, due_date, frequency, status, owner, notes]) => ({ title, category, regulator, due_date, frequency, status, owner_id: E(owner), notes })));
  const pol = POLICY_TEMPLATES;
  const polIds = [];
  for (const [title, version, effective_date, category, requires_ack, body] of pol) polIds.push(await db.insert('policies', { title, version, effective_date, category, requires_ack, body }));
  const acks = [];
  for (const i of current) polIds.forEach((pid, k) => { if (pol[k][4] && (rnd() > 0.12 || i !== 16) && !(i === 16 && k === 3)) acks.push({ policy_id: pid, employee_id: E(i), ack_date: addDays(pol[k][2] > '2026-01-01' ? pol[k][2] : '2026-01-05', int(1, 30)) }); });
  await db.insertMany('policy_acks', acks);

  await db.insert('audit_log', { user_email: 'system', action: 'seed', entity: 'database', details: 'Demo data loaded', at: new Date().toISOString() });
  console.log(`[seed] Done: ${empIds.length} employees, ${assets.length} assets, ${times.length} time entries.`);
}

// Production start: company settings, departments, the statutory calendar and policy
// templates, plus one admin login from ADMIN_EMAIL / ADMIN_PASSWORD. No demo people or history.
async function seedProduction() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || password.length < 8) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) to create the first admin login.');
  console.log(`[seed] Setting up an empty Go-Green HR database in ${db.location} ...`);
  await db.setSetting('company', { name: 'GO-Green Technologies', legal_name: 'GO-Green Technologies', address: 'Lagos, Nigeria', email: 'info@go-greentechnologies.com', website: 'www.go-greentechnologies.com', phone: '0805 671 9672', rc_number: '', tin: '', timezone: 'Africa/Lagos' });
  await db.setSetting('payroll', DEFAULT_PAYROLL);
  await db.setSetting('leave_policy', { annual_days: 20, carry_over_max: 5, sick_days: 12, maternity_weeks: 16, paternity_days: 14 });
  for (const [name, code, cost_center, location] of DEPTS) await db.insert('departments', { name, code, cost_center, location });
  const thisMonth = TODAY.slice(0, 7);
  const next = (day) => { const d = `${thisMonth}-${String(day).padStart(2, '0')}`; return d >= TODAY ? d : `${addMonths(thisMonth, 1)}-${String(day).padStart(2, '0')}`; };
  await db.insertMany('compliance_items', [
    ['Remit monthly PAYE to LIRS', 'Statutory remittance', 'LIRS', next(10), 'Monthly', 'Due by the 10th of the following month. Other states remitted to their SIRS.'],
    ['Remit pension contributions to PFAs', 'Statutory remittance', 'PenCom', next(7), 'Monthly', 'Within 7 working days of salary payment (PRA 2014, s.11).'],
    ['Remit NHF contributions', 'Statutory remittance', 'FMBN (NHF)', next(28), 'Monthly', '2.5% of basic; remit within one month.'],
    ['NSITF Employee Compensation Scheme (1% of payroll)', 'Statutory remittance', 'NSITF', next(16), 'Monthly', 'Employee Compensation Act 2010.'],
    ['File employer annual PAYE returns (Form H1)', 'Tax filing', 'LIRS', `${Number(TODAY.slice(0, 4)) + 1}-01-31`, 'Annually', 'Annual returns of all emoluments paid in the year.'],
    ['ITF 1% training levy and annual returns', 'Statutory remittance', 'ITF', `${Number(TODAY.slice(0, 4)) + 1}-04-01`, 'Annually', 'ITF Amendment Act 2011.'],
    ['NDPA annual data protection compliance audit', 'Data protection', 'NDPC', `${Number(TODAY.slice(0, 4)) + 1}-03-31`, 'Annually', 'File audit returns via a licensed DPCO.'],
    ['Group life policy renewal', 'Labour law', 'Other', addDays(TODAY, 60), 'Annually', 'Required by PRA 2014 s.4(5).'],
  ].map(([title, category, regulator, due_date, frequency, notes]) => ({ title, category, regulator, due_date, frequency, status: 'Upcoming', notes })));
  for (const [title, version, effective_date, category, requires_ack, body] of POLICY_TEMPLATES) await db.insert('policies', { title, version, effective_date, category, requires_ack, body: `${body} (Template: review and edit before publishing.)` });
  await db.insert('users', { email, password_hash: bcrypt.hashSync(password, 10), role: 'admin', employee_id: null, active: 1 });
  await db.insert('audit_log', { user_email: 'system', action: 'seed', entity: 'database', details: 'Production database created', at: new Date().toISOString() });
}

module.exports = { seed, seedProduction };

if (require.main === module) {
  (async () => {
    await db.migrate();
    const reset = process.argv.includes('--reset');
    const u = await db.one('SELECT COUNT(*) AS c FROM users');
    if (Number(u.c) && !reset) { console.log('[seed] Database already has data. Use --reset to wipe and reseed (SQLite only).'); return; }
    if (Number(u.c) && reset && db.dialect !== 'sqlite') { console.log('[seed] --reset is only supported on local SQLite. Clear Azure SQL tables manually.'); return; }
    await seed({ reset });
  })().catch((e) => { console.error(e); process.exit(1); });
}
