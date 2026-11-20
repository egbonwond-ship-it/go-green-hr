// Declarative config for every HR module stored in the centralized database.
// The API uses it for validation + role-based access, and the web app uses it
// (via GET /api/meta) to render tables and forms.
//
// Access scopes per role and action (r=read, c=create, u=update, d=delete):
//   'all'  every row      'team' rows of the user + their reporting line
//   'own'  only the user's rows      (missing) not allowed
// Admin always has full access.

const FULL = { r: 'all', c: 'all', u: 'all', d: 'all' };
const READ = { r: 'all' };

// Field helpers
const s = (name, label, extra = {}) => ({ name, label, type: 'text', ...extra });
const t = (name, label, extra = {}) => ({ name, label, type: 'textarea', list: false, ...extra });
const n = (name, label, extra = {}) => ({ name, label, type: 'number', ...extra });
const m = (name, label, extra = {}) => ({ name, label, type: 'money', ...extra });
const d = (name, label, extra = {}) => ({ name, label, type: 'date', ...extra });
const tm = (name, label, extra = {}) => ({ name, label, type: 'time', ...extra });
const b = (name, label, extra = {}) => ({ name, label, type: 'bool', ...extra });
const sel = (name, label, options, extra = {}) => ({ name, label, type: 'select', options, ...extra });
const ref = (name, label, to, extra = {}) => ({ name, label, type: 'ref', ref: to, ...extra });
const emp = (name = 'employee_id', label = 'Employee', extra = {}) => ref(name, label, 'employees', extra);

const NG_STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];

// Display expressions for reference labels (portable correlated subqueries).
const REF_LABEL = {
  employees: "CONCAT(x.first_name, ' ', x.last_name)",
  departments: 'x.name', job_openings: 'x.title', benefit_plans: 'x.name', courses: 'x.title',
  surveys: 'x.title', policies: 'x.title', payroll_runs: 'x.period', users: 'x.email',
};

