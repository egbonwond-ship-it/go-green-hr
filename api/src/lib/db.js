// Database adapter: Azure SQL (production) or SQLite (local / demo).
// Set SQL_CONNECTION_STRING to use Azure SQL. Otherwise a local SQLite file is used.
// All SQL in the app uses `?` placeholders and a portable subset of SQL.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { tables, indexes } = require('./schema');

const dialect = process.env.SQL_CONNECTION_STRING ? 'mssql' : 'sqlite';

const TYPES = {
  sqlite: { id: 'INTEGER PRIMARY KEY AUTOINCREMENT', str: 'TEXT', 'str!': 'TEXT PRIMARY KEY', text: 'TEXT', int: 'INTEGER', num: 'REAL', date: 'TEXT', ts: 'TEXT', bool: 'INTEGER' },
  mssql: { id: 'INT IDENTITY(1,1) PRIMARY KEY', str: 'NVARCHAR(255)', 'str!': 'NVARCHAR(255) NOT NULL PRIMARY KEY', text: 'NVARCHAR(MAX)', int: 'INT', num: 'DECIMAL(18,2)', date: 'NVARCHAR(10)', ts: 'NVARCHAR(30)', bool: 'BIT' },
};

const toDb = (v) => (v === true ? 1 : v === false ? 0 : v === undefined || v === '' ? null : v);
const fromDb = (row) => {
  if (!row) return row;
  for (const k of Object.keys(row)) if (typeof row[k] === 'boolean') row[k] = row[k] ? 1 : 0;
  return row;
};

let impl;

function sqliteImpl() {
  const Database = require('better-sqlite3');
  const file = process.env.SQLITE_PATH ||
    (process.env.WEBSITE_INSTANCE_ID || process.env.NODE_ENV === 'production' ? path.join(os.tmpdir(), 'go-green-hr.db') : path.join(__dirname, '..', '..', 'data', 'go-green-hr.db'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  return {
    file,
    async query(sql, params = []) { return db.prepare(sql).all(params.map(toDb)); },
    async run(sql, params = []) { return db.prepare(sql).run(params.map(toDb)); },
    async insert(table, cols, vals) {
      const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) RETURNING id`;
      return db.prepare(sql).get(vals.map(toDb)).id;
    },
    async insertMany(table, cols, rows) {
      const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      db.transaction((rs) => { for (const r of rs) stmt.run(r.map(toDb)); })(rows);
    },
    async exec(sql) { db.exec(sql); },
  };
}

function mssqlImpl() {
  const sql = require('mssql');
  const poolP = new sql.ConnectionPool(process.env.SQL_CONNECTION_STRING).connect();
  const bind = (req, text, params) => {
    let i = 0;
    const out = text.replace(/\?/g, () => `@p${i++}`);
    params.forEach((p, j) => req.input(`p${j}`, toDb(p)));
    return out;
  };
  return {
    file: 'Azure SQL',
    async query(text, params = []) {
      const req = (await poolP).request();
      const r = await req.query(bind(req, text, params));
      return r.recordset || [];
    },
    async run(text, params = []) {
      const req = (await poolP).request();
      const r = await req.query(bind(req, text, params));
      return { changes: r.rowsAffected?.[0] || 0 };
    },
    async insert(table, cols, vals) {
      const req = (await poolP).request();
      const text = `INSERT INTO ${table} (${cols.join(',')}) OUTPUT INSERTED.id VALUES (${cols.map(() => '?').join(',')})`;
      const r = await req.query(bind(req, text, vals));
      return r.recordset[0].id;
    },
    async insertMany(table, cols, rows) {
      // Batch multi-row inserts under SQL Server's 2100-parameter / 1000-row limits.
      const per = Math.max(1, Math.min(900, Math.floor(2000 / cols.length)));
      for (let i = 0; i < rows.length; i += per) {
        const chunk = rows.slice(i, i + per);
        const req = (await poolP).request();
        const text = `INSERT INTO ${table} (${cols.join(',')}) VALUES ` +
          chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
        await req.query(bind(req, text, chunk.flat()));
      }
    },
    async exec(text) { await (await poolP).request().batch(text); },
  };
}

function get() {
  if (!impl) impl = dialect === 'mssql' ? mssqlImpl() : sqliteImpl();
  return impl;
}

async function migrate() {
  const d = get();
  const T = TYPES[dialect];
  for (const [name, cols] of Object.entries(tables)) {
    const body = Object.entries(cols).map(([c, t]) => `${c} ${T[t]}`).join(', ');
    if (dialect === 'sqlite') await d.exec(`CREATE TABLE IF NOT EXISTS ${name} (${body})`);
    else await d.exec(`IF OBJECT_ID(N'dbo.${name}', N'U') IS NULL CREATE TABLE dbo.${name} (${body})`);
  }
  for (const [t, c] of indexes) {
    const ix = `ix_${t}_${c}`;
    if (dialect === 'sqlite') await d.exec(`CREATE INDEX IF NOT EXISTS ${ix} ON ${t}(${c})`);
    else await d.exec(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = '${ix}') CREATE INDEX ${ix} ON dbo.${t}(${c})`);
  }
}

const cleanCols = (table, obj) => {
  const def = tables[table];
  return Object.keys(obj).filter((k) => k in def && def[k] !== 'id');
};

const db = {
  dialect,
  get location() { return get().file; },
  migrate,
  async query(sql, params) { return (await get().query(sql, params)).map(fromDb); },
  async one(sql, params) { return (await db.query(sql, params))[0] || null; },
  run: (sql, params) => get().run(sql, params),
  async insert(table, obj) {
    const cols = cleanCols(table, obj);
    return get().insert(table, cols, cols.map((c) => obj[c]));
  },
  async insertMany(table, rows) {
    if (!rows.length) return;
    const cols = cleanCols(table, rows[0]);
    return get().insertMany(table, cols, rows.map((r) => cols.map((c) => r[c])));
  },
  async update(table, id, obj) {
    const cols = cleanCols(table, obj);
    if (!cols.length) return;
    await get().run(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => obj[c]), id]);
  },
  async remove(table, id) { await get().run(`DELETE FROM ${table} WHERE id = ?`, [id]); },
  async getSetting(key, fallback) {
    const r = await db.one('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
    if (!r) return fallback;
    try { return JSON.parse(r.setting_value); } catch { return r.setting_value; }
  },
  async setSetting(key, value) {
    const v = JSON.stringify(value);
    const r = await get().run('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [v, key]);
    if (!r.changes) await get().run('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, v]);
  },
};

module.exports = db;
