// Browser stand-in for bcryptjs. Real bcrypt takes about 0.1s per hash in a browser,
// which would slow the demo seed. Passwords here never leave the viewer's browser.
const tag = (pw) => 'preview$' + btoa(unescape(encodeURIComponent(String(pw))));
module.exports = {
  hashSync: (pw) => tag(pw),
  compareSync: (pw, hash) => tag(pw) === hash,
};
