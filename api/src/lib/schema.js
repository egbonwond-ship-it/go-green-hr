// Single source of truth for the centralized database.
// Column types are dialect-neutral and are turned into DDL for
// Azure SQL (mssql) or SQLite (local dev) by db.js.
//   id    auto-increment primary key
//   str   short string (indexed-safe, 255)
//   text  long text
//   int   integer
//   num   decimal money / numeric
//   date  'YYYY-MM-DD' string (portable across both engines)
//   ts    ISO timestamp string
//   bool  0/1

const tables = {
  settings: { setting_key: 'str!', setting_value: 'text' },

  users: {
    id: 'id', email: 'str', password_hash: 'str', role: 'str', employee_id: 'int',
    active: 'bool', last_login: 'ts',
  },

  departments: { id: 'id', name: 'str', code: 'str', head_id: 'int', cost_center: 'str', location: 'str' },

  employees: {
    id: 'id', emp_no: 'str', first_name: 'str', last_name: 'str', email: 'str', phone: 'str',
    gender: 'str', dob: 'date', marital_status: 'str', address: 'text', state_of_origin: 'str',
    job_title: 'str', grade: 'str', department_id: 'int', manager_id: 'int', location: 'str',
    employment_type: 'str', hire_date: 'date', status: 'str', base_salary: 'num',
    bank_name: 'str', bank_account: 'str', pension_pfa: 'str', pension_pin: 'str', tax_id: 'str',
    nhf_no: 'str', annual_rent: 'num', photo: 'text', emergency_name: 'str', emergency_phone: 'str',
    leave_balance: 'num', termination_date: 'date',
  },

  lifecycle_tasks: {
    id: 'id', employee_id: 'int', kind: 'str', title: 'str', category: 'str', owner: 'str',
    due_date: 'date', status: 'str', completed_date: 'date',
  },

  separations: {
    id: 'id', employee_id: 'int', notice_date: 'date', last_day: 'date', reason: 'str',
    separation_type: 'str', rehire_eligible: 'bool', exit_interview: 'text', final_pay_status: 'str',
  },

  job_openings: {
    id: 'id', title: 'str', department_id: 'int', location: 'str', employment_type: 'str',
    openings: 'int', salary_min: 'num', salary_max: 'num', status: 'str', posted_date: 'date',
    hiring_manager_id: 'int', description: 'text',
  },

  candidates: {
    id: 'id', job_id: 'int', full_name: 'str', email: 'str', phone: 'str', source: 'str',
    stage: 'str', rating: 'int', expected_salary: 'num', applied_date: 'date', notes: 'text',
  },

  assets: {
    id: 'id', tag: 'str', name: 'str', category: 'str', serial_no: 'str', purchase_date: 'date',
    cost: 'num', status: 'str', employee_id: 'int', assigned_date: 'date', condition_note: 'str',
  },

  payroll_runs: {
    id: 'id', period: 'str', status: 'str', run_date: 'date', employee_count: 'int',
    total_gross: 'num', total_net: 'num', total_paye: 'num', total_pension: 'num', created_by: 'int',
  },

  payslips: {
    id: 'id', run_id: 'int', employee_id: 'int', period: 'str', basic: 'num', housing: 'num',
    transport: 'num', other_allowance: 'num', bonus: 'num', gross: 'num', pension_employee: 'num',
    pension_employer: 'num', nhf: 'num', taxable_income: 'num', paye: 'num', other_deductions: 'num',
    net: 'num',
  },

  compensation_changes: {
    id: 'id', employee_id: 'int', effective_date: 'date', old_salary: 'num', new_salary: 'num',
    change_type: 'str', reason: 'text', status: 'str',
  },

  benefit_plans: {
    id: 'id', name: 'str', category: 'str', provider: 'str', employer_cost: 'num',
    employee_cost: 'num', eligibility: 'str', description: 'text', active: 'bool',
  },

  benefit_enrollments: {
    id: 'id', employee_id: 'int', plan_id: 'int', coverage: 'str', dependents: 'int',
    start_date: 'date', status: 'str',
  },

  time_entries: {
    id: 'id', employee_id: 'int', work_date: 'date', clock_in: 'str', clock_out: 'str',
    hours: 'num', project: 'str', status: 'str', notes: 'str',
  },

  leave_requests: {
    id: 'id', employee_id: 'int', leave_type: 'str', start_date: 'date', end_date: 'date',
    days: 'num', reason: 'text', status: 'str', approver_id: 'int', requested_on: 'date',
  },

  shifts: {
    id: 'id', employee_id: 'int', shift_date: 'date', start_time: 'str', end_time: 'str',
    site: 'str', shift_role: 'str', status: 'str', notes: 'str',
  },

  goals: {
    id: 'id', employee_id: 'int', title: 'str', category: 'str', due_date: 'date',
    progress: 'int', status: 'str', description: 'text',
  },

  performance_reviews: {
    id: 'id', employee_id: 'int', reviewer_id: 'int', cycle: 'str', rating: 'int',
    strengths: 'text', improvements: 'text', status: 'str', review_date: 'date',
  },

  employee_skills: { id: 'id', employee_id: 'int', skill: 'str', proficiency: 'str', certified: 'bool' },

  succession_plans: {
    id: 'id', position: 'str', incumbent_id: 'int', successor_id: 'int', readiness: 'str',
    risk_of_loss: 'str', notes: 'text',
  },

  courses: {
    id: 'id', title: 'str', category: 'str', provider: 'str', duration_hours: 'num',
    mandatory: 'bool', delivery: 'str', description: 'text',
  },

  course_enrollments: {
    id: 'id', employee_id: 'int', course_id: 'int', status: 'str', progress: 'int',
    enrolled_date: 'date', completed_date: 'date', score: 'int',
  },

  surveys: { id: 'id', title: 'str', question: 'text', status: 'str', open_date: 'date', close_date: 'date' },

  survey_responses: { id: 'id', survey_id: 'int', employee_id: 'int', score: 'int', comment: 'text', response_date: 'date' },

  recognitions: { id: 'id', from_id: 'int', to_id: 'int', badge: 'str', message: 'text', given_date: 'date' },

  announcements: { id: 'id', title: 'str', body: 'text', audience: 'str', posted_date: 'date', author_id: 'int', pinned: 'bool' },

  compliance_items: {
    id: 'id', title: 'str', category: 'str', regulator: 'str', due_date: 'date', frequency: 'str',
    status: 'str', owner_id: 'int', notes: 'text',
  },

  policies: { id: 'id', title: 'str', version: 'str', effective_date: 'date', category: 'str', body: 'text', requires_ack: 'bool' },

  policy_acks: { id: 'id', policy_id: 'int', employee_id: 'int', ack_date: 'date' },

  audit_log: { id: 'id', user_id: 'int', user_email: 'str', action: 'str', entity: 'str', entity_id: 'int', details: 'text', at: 'ts' },
};

const indexes = [
  ['users', 'email'], ['employees', 'department_id'], ['employees', 'manager_id'],
  ['lifecycle_tasks', 'employee_id'], ['candidates', 'job_id'], ['payslips', 'run_id'],
  ['payslips', 'employee_id'], ['time_entries', 'employee_id'], ['leave_requests', 'employee_id'],
  ['shifts', 'shift_date'], ['course_enrollments', 'employee_id'], ['audit_log', 'at'],
];

module.exports = { tables, indexes };
