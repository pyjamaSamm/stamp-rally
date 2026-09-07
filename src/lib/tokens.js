/**
 * Token derivation for the prototype.
 *
 * IMPORTANT: fnv() is a 32-bit non-cryptographic hash. It is a stand-in for a
 * real signature so the handshake can be demoed on one device — it is
 * trivially forgeable and must not be mistaken for security. A production
 * build replaces every use of it with HMAC-SHA256 or an Ed25519 signature.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../config.js"));
  else root.SR = Object.assign(root.SR || {}, factory(root.SR));
})(typeof globalThis !== "undefined" ? globalThis : this, function (config) {
  const B32 = config.B32;

  /** FNV-1a, 32-bit. Deterministic, fast, NOT cryptographic. */
  function fnv(s) {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 16777619);
    }
    return x >>> 0;
  }

  /** Deterministic base32 token of `len` chars derived from `seed`. */
  function tok(seed, len) {
    let out = "";
    for (let i = 0; out.length < len; i++) {
      let n = fnv(seed + "|" + i);
      for (let j = 0; j < 4 && out.length < len; j++) {
        out += B32.charAt(n % 32);
        n = Math.floor(n / 32);
      }
    }
    return out;
  }

  /** Random base32 token of `len` chars. `rng` is injectable for tests. */
  function randomToken(len, rng) {
    const random = rng || Math.random;
    let out = "";
    for (let i = 0; i < len; i++) out += B32.charAt(Math.floor(random() * 32));
    return out;
  }

  /** The 4 characters a device shows the admin during a claim. */
  function stallDeviceToken(deviceKey) {
    return tok(deviceKey + "|stall", 4);
  }

  /** The 4 characters that identify this device in logs. */
  function deviceShort(deviceKey) {
    return deviceKey.slice(0, 4);
  }

  /** Event code printed on the invite, e.g. RLY-8K2M. */
  function eventCode(name, rng) {
    const random = rng || Math.random;
    return "RLY-" + tok(name + random(), 4);
  }

  return { fnv, tok, randomToken, stallDeviceToken, deviceShort, eventCode };
});