const resources = {
  employees: {
    label: 'Employees', module: 'Employee information', order: 'last_name, first_name', title: ['first_name', 'last_name'], owner: 'id',
    perms: { hr: FULL, manager: { r: 'all' }, employee: { r: 'all', u: 'own' } },
    fields: [
      { name: 'photo', label: 'Photo', type: 'image', list: false, self: true },
      s('emp_no', 'Employee no.', { required: true }), s('first_name', 'First name', { required: true }),
      s('last_name', 'Last name', { required: true }), s('email', 'Work email', { required: true }),
      s('phone', 'Phone', { self: true }), sel('gender', 'Gender', ['Female', 'Male'], { list: false }),
      d('dob', 'Date of birth', { list: false, sensitive: true }),
      sel('marital_status', 'Marital status', ['Single', 'Married', 'Divorced', 'Widowed'], { list: false, self: true, sensitive: true }),
      t('address', 'Home address', { self: true, sensitive: true }),
      sel('state_of_origin', 'State of origin', NG_STATES, { list: false, sensitive: true }),
      s('job_title', 'Job title', { required: true }), s('grade', 'Grade', { list: false }),
      ref('department_id', 'Department', 'departments', { required: true }), emp('manager_id', 'Manager'),
      sel('location', 'Location', ['Lagos HQ', 'Abuja', 'Port Harcourt', 'Ibadan', 'Remote']),
      sel('employment_type', 'Employment type', ['Full-time', 'Part-time', 'Contract', 'Intern'], { list: false }),
      d('hire_date', 'Hire date', { required: true }),
      sel('status', 'Status', ['Active', 'Onboarding', 'Probation', 'On leave', 'Offboarding', 'Terminated'], { required: true }),
      m('base_salary', 'Annual gross salary', { list: false, sensitive: true }),
      s('bank_name', 'Bank', { list: false, self: true, sensitive: true }),
      s('bank_account', 'Account no. (NUBAN)', { list: false, self: true, sensitive: true }),
      s('pension_pfa', 'Pension fund administrator', { list: false, self: true, sensitive: true }),
      s('pension_pin', 'RSA PIN', { list: false, self: true, sensitive: true }),
      s('tax_id', 'Tax ID (TIN)', { list: false, self: true, sensitive: true }),
      s('nhf_no', 'NHF number', { list: false, self: true, sensitive: true }),
      m('annual_rent', 'Annual rent (for rent relief)', { list: false, self: true, sensitive: true }),
      s('emergency_name', 'Emergency contact', { list: false, self: true, sensitive: true }),
      s('emergency_phone', 'Emergency phone', { list: false, self: true, sensitive: true }),
      n('leave_balance', 'Leave balance (days)', { list: false }),
      d('termination_date', 'Termination date', { list: false }),
    ],
  },

  departments: {
    label: 'Departments', module: 'Org chart', order: 'name', title: ['name'],
    perms: { hr: FULL, manager: READ, employee: READ },
    fields: [s('name', 'Name', { required: true }), s('code', 'Code'), emp('head_id', 'Head of department'),
      s('cost_center', 'Cost centre'), s('location', 'Location')],
  },

  lifecycle_tasks: {
    label: 'Onboarding & offboarding tasks', module: 'Onboarding & offboarding', order: 'due_date', title: ['title'],
    perms: { hr: FULL, manager: { r: 'team', u: 'team', c: 'team' }, employee: { r: 'own', u: 'own' } },
    fields: [emp(undefined, undefined, { required: true }), sel('kind', 'Type', ['Onboarding', 'Offboarding'], { required: true }),
      s('title', 'Task', { required: true }), sel('category', 'Category', ['Paperwork', 'IT & access', 'Equipment', 'Training', 'Introductions', 'Payroll', 'Knowledge transfer', 'Exit']),
      sel('owner', 'Owner', ['HR', 'IT', 'Manager', 'Employee', 'Finance']), d('due_date', 'Due'),
      sel('status', 'Status', ['Pending', 'In progress', 'Done'], { required: true }), d('completed_date', 'Completed', { list: false })],
  },

  separations: {
    label: 'Separations', module: 'Onboarding & offboarding', order: 'last_day DESC',
    perms: { hr: FULL, manager: { r: 'team' } },
    fields: [emp(undefined, undefined, { required: true }), d('notice_date', 'Notice date'), d('last_day', 'Last working day', { required: true }),
      sel('separation_type', 'Type', ['Resignation', 'Termination', 'Redundancy', 'Retirement', 'End of contract'], { required: true }),
      s('reason', 'Reason'), b('rehire_eligible', 'Eligible for rehire'),
      sel('final_pay_status', 'Final pay', ['Pending', 'Processed', 'Paid']), t('exit_interview', 'Exit interview notes')],
  },

  job_openings: {
    label: 'Job openings', module: 'Recruiting', order: 'posted_date DESC', title: ['title'],
    perms: { hr: FULL, manager: { r: 'all', c: 'all', u: 'all' }, employee: READ },
    fields: [s('title', 'Title', { required: true }), ref('department_id', 'Department', 'departments', { required: true }),
      sel('location', 'Location', ['Lagos HQ', 'Abuja', 'Port Harcourt', 'Ibadan', 'Remote']),
      sel('employment_type', 'Type', ['Full-time', 'Part-time', 'Contract', 'Intern']), n('openings', 'Openings'),
      m('salary_min', 'Salary from', { list: false }), m('salary_max', 'Salary to', { list: false }),
      sel('status', 'Status', ['Draft', 'Open', 'On hold', 'Closed'], { required: true }), d('posted_date', 'Posted'),
      emp('hiring_manager_id', 'Hiring manager'), t('description', 'Description')],
  },

  candidates: {
    label: 'Candidates', module: 'Recruiting', order: 'applied_date DESC', title: ['full_name'],
    perms: { hr: FULL, manager: { r: 'all', u: 'all' } },
    fields: [ref('job_id', 'Job', 'job_openings', { required: true }), s('full_name', 'Name', { required: true }), s('email', 'Email'),
      s('phone', 'Phone', { list: false }), sel('source', 'Source', ['Careers page', 'LinkedIn', 'Referral', 'Jobberman', 'Agency', 'Other']),
      sel('stage', 'Stage', ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'], { required: true }),
      n('rating', 'Rating (1-5)', { min: 1, max: 5 }), m('expected_salary', 'Expected salary', { list: false }),
      d('applied_date', 'Applied'), t('notes', 'Notes')],
  },

  assets: {
    label: 'Assets', module: 'Asset management', order: 'tag', title: ['tag', 'name'],
    perms: { hr: FULL, manager: { r: 'team' }, employee: { r: 'own' } },
    fields: [s('tag', 'Asset tag', { required: true }), s('name', 'Name', { required: true }),
      sel('category', 'Category', ['Laptop', 'Phone', 'Monitor', 'Vehicle', 'Furniture', 'Access card', 'Solar kit', 'Other'], { required: true }),
      s('serial_no', 'Serial no.', { list: false }), d('purchase_date', 'Purchased', { list: false }), m('cost', 'Cost'),
      sel('status', 'Status', ['Available', 'Assigned', 'In repair', 'Retired'], { required: true }),
      emp('employee_id', 'Assigned to'), d('assigned_date', 'Assigned on', { list: false }), s('condition_note', 'Condition', { list: false })],
  },

  payroll_runs: {
    label: 'Payroll runs', module: 'Payroll', order: 'period DESC', readonly: true,
    perms: { hr: { r: 'all' } },
    fields: [s('period', 'Period'), sel('status', 'Status', ['Draft', 'Approved', 'Paid']), d('run_date', 'Run date'),
      n('employee_count', 'Employees'), m('total_gross', 'Gross'), m('total_paye', 'PAYE'), m('total_pension', 'Pension'), m('total_net', 'Net')],
  },

  payslips: {
    label: 'Payslips', module: 'Payroll', order: 'period DESC', readonly: true,
    perms: { hr: { r: 'all' }, employee: { r: 'own' }, manager: { r: 'own' } },
    fields: [ref('run_id', 'Run', 'payroll_runs', { list: false }), emp(), s('period', 'Period'), m('basic', 'Basic', { list: false }),
      m('housing', 'Housing', { list: false }), m('transport', 'Transport', { list: false }), m('other_allowance', 'Other allowance', { list: false }),
      m('bonus', 'Bonus', { list: false }), m('gross', 'Gross'), m('pension_employee', 'Pension (8%)'), m('pension_employer', 'Employer pension', { list: false }),
      m('nhf', 'NHF', { list: false }), m('taxable_income', 'Taxable', { list: false }), m('paye', 'PAYE'),
      m('other_deductions', 'Other deductions', { list: false }), m('net', 'Net pay')],
  },

  compensation_changes: {
    label: 'Compensation changes', module: 'Compensation', order: 'effective_date DESC',
    perms: { hr: FULL, manager: { r: 'team', c: 'team' }, employee: { r: 'own' } },
    fields: [emp(undefined, undefined, { required: true }), d('effective_date', 'Effective', { required: true }),
      m('old_salary', 'Current salary'), m('new_salary', 'New salary', { required: true }),
      sel('change_type', 'Type', ['Merit increase', 'Promotion', 'Market adjustment', 'Cost of living', 'Correction'], { required: true }),
      t('reason', 'Justification'), sel('status', 'Status', ['Proposed', 'Approved', 'Rejected', 'Applied'], { required: true, default: 'Proposed' })],
  },

  benefit_plans: {
    label: 'Benefit plans', module: 'Benefits', order: 'category, name', title: ['name'],
    perms: { hr: FULL, manager: READ, employee: READ },
    fields: [s('name', 'Plan', { required: true }), sel('category', 'Category', ['Health (HMO)', 'Pension', 'Life assurance', 'Housing', 'Transport', 'Wellness', 'Other'], { required: true }),
      s('provider', 'Provider'), m('employer_cost', 'Employer cost / month'), m('employee_cost', 'Employee cost / month'),
      s('eligibility', 'Eligibility'), t('description', 'Description'), b('active', 'Active', { default: 1 })],
  },

  benefit_enrollments: {
    label: 'Benefit enrollments', module: 'Benefits', order: 'start_date DESC',
    perms: { hr: FULL, manager: { r: 'own', c: 'own' }, employee: { r: 'own', c: 'own' } },
    fields: [emp(undefined, undefined, { required: true }), ref('plan_id', 'Plan', 'benefit_plans', { required: true }),
      sel('coverage', 'Coverage', ['Employee only', 'Employee + spouse', 'Family']), n('dependents', 'Dependents'),
      d('start_date', 'Start'), sel('status', 'Status', ['Pending', 'Active', 'Ended'], { required: true, default: 'Pending' })],
  },

  time_entries: {
    label: 'Timesheets', module: 'Time tracking', order: 'work_date DESC',
    perms: { hr: FULL, manager: { r: 'team', u: 'team', c: 'own' }, employee: { r: 'own', c: 'own', u: 'own' } },
    fields: [emp(undefined, undefined, { required: true }), d('work_date', 'Date', { required: true }), tm('clock_in', 'In'), tm('clock_out', 'Out'),
      n('hours', 'Hours'), sel('project', 'Project', ['General', 'Solar installs', 'EV charging', 'Recycling ops', 'Client support', 'Internal']),
      sel('status', 'Status', ['Open', 'Submitted', 'Approved', 'Rejected'], { required: true, default: 'Submitted' }), s('notes', 'Notes', { list: false })],
  },

  leave_requests: {
    label: 'Leave requests', module: 'Time tracking', order: 'start_date DESC',
    perms: { hr: FULL, manager: { r: 'team', u: 'team', c: 'own' }, employee: { r: 'own', c: 'own', d: 'own' } },
    fields: [emp(undefined, undefined, { required: true }), sel('leave_type', 'Type', ['Annual', 'Sick', 'Maternity', 'Paternity', 'Compassionate', 'Study', 'Unpaid'], { required: true }),
      d('start_date', 'From', { required: true }), d('end_date', 'To', { required: true }), n('days', 'Working days'),
      t('reason', 'Reason'), sel('status', 'Status', ['Pending', 'Approved', 'Rejected', 'Cancelled'], { required: true, default: 'Pending' }),
      emp('approver_id', 'Approver', { list: false }), d('requested_on', 'Requested', { list: false })],
  },

  shifts: {
    label: 'Shifts', module: 'Scheduling', order: 'shift_date, start_time',
    perms: { hr: FULL, manager: { r: 'team', c: 'team', u: 'team', d: 'team' }, employee: { r: 'own' } },
    fields: [emp(undefined, undefined, { required: true }), d('shift_date', 'Date', { required: true }), tm('start_time', 'Start', { required: true }),
      tm('end_time', 'End', { required: true }), sel('site', 'Site', ['Lagos HQ', 'Lekki Solar Farm', 'Abuja Depot', 'Ikeja Recycling Hub', 'Port Harcourt Office', 'Field']),
      s('shift_role', 'Role'), sel('status', 'Status', ['Scheduled', 'Confirmed', 'Swap requested', 'Completed', 'Absent'], { default: 'Scheduled' }), s('notes', 'Notes', { list: false })],
  },

  goals: {
    label: 'Goals & OKRs', module: 'Performance', order: 'due_date',
    perms: { hr: FULL, manager: { r: 'team', c: 'team', u: 'team', d: 'team' }, employee: { r: 'own', c: 'own', u: 'own', d: 'own' } },
    fields: [emp(undefined, undefined, { required: true }), s('title', 'Goal', { required: true }),
      sel('category', 'Category', ['Business', 'Sustainability', 'Customer', 'Personal development', 'Team']),
      d('due_date', 'Due'), n('progress', 'Progress %', { min: 0, max: 100 }),
      sel('status', 'Status', ['Not started', 'On track', 'At risk', 'Completed'], { default: 'Not started' }), t('description', 'Details')],
  },

  performance_reviews: {
    label: 'Performance reviews', module: 'Performance', order: 'review_date DESC',
    perms: { hr: FULL, manager: { r: 'team', c: 'team', u: 'team' }, employee: { r: 'own' } },
    fields: [emp(undefined, undefined, { required: true }), emp('reviewer_id', 'Reviewer'), sel('cycle', 'Cycle', ['H1 2025', 'H2 2025', 'H1 2026', 'H2 2026'], { required: true }),
      n('rating', 'Rating (1-5)', { min: 1, max: 5 }), t('strengths', 'Strengths'), t('improvements', 'Areas to improve'),
      sel('status', 'Status', ['Draft', 'Submitted', 'Acknowledged'], { default: 'Draft' }), d('review_date', 'Date')],
  },

  employee_skills: {
    label: 'Skills inventory', module: 'Talent management', order: 'skill',
    perms: { hr: FULL, manager: { r: 'all', c: 'own', u: 'own', d: 'own' }, employee: { r: 'all', c: 'own', u: 'own', d: 'own' } },
    fields: [emp(undefined, undefined, { required: true }), s('skill', 'Skill', { required: true }),
      sel('proficiency', 'Proficiency', ['Beginner', 'Intermediate', 'Advanced', 'Expert'], { required: true }), b('certified', 'Certified')],
  },

  succession_plans: {
    label: 'Succession plans', module: 'Talent management', order: 'position',
    perms: { hr: FULL, manager: READ },
    fields: [s('position', 'Critical role', { required: true }), emp('incumbent_id', 'Incumbent'), emp('successor_id', 'Successor'),
      sel('readiness', 'Readiness', ['Ready now', '1-2 years', '3+ years'], { required: true }),
      sel('risk_of_loss', 'Flight risk', ['Low', 'Medium', 'High']), t('notes', 'Development plan')],
  },

  courses: {
    label: 'Course catalogue', module: 'Learning & development', order: 'title', title: ['title'],
    perms: { hr: FULL, manager: READ, employee: READ },
    fields: [s('title', 'Course', { required: true }), sel('category', 'Category', ['Compliance', 'Health & safety', 'Technical', 'Leadership', 'Sustainability', 'Soft skills']),
      s('provider', 'Provider'), n('duration_hours', 'Hours'), b('mandatory', 'Mandatory'),
      sel('delivery', 'Delivery', ['Online', 'Classroom', 'Blended', 'On the job']), t('description', 'Description')],
  },

  course_enrollments: {
    label: 'Training records', module: 'Learning & development', order: 'enrolled_date DESC',
    perms: { hr: FULL, manager: { r: 'team', c: 'team', u: 'team' }, employee: { r: 'own', c: 'own', u: 'own' } },
    fields: [emp(undefined, undefined, { required: true }), ref('course_id', 'Course', 'courses', { required: true }),
      sel('status', 'Status', ['Enrolled', 'In progress', 'Completed', 'Overdue'], { required: true, default: 'Enrolled' }),
      n('progress', 'Progress %', { min: 0, max: 100 }), d('enrolled_date', 'Enrolled'), d('completed_date', 'Completed'), n('score', 'Score', { list: false })],
  },

  surveys: {
    label: 'Pulse surveys', module: 'Engagement', order: 'open_date DESC', title: ['title'],
    perms: { hr: FULL, manager: READ, employee: READ },
    fields: [s('title', 'Survey', { required: true }), t('question', 'Question (scored 0-10)', { list: true }),
      sel('status', 'Status', ['Draft', 'Open', 'Closed'], { required: true }), d('open_date', 'Opens'), d('close_date', 'Closes')],
  },

  survey_responses: {
    label: 'Survey responses', module: 'Engagement', order: 'response_date DESC',
    perms: { hr: { r: 'all', d: 'all' }, manager: { r: 'own', c: 'own' }, employee: { r: 'own', c: 'own' } },
    fields: [ref('survey_id', 'Survey', 'surveys', { required: true }), emp(undefined, undefined, { required: true }),
      n('score', 'Score (0-10)', { required: true, min: 0, max: 10 }), t('comment', 'Comment', { list: true }), d('response_date', 'Date')],
  },

  recognitions: {
    label: 'Recognition wall', module: 'Engagement', order: 'given_date DESC', owner: 'from_id',
    perms: { hr: FULL, manager: { r: 'all', c: 'own' }, employee: { r: 'all', c: 'own' } },
    fields: [emp('from_id', 'From', { required: true }), emp('to_id', 'To', { required: true }),
      sel('badge', 'Badge', ['Green Champion', 'Team Player', 'Customer Hero', 'Innovator', 'Safety Star', 'Above & Beyond'], { required: true }),
      t('message', 'Message', { list: true, required: true }), d('given_date', 'Date')],
  },

  announcements: {
    label: 'Announcements', module: 'Engagement', order: 'posted_date DESC',
    perms: { hr: FULL, manager: READ, employee: READ },
    fields: [s('title', 'Title', { required: true }), t('body', 'Message', { required: true }),
      sel('audience', 'Audience', ['Everyone', 'Managers', 'Lagos HQ', 'Field teams']), d('posted_date', 'Posted'),
      emp('author_id', 'Author', { list: false }), b('pinned', 'Pinned')],
  },

  compliance_items: {
    label: 'Compliance calendar', module: 'Compliance', order: 'due_date',
    perms: { hr: FULL, manager: READ },
    fields: [s('title', 'Obligation', { required: true }),
      sel('category', 'Category', ['Statutory remittance', 'Tax filing', 'Labour law', 'Health & safety', 'Data protection', 'Environmental', 'Licence']),
      sel('regulator', 'Regulator', ['NRS (FIRS)', 'LIRS', 'PenCom', 'FMBN (NHF)', 'NSITF', 'ITF', 'NDPC', 'Federal Ministry of Labour', 'NESREA', 'Other']),
      d('due_date', 'Due', { required: true }), sel('frequency', 'Frequency', ['Monthly', 'Quarterly', 'Annually', 'One-off']),
      sel('status', 'Status', ['Upcoming', 'In progress', 'Completed', 'Overdue'], { required: true }), emp('owner_id', 'Owner'), t('notes', 'Notes')],
  },

  policies: {
    label: 'Policies', module: 'Compliance', order: 'title', title: ['title'],
    perms: { hr: FULL, manager: READ, employee: READ },
    fields: [s('title', 'Policy', { required: true }), s('version', 'Version'), d('effective_date', 'Effective'),
      sel('category', 'Category', ['Code of conduct', 'Leave', 'Health & safety', 'Data protection', 'Anti-harassment', 'Remote work', 'Environmental']),
      b('requires_ack', 'Requires acknowledgement'), t('body', 'Policy text')],
  },

  policy_acks: {
    label: 'Policy acknowledgements', module: 'Compliance', order: 'ack_date DESC',
    perms: { hr: { r: 'all', d: 'all' }, manager: { r: 'own', c: 'own' }, employee: { r: 'own', c: 'own' } },
    fields: [ref('policy_id', 'Policy', 'policies', { required: true }), emp(undefined, undefined, { required: true }), d('ack_date', 'Acknowledged')],
  },

  users: {
    label: 'User accounts', module: 'Settings', order: 'email', title: ['email'],
    perms: {},
    fields: [s('email', 'Login email', { required: true }), sel('role', 'Role', ['admin', 'hr', 'manager', 'employee'], { required: true }),
      emp('employee_id', 'Linked employee'), b('active', 'Active', { default: 1 }),
      { name: 'password', label: 'Set password', type: 'password', list: false, virtual: true }, { name: 'last_login', label: 'Last login', type: 'text', readonly: true }],
  },

  audit_log: {
    label: 'Audit trail', module: 'Compliance', order: 'id DESC', readonly: true,
    perms: { hr: { r: 'all' } },
    fields: [s('at', 'When'), s('user_email', 'User'), s('action', 'Action'), s('entity', 'Record type'), n('entity_id', 'Record id'), t('details', 'Details', { list: true })],
  },
};

for (const [key, r] of Object.entries(resources)) {
  r.key = key;
  r.table = r.table || key;
  r.owner = r.owner || 'employee_id';
}

module.exports = { resources, REF_LABEL };
