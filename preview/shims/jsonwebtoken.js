// Browser stand-in for jsonwebtoken. The preview runs entirely in the viewer's own
// browser, so the token only needs to carry the user id and an expiry.
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s))));
module.exports = {
  sign(payload) { return enc({ ...payload, exp: Date.now() + 12 * 3600 * 1000 }); },
  verify(token) {
    const p = dec(String(token));
    if (!p || p.exp < Date.now()) throw new Error('expired');
    return p;
  },
};
