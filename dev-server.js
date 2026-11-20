// Local runner: serves the static web app and the API on one port, without
// needing Azure Functions Core Tools. Production runs on Azure Static Web Apps.
//   npm start            -> http://localhost:4280
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handle } = require('./api/src/lib/router');

const PORT = Number(process.env.PORT) || 4280;
const APP_DIR = path.join(__dirname, 'app');
// Send the same security headers as Azure (staticwebapp.config.json), so CSP problems show up locally too.
const SECURITY = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'staticwebapp.config.json'), 'utf8')).globalHeaders || {};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const out = await handle({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, headers: req.headers });
    res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(out.body));
  }
  let file = path.normalize(path.join(APP_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(APP_DIR)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(APP_DIR, 'index.html');
  res.writeHead(200, { ...SECURITY, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`Go-Green HR running at http://localhost:${PORT}`);
  console.log(`Database: ${process.env.SQL_CONNECTION_STRING ? 'Azure SQL' : 'local SQLite (api/data/go-green-hr.db)'}`);
});
