# Go-Green HR (`go-green-hr`)

The HR portal for GO-Green Technologies (www.go-greentechnologies.com). It uses the company logo and the website's brand fonts (Space Grotesk, Nunito) and colours. It runs as an **Azure Static Web App** named `go-green-hr`:

- **Frontend:** a static single-page app in `app/`. Plain HTML, CSS and JavaScript, with no build step.
- **API:** Azure Functions (Node 20, v4 programming model) in `api/`, served at `/api/*`.
- **Centralized database:** **Azure SQL Database** holds every module's data. If no connection string is set, the app uses a local SQLite file, so it runs out of the box for demos and development.

## Modules

| Area | What it does |
|---|---|
| Employee information & centralized database | One record per employee: job, department, manager, contact, bank, PFA/RSA PIN, TIN, NHF, emergency contact. Exports to CSV. |
| Employee self-service | My workspace: profile updates, payslips, leave requests and balance, clock in/out, shifts, benefit enrolment, course enrolment, goals, equipment, policy sign-off, pulse surveys. |
| Org chart | Interactive reporting tree with search, department filter, collapse/expand and headcount per reporting line. |
| Onboarding & offboarding | Checklists per joiner and leaver. Templates are editable. Offboarding adds a return task for every assigned asset. Completing it disables the login, returns the assets and ends the benefits. |
| Recruiting | Job openings and a drag-and-drop candidate pipeline. **Hire** creates the employee, a login and the onboarding checklist in one step. |
| Talent management | Skills inventory, certifications and succession plans with readiness and flight risk. |
| Payroll & compensation | Monthly payroll runs with preview, one-off bonuses, Draft → Approved → Paid workflow, and a four-eyes rule (the creator cannot approve their own run). Printable payslips, bank schedule CSV, statutory schedule CSV, and remittance totals for PAYE, pension by PFA, NHF, NSITF and ITF. Compensation changes go Proposed → Approved → Applied; applying one updates the salary payroll uses. |
| Benefits administration | HMO, pension, group life and wellness plans, enrolments, and employer cost summary. |
| Time tracking | Clock in/out, timesheets with manager approval, leave requests with approval and automatic balance deduction, and a monthly leave calendar. |
| Employee scheduling | Weekly shift rota by site for installation crews, plant operators and field teams. |
| Performance management | Goals/OKRs with progress, review cycles, ratings distribution and top performers. |
| Learning & development | Course catalogue, training records, and mandatory training completion. |
| Employee engagement | Announcements, a peer recognition wall, and pulse surveys with eNPS. |
| Asset management | Laptops, phones, vehicles and solar kits. Assign and return, condition, cost and book value. |
| Workforce analytics | Headcount, turnover, tenure, age, gender, payroll trend and cost by department, hires and leavers, recruiting funnel, leave, ratings, training and eNPS. |
| Compliance | Statutory calendar (LIRS PAYE, PenCom, NHF, NSITF, ITF, NDPC, NESREA, Factories Act), policies with acknowledgement tracking, and a full audit trail of every change. |

### Roles

| Role | Access |
|---|---|
| `admin` | Everything, including Settings and user accounts. |
| `hr` | All HR data, payroll, analytics and the audit trail. |
| `manager` | Their whole reporting line: approve leave and timesheets, schedule shifts, set goals, write reviews, propose pay changes. |
| `employee` | Self-service only. They see the company directory without other people's salary or personal data. Payslips appear once a run is marked Paid. |

Access is enforced in the API (`api/src/lib/resources.js`), not just hidden in the UI.

### Payroll defaults (Nigeria)

Defaults are **NGN (₦)** with the Nigeria Tax Act 2025 PAYE bands, which apply from 1 January 2026:

| Annual chargeable income | Rate |
|---|---|
| First ₦800,000 | 0% |
| Next ₦2,200,000 (up to ₦3m) | 15% |
| Next ₦9,000,000 (up to ₦12m) | 18% |
| Next ₦13,000,000 (up to ₦25m) | 21% |
| Next ₦25,000,000 (up to ₦50m) | 23% |
| Above ₦50,000,000 | 25% |

The default deductions are pension at 8% for the employee and 10% for the employer (on basic, housing and transport), NHF at 2.5% of basic, and rent relief of 20% of annual rent capped at ₦500,000. Gross pay splits into basic 50%, housing 25%, transport 10% and other 15%. **Currency, symbol, salary split, every rate and every tax band can be changed in Settings → Payroll & tax.** Confirm the rules with your tax adviser before using live payroll.

