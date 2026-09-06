// Building, signing, verifying, and fetching the static event file —
// OFFLINE.md §4.

import { canonical, signObj, verifyObj, exportPub, importPub, randomCode } from "./crypto.js";

export async function buildEventFile({ name, requiredStamps, frameMs, opensAt, closesAt, domains }, eventKeypair) {
  const code = "RLY-" + randomCode(4);
  const eventKey = await exportPub(eventKeypair.publicKey);
  const body = { v: 1, code, name, eventKey, requiredStamps, frameMs, opensAt, closesAt, domains };
  const sig = await signObj(eventKeypair.privateKey, body);
  return { ...body, sig };
}

// Self-consistency only: proves the file wasn't altered after being signed
// with the key it itself carries. It does NOT prove `eventKey` is the
// "real" one for that code — that trust comes from HTTPS + who controls
// the repo, same as OFFLINE.md §4 says plainly ("belt and braces... but free").
export async function verifyEventFile(fileObj) {
  const { sig, ...body } = fileObj;
  try {
    const pub = await importPub(fileObj.eventKey);
    return await verifyObj(pub, sig, body);
  } catch {
    return false;
  }
}

export async function fetchEventFile(code) {
  const res = await fetch(`./events/${code}.json`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export function downloadEventFile(fileObj) {
  const blob = new Blob([JSON.stringify(fileObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileObj.code}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
