// Empty stand-ins for Node modules that the browser preview never calls.
module.exports = {
  join: (...p) => p.join('/'), dirname: (p) => String(p).split('/').slice(0, -1).join('/') || '/',
  tmpdir: () => '/tmp', mkdirSync() {}, existsSync: () => false, readFileSync() { throw new Error('no fs'); },
};
