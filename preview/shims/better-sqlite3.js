// Browser stand-in for better-sqlite3, backed by sql.js (SQLite compiled to JavaScript).
// Only the calls used by api/src/lib/db.js are implemented.
class Database {
  constructor() {
    const SQL = globalThis.__GG_SQL;
    const bytes = globalThis.__GG_BYTES;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    globalThis.__GG_DB = this.db;
  }
  pragma() {}
  exec(sql) { this.db.exec(sql); }
  prepare(sql) {
    const db = this.db;
    return {
      all(params = []) {
        const st = db.prepare(sql);
        try {
          st.bind(params);
          const out = [];
          while (st.step()) out.push(st.getAsObject());
          return out;
        } finally { st.free(); }
      },
      get(params = []) { return this.all(params)[0]; },
      run(params = []) { db.run(sql, params); return { changes: db.getRowsModified() }; },
    };
  }
  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN');
      try { fn(...args); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    };
  }
}
module.exports = Database;
