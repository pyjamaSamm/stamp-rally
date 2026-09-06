// WebCrypto primitives for the offline path. No libraries, no polyfills.
// ECDSA P-256 — the universal fallback from OFFLINE.md §3 (Ed25519 support
// across Safari versions isn't consistent enough yet to make it the default).

const ALGO = { name: "ECDSA", namedCurve: "P-256" };
const SIGN_PARAMS = { name: "ECDSA", hash: "SHA-256" };

export async function makeKeypair(extractable = false) {
  return crypto.subtle.generateKey(ALGO, extractable, ["sign", "verify"]);
}

export async function exportPub(publicKey) {
  const raw = await crypto.subtle.exportKey("raw", publicKey); // 65 bytes, uncompressed
  return b64u(raw);
}

export async function importPub(b64) {
  return crypto.subtle.importKey("raw", unb64u(b64), ALGO, true, ["verify"]);
}

export async function sign(privateKey, bytes) {
  const sig = await crypto.subtle.sign(SIGN_PARAMS, privateKey, bytes);
  return b64u(sig);
}

export async function verify(publicKey, sigB64, bytes) {
  return crypto.subtle.verify(SIGN_PARAMS, publicKey, new Uint8Array(unb64u(sigB64)), bytes);
}

// Sign/verify a plain object by canonicalising it first. `obj` must not
// contain the `sig` field itself — pass everything else.
export async function signObj(privateKey, obj) {
  return sign(privateKey, bytesOf(canonical(obj)));
}

export async function verifyObj(publicKey, sigB64, obj) {
  return verify(publicKey, sigB64, bytesOf(canonical(obj)));
}

export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", bytesOf(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Recursively sorts object keys so JSON.stringify is stable — signatures
// break otherwise. Used on both the signing side and the verifying side.
export function canonical(obj) {
  return JSON.stringify(sortDeep(obj));
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortDeep(value[k]);
        return acc;
      }, {});
  }
  return value;
}

export function bytesOf(str) {
  return new TextEncoder().encode(str);
}

export function randomCode(len, alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789") {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export function b64u(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function unb64u(s) {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)).buffer;
}
