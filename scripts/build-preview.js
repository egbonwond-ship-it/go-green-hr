// Builds a self-contained browser preview of Go-Green HR into dist-preview/.
// The real API router runs in the browser on sql.js, so the preview needs no server
// and no Azure account. Data stays in the viewer's own browser.
//   node scripts/build-preview.js
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist-preview');
const shim = (f) => path.join(root, 'preview', 'shims', f);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const svg = (f) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'app', f)).toString('base64');

esbuild.buildSync({
  entryPoints: [path.join(root, 'preview', 'entry.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  outfile: path.join(out, 'gg-hr.js'),
  alias: {
    'better-sqlite3': shim('better-sqlite3.js'),
    jsonwebtoken: shim('jsonwebtoken.js'),
    bcryptjs: shim('bcryptjs.js'),
    mssql: shim('node-stubs.js'),
    path: shim('node-stubs.js'),
    os: shim('node-stubs.js'),
    fs: shim('node-stubs.js'),
    crypto: shim('node-stubs.js'),
  },
  banner: { js: 'var process={env:{SQLITE_PATH:"preview.db",NODE_ENV:"preview"},argv:[]};' },
  logLevel: 'warning',
});
const jsFile = path.join(out, 'gg-hr.js');
fs.writeFileSync(jsFile, fs.readFileSync(jsFile, 'utf8').split('/logo-full.svg').join(svg('logo-full.svg')));

// The page body for an Artifact-style host, which supplies <html>, <head> and <body> itself.
const css = fs.readFileSync(path.join(root, 'app', 'styles.css'), 'utf8');
const html = `<title>GO-Green HR</title>
<meta name="theme-color" content="#0d2b1d">
<link rel="icon" href="${svg('logo-mark.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:wght@800;900&display=swap">
<style>
${css}
</style>
<div id="root"><div class="boot">Loading Go-Green HR…</div></div>
<div id="toasts" aria-live="polite"></div>
<div id="chart-tip" class="chart-tip" hidden></div>
<script src="gg-hr.js"></script>
`;
fs.writeFileSync(path.join(out, 'index.html'), html);
// One self-contained file (script inlined) that opens straight from disk or any static host.
const js = fs.readFileSync(jsFile, 'utf8').replace(/<\/script/gi, '<\\/script');
const page = html.replace('<script src="gg-hr.js"></script>', () => `<script>${js}</script>`);
fs.writeFileSync(path.join(out, 'go-green-hr.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n</head><body>\n${page}</body></html>\n`);
console.log('Built', path.relative(root, out), (fs.statSync(jsFile).size / 1e6).toFixed(1) + ' MB script');