## Run it locally

You need Node.js 20 or newer.

```bash
npm install        # also installs the API dependencies
npm start          # http://localhost:4280
```

On first start, the app creates the database and loads demo data for 51 employees. The demo data includes 6 months of payroll, timesheets, leave, shifts, reviews, training, surveys, assets and compliance items.

**Demo logins** (password `GoGreen@2026` for all):

| Email | Role |
|---|---|
| `admin@gogreen.demo` | admin |
| `hr@gogreen.demo` | hr (HR Director) |
| `payroll@gogreen.demo` | hr (Payroll officer, the second approver for payroll) |
| `manager@gogreen.demo` | manager (Head of Solar Engineering) |
| `employee@gogreen.demo` | employee (Solar PV Engineer) |

Other commands:

```bash
npm test             # 34 end-to-end API checks (auth, permissions, payroll maths, hiring, offboarding...)
npm run reset-demo   # wipe and reload the local demo data
npm run swa          # run with the Azure Static Web Apps CLI (needs @azure/static-web-apps-cli and Functions Core Tools)
```

## Browser preview (no server, no Azure)

```bash
npm run build-preview   # writes dist-preview/go-green-hr.html
```

`go-green-hr.html` is one self-contained file. Open it in any browser to use the full app with the demo data. The real API router runs inside the page on sql.js (SQLite compiled to JavaScript), so every business rule works the same. Changes are saved in that browser only. Downloads and printing work as normal in a browser; the preview is not meant for real employee data.

## Deploy to Azure

1. **Create the Static Web App.** You need the Azure CLI and `az login`, or use Azure Cloud Shell. This creates the `go-green-hr` Static Web App (Free plan; set `SKU=Standard` for Standard) and its app settings. It does not create a database:
   ```bash
   bash scripts/azure-setup.sh
   ```
   You can also create it in the Azure portal: create a Static Web App named **go-green-hr** (source: GitHub, app location `app`, API location `api`, output location empty). Then add the application settings below.

   **Without a database**, the API uses its built-in SQLite demo database in the Functions' temporary storage. It reloads the demo data whenever Azure restarts the API, so changes don't persist. To keep real data, create a database later and set `SQL_CONNECTION_STRING`.
2. **Push this folder to a GitHub repository** and add the deployment token as the repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
3. **Push to `main`.** `.github/workflows/azure-static-web-apps.yml` runs the tests, then deploys. On the first API call, the tables are created and the demo data is loaded.
4. **Sign in and change the demo passwords** under Settings → Users & roles. You can also delete the demo data and enter your real employees.

Application settings (Static Web App → Settings → Environment variables):

| Name | Value |
|---|---|
| `SQL_CONNECTION_STRING` (optional) | `Server=tcp:<server>.database.windows.net,1433;Database=go-green-hr;User Id=<user>;Password=<password>;Encrypt=true` |
| `JWT_SECRET` | A long random string, used to sign login sessions. |
| `NODE_ENV` | `production` |

The Azure SQL firewall must allow Azure services, because the managed Functions don't have fixed IP addresses. The setup script adds this rule.

## Project layout

```
app/                     Static frontend (Static Web App content)
  index.html, styles.css, staticwebapp.config.json
  js/app.js              router, login, navigation
  js/ui.js               tables, forms, modals, charts
  js/pages/*.js          module pages
api/                     Azure Functions app
  src/functions/api.js   catch-all HTTP function -> router
  src/lib/schema.js      centralized database schema (one definition for SQL Server and SQLite)
  src/lib/db.js          Azure SQL / SQLite adapter, migrations
  src/lib/resources.js   module definitions, fields and role permissions
  src/lib/router.js      API routes and business rules
  src/lib/payroll.js     PAYE / pension / NHF engine
  src/lib/seed.js        demo data
dev-server.js            local runner for the frontend and API
scripts/                 smoke tests and Azure setup
```

## Notes

- All the SQL is a portable subset that runs on both SQL Server and SQLite. The automated tests run against SQLite. Check the first deployment against Azure SQL before you load real data.
- Every create, update, delete, login, payroll action and settings change is written to the audit trail.
- The time zone is Africa/Lagos (WAT).
