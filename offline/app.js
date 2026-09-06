// Stamp Rally — offline path (OFFLINE.md), build steps 1-5: crypto module,
// event file, localStorage layer, two-scan binding, and rotating stamp
// codes with the five verification checks. All typed/pasted, no camera yet
// (step 6) and no prize desk yet (step 7) — see OFFLINE.md for those.
//
// Same rendering pattern as the Supabase build's app.js: module-level state,
// a render() that rebuilds #app's innerHTML from scratch, and
// attachHandlers() that re-wires listeners after every render.

import { makeKeypair, exportPub, importPub, signObj, verifyObj, sha256Hex, randomCode } from "./crypto.js";
import { saveKeypair, loadKeypair } from "./idb.js";
import { loadEventState, saveEventState, clearEventState, listSavedEvents } from "./storage.js";
import { buildEventFile, verifyEventFile, fetchEventFile, downloadEventFile } from "./event-file.js";

let deviceKeypair = null;
let devicePub = "";

let currentCode = null;
let currentState = null;
let cachedPayload = null; // this device's current signed stamp payload, if it runs a stall

let uiOpenStallIssue = null; // admin: which stall's "issue certificate" form is open
let uiShowBecomeStall = false;
let errorMessage = "";
let notice = "";

const $ = (sel) => document.querySelector(sel);

function flatStalls() {
  return (currentState?.event.domains || []).flatMap((d) => d.stalls.map((s) => ({ ...s, domain: d.name })));
}

function stallName(id) {
  return flatStalls().find((s) => s.id === id)?.name || id;
}

async function boot() {
  deviceKeypair = await getOrCreateDeviceIdentity();
  devicePub = await exportPub(deviceKeypair.publicKey);
  render();
}

async function getOrCreateDeviceIdentity() {
  let kp = await loadKeypair("device-identity");
  if (!kp) {
    kp = await makeKeypair(false); // non-extractable: never needs backing up (see BACKEND-style note below)
    await saveKeypair("device-identity", kp);
  }
  return kp;
}

// ── event lifecycle ──────────────────────────────────────────────────────

async function createEvent(fields) {
  errorMessage = "";
  try {
    // Extractable, unlike the device identity key above: losing this key
    // kills new bindings for the rest of the event (OFFLINE.md §9), so the
    // admin needs the option to back it up. Shown once, right after creation.
    const eventKeypair = await makeKeypair(true);
    const fileObj = await buildEventFile(fields, eventKeypair);
    await saveKeypair(`event:${fileObj.code}`, eventKeypair);
    currentCode = fileObj.code;
    currentState = { v: 1, devicePub, role: "admin", event: fileObj, stamps: [], issuedCerts: [] };
    saveEventState(currentCode, currentState);
    downloadEventFile(fileObj);
    notice = `Event created. Save the downloaded file as offline/events/${fileObj.code}.json in your repo (commit + push, or just drop it in the folder for local testing) so other devices can join.`;
    render();
  } catch (err) {
    errorMessage = err.message;
    render();
  }
}

async function joinEvent(codeInput) {
  errorMessage = "";
  const code = codeInput.trim().toUpperCase();
  const existing = loadEventState(code);
  if (existing) {
    openEvent(code, existing);
    return;
  }
  const fileObj = await fetchEventFile(code);
  if (!fileObj) {
    errorMessage = `No event file found at offline/events/${code}.json — has it been published yet?`;
    render();
    return;
  }
  const ok = await verifyEventFile(fileObj);
  if (!ok) {
    errorMessage = "That event file's signature doesn't check out — it may be corrupted.";
    render();
    return;
  }
  const state = { v: 1, devicePub, role: null, event: fileObj, stamps: [] };
  saveEventState(code, state);
  openEvent(code, state);
}

function openEvent(code, state) {
  currentCode = code;
  currentState = state;
  errorMessage = "";
  render();
}

function leaveEvent() {
  currentCode = null;
  currentState = null;
  cachedPayload = null;
  errorMessage = "";
  notice = "";
  render();
}

// ── admin: two-scan binding, issuing side ───────────────────────────────

async function issueCertificate(stallId, stallPubB64) {
  errorMessage = "";
  try {
    const eventKeypair = await loadKeypair(`event:${currentCode}`);
    const body = {
      t: "cert",
      ev: currentCode,
      stall: stallId,
      key: stallPubB64.trim(),
      iat: Date.now(),
      exp: new Date(currentState.event.closesAt).getTime(),
    };
    const sig = await signObj(eventKeypair.privateKey, body);
    const cert = { ...body, sig };
    currentState.issuedCerts = (currentState.issuedCerts || []).filter((c) => c.stall !== stallId);
    currentState.issuedCerts.push(cert);
    saveEventState(currentCode, currentState);
    uiOpenStallIssue = null;
    render();
  } catch (err) {
    errorMessage = err.message;
    render();
  }
}

// ── any device: two-scan binding, receiving side ────────────────────────

async function saveCertificate(stallId, certText) {
  errorMessage = "";
  let cert;
  try {
    cert = JSON.parse(certText);
  } catch {
    errorMessage = "That doesn't look like valid certificate JSON.";
    render();
    return;
  }
  try {
    const eventPub = await importPub(currentState.event.eventKey);
    const { sig, ...body } = cert;
    const ok = await verifyObj(eventPub, sig, body);
    if (!ok) throw new Error("Certificate signature doesn't verify against this event's key.");
    if (cert.ev !== currentCode) throw new Error("Certificate is for a different event.");
    if (cert.stall !== stallId) throw new Error("Certificate is for a different stall.");
    if (cert.key !== devicePub) throw new Error("Certificate was issued to a different device.");
    if (cert.exp < Date.now()) throw new Error("Certificate has already expired.");

    currentState.role = "stall";
    currentState.cert = cert;
    saveEventState(currentCode, currentState);
    uiShowBecomeStall = false;
    render();
  } catch (err) {
    errorMessage = err.message;
    render();
  }
}

// ── stall device: rotating stamp codes ──────────────────────────────────

function startRound() {
  currentState.round = { nonce: randomCode(6), startedAt: Date.now() };
  saveEventState(currentCode, currentState);
  cachedPayload = null;
  render();
}

function closeRound() {
  delete currentState.round;
  saveEventState(currentCode, currentState);
  cachedPayload = null;
  render();
}

async function refreshPayloadIfNeeded() {
  if (!currentState?.round || !currentState.cert) {
    if (cachedPayload) {
      cachedPayload = null;
      render();
    }
    return;
  }
  const frame = Math.floor(Date.now() / currentState.event.frameMs);
  if (cachedPayload && cachedPayload.f === frame) return;

  const body = { t: "st", ev: currentCode, stall: currentState.cert.stall, r: currentState.round.nonce, f: frame };
  const sig = await signObj(deviceKeypair.privateKey, body);
  const spoken = (await sha256Hex(currentState.round.nonce + ":" + frame)).slice(0, 4).toUpperCase();
  cachedPayload = { ...body, sig, cert: currentState.cert, spoken };
  render();
}

// ── visitor: verify + stamp ──────────────────────────────────────────────

async function verifyAndStamp(payloadText) {
  errorMessage = "";
  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    errorMessage = "That doesn't look like valid stamp-code JSON.";
    render();
    return;
  }

  try {
    const cert = payload.cert;
    const eventPub = await importPub(currentState.event.eventKey);
    const certBody = { t: cert.t, ev: cert.ev, stall: cert.stall, key: cert.key, iat: cert.iat, exp: cert.exp };
    if (!(await verifyObj(eventPub, cert.sig, certBody))) throw new Error("Stall's certificate doesn't verify — reject.");
    if (cert.exp < Date.now() || cert.ev !== currentCode) throw new Error("Stall's certificate is expired or for the wrong event.");

    const stallPub = await importPub(cert.key);
    const payloadBody = { t: payload.t, ev: payload.ev, stall: payload.stall, r: payload.r, f: payload.f };
    if (!(await verifyObj(stallPub, payload.sig, payloadBody))) throw new Error("Code's signature doesn't match the bound stall device — reject.");

    const currentFrame = Math.floor(Date.now() / currentState.event.frameMs);
    if (payload.f !== currentFrame && payload.f !== currentFrame - 1) throw new Error("Code is stale — ask for a fresh one.");

    if ((currentState.stamps || []).some((s) => s.stall === payload.stall && !s.revoked)) {
      throw new Error("Already stamped for this stall.");
    }

    currentState.stamps = currentState.stamps || [];
    currentState.stamps.push({
      stall: payload.stall,
      round: payload.r,
      frame: payload.f,
      at: Date.now(),
      sig: payload.sig,
      cert,
      revoked: false,
    });
    saveEventState(currentCode, currentState);

    const spoken = (await sha256Hex(payload.r + ":" + payload.f)).slice(0, 4).toUpperCase();
    notice = `Stamped for ${stallName(payload.stall)}. Check the stall read "${spoken}" aloud.`;
    render();
  } catch (err) {
    errorMessage = err.message;
    render();
  }
}

// ── rendering ────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function render() {
  const root = $("#app");
  root.innerHTML = currentCode ? renderDashboard() : renderHome();
  attachHandlers();
}

function renderHome() {
  const saved = listSavedEvents();
  return `
    <div class="stack">
      ${errorMessage ? `<div class="panel error">${escapeHtml(errorMessage)}</div>` : ""}
      ${notice ? `<div class="panel notice">${escapeHtml(notice)}</div>` : ""}

      ${
        saved.length
          ? `<div class="panel">
              <h2>Your events</h2>
              <div class="stack">
                ${saved
                  .map(
                    ({ code, state }) => `
                  <div class="stall-row">
                    <div>
                      <div class="stall-name">${escapeHtml(state.event.name)}</div>
                      <div class="muted">${escapeHtml(code)} · ${escapeHtml(state.role || "unbound")}</div>
                    </div>
                    <button data-open-event="${code}">Open</button>
                  </div>`
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }

      <div class="panel">
        <h2>Create an event</h2>
        <form id="create-form" class="stack">
          <label>Event name<input name="name" required maxlength="80" placeholder="Domain Rally · Q3 Offsite" /></label>
          <label>Stamps required<input name="requiredStamps" type="number" min="1" max="12" value="6" /></label>
          <label>QR redraw interval (ms)<input name="frameMs" type="number" min="2000" step="1000" value="8000" /></label>
          <label>Opens<input name="opensAt" type="datetime-local" required /></label>
          <label>Closes<input name="closesAt" type="datetime-local" required /></label>
          <div class="stack" id="stall-builder">
            <label>Domain<input class="domain-input" placeholder="Build" /></label>
            <label>Stall name<input class="stall-input" placeholder="Frontend" /></label>
          </div>
          <button type="button" id="add-stall-row">+ Add another stall</button>
          <button type="submit">Create event &amp; download event file</button>
        </form>
      </div>

      <div class="panel">
        <h2>Join an event</h2>
        <p class="muted">Needs <code>offline/events/&lt;code&gt;.json</code> to already exist (published by the admin).</p>
        <form id="join-form" class="stack row">
          <label>Event code<input name="code" required maxlength="20" placeholder="RLY-8K2M" style="text-transform:uppercase" /></label>
          <button type="submit">Join event</button>
        </form>
      </div>
    </div>
  `;
}

function renderDashboard() {
  const admin = currentState.role === "admin";
  const bound = !!currentState.cert;
  refreshPayloadIfNeeded();

  return `
    <div class="stack">
      ${errorMessage ? `<div class="panel error">${escapeHtml(errorMessage)}</div>` : ""}
      ${notice ? `<div class="panel notice">${escapeHtml(notice)}</div>` : ""}

      <div class="panel header">
        <div>
          <h2>${escapeHtml(currentState.event.name)}</h2>
          <div class="code">${escapeHtml(currentCode)}</div>
          <div class="muted">closes ${new Date(currentState.event.closesAt).toLocaleString()}</div>
        </div>
        <div class="stack" style="align-items:flex-end">
          ${admin ? `<span class="badge admin">Admin</span>` : ""}
          <button id="leave-btn" class="secondary">Leave event</button>
        </div>
      </div>

      ${admin ? renderAdminStalls() : ""}
      ${!admin ? renderDeviceKeyPanel() : ""}
      ${!admin && bound ? renderStallPanel() : ""}
      ${!admin && !bound ? renderBecomeStallPanel() : ""}
      ${!admin ? renderClaimStampPanel() : ""}
      ${!admin ? renderCardPanel() : ""}
    </div>
  `;
}

function renderAdminStalls() {
  const certs = currentState.issuedCerts || [];
  return `
    <div class="panel">
      <h2>Stalls</h2>
      <div class="stack">
        ${flatStalls()
          .map((s) => {
            const cert = certs.find((c) => c.stall === s.id);
            const open = uiOpenStallIssue === s.id;
            return `
            <div class="stall-row" style="flex-direction:column;align-items:stretch">
              <div class="stall-row" style="padding:0;border:none">
                <div>
                  <div class="stall-name">${escapeHtml(s.name)}</div>
                  <div class="muted">${escapeHtml(s.domain)}</div>
                </div>
                <div class="stack" style="align-items:flex-end">
                  ${cert ? `<span class="badge mine">Issued to ${escapeHtml(cert.key.slice(0, 8))}…</span>` : `<span class="badge open">No cert issued</span>`}
                  <button data-toggle-issue="${s.id}" class="secondary">${open ? "Close" : cert ? "Reissue" : "Issue certificate"}</button>
                </div>
              </div>
              ${
                open
                  ? `
                <form data-issue-form="${s.id}" class="stack">
                  <label>Paste the stall device's public key (shown on their "Your device key" panel)
                    <textarea name="pubkey" rows="2" required placeholder="device public key"></textarea>
                  </label>
                  <button type="submit">Sign &amp; issue certificate</button>
                </form>`
                  : ""
              }
              ${
                cert
                  ? `
                <label>Certificate to hand back to that device
                  <textarea readonly rows="3" id="cert-${s.id}">${escapeHtml(JSON.stringify(cert))}</textarea>
                </label>
                <button data-copy="cert-${s.id}" class="secondary">Copy certificate</button>`
                  : ""
              }
            </div>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderDeviceKeyPanel() {
  return `
    <div class="panel">
      <h2>Your device key</h2>
      <p class="muted">Show this to the admin if you're staffing a stall.</p>
      <textarea readonly rows="2" id="device-pub">${escapeHtml(devicePub)}</textarea>
      <button data-copy="device-pub" class="secondary">Copy</button>
    </div>
  `;
}

function renderBecomeStallPanel() {
  const stalls = flatStalls();
  return `
    <div class="panel">
      <h2>Become a stall</h2>
      ${
        uiShowBecomeStall
          ? `
        <form id="become-stall-form" class="stack">
          <label>Which stall are you running?
            <select name="stall" required>
              ${stalls.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.domain)} · ${escapeHtml(s.name)}</option>`).join("")}
            </select>
          </label>
          <label>Paste the certificate the admin gave you
            <textarea name="cert" rows="3" required placeholder="certificate JSON"></textarea>
          </label>
          <button type="submit">Save certificate</button>
        </form>`
          : `<button id="show-become-stall">Bind this device to a stall</button>`
      }
    </div>
  `;
}

function renderStallPanel() {
  const stall = flatStalls().find((s) => s.id === currentState.cert.stall);
  const hasRound = !!currentState.round;
  return `
    <div class="panel">
      <h2>Your stall: ${escapeHtml(stall ? stall.name : currentState.cert.stall)}</h2>
      ${
        hasRound
          ? `
        <div class="stack">
          <div class="muted">Round open — read this aloud so visitors can cross-check:</div>
          <div class="code" style="font-size:32px">${cachedPayload ? escapeHtml(cachedPayload.spoken) : "…"}</div>
          <label>Current stamp code (visitors paste this)
            <textarea readonly rows="4" id="payload-out">${cachedPayload ? escapeHtml(JSON.stringify(cachedPayload)) : ""}</textarea>
          </label>
          <button data-copy="payload-out" class="secondary">Copy code</button>
          <button id="close-round-btn" class="secondary">Close round</button>
        </div>`
          : `<button id="start-round-btn">Start a round</button>`
      }
    </div>
  `;
}

function renderClaimStampPanel() {
  return `
    <div class="panel">
      <h2>Enter a stamp code</h2>
      <p class="muted">Paste the code a stall is showing.</p>
      <form id="claim-form" class="stack">
        <textarea name="payload" rows="4" required placeholder="paste the stamp code JSON"></textarea>
        <button type="submit">Verify &amp; stamp</button>
      </form>
    </div>
  `;
}

function renderCardPanel() {
  const stalls = flatStalls();
  const stamped = new Set((currentState.stamps || []).filter((s) => !s.revoked).map((s) => s.stall));
  const required = currentState.event.requiredStamps;
  return `
    <div class="panel">
      <h2>Your card — ${stamped.size}/${required}</h2>
      ${stamped.size >= required ? `<div class="badge mine">Prize eligible — show this card at the desk</div>` : ""}
      <div class="stack">
        ${stalls
          .map(
            (s) => `
          <div class="stall-row">
            <div>
              <div class="stall-name">${escapeHtml(s.name)}</div>
              <div class="muted">${escapeHtml(s.domain)}</div>
            </div>
            <span class="badge ${stamped.has(s.id) ? "mine" : "open"}">${stamped.has(s.id) ? "Stamped" : "Not yet"}</span>
          </div>`
          )
          .join("")}
      </div>
    </div>
  `;
}

function attachHandlers() {
  $("#create-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    const domains = new Map();
    form.querySelectorAll(".domain-input").forEach((domainInput, i) => {
      const stallInput = form.querySelectorAll(".stall-input")[i];
      const domain = domainInput.value.trim();
      const name = stallInput.value.trim();
      if (!domain || !name) return;
      if (!domains.has(domain)) domains.set(domain, []);
      domains.get(domain).push({ id: `s${i + 1}`, name });
    });
    createEvent({
      name: data.get("name"),
      requiredStamps: Number(data.get("requiredStamps")),
      frameMs: Number(data.get("frameMs")),
      opensAt: new Date(data.get("opensAt")).toISOString(),
      closesAt: new Date(data.get("closesAt")).toISOString(),
      domains: [...domains.entries()].map(([name, stalls]) => ({ name, stalls })),
    });
  });

  $("#add-stall-row")?.addEventListener("click", () => {
    const wrap = $("#stall-builder");
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <label>Domain<input class="domain-input" placeholder="Build" /></label>
      <label>Stall name<input class="stall-input" placeholder="Frontend" /></label>
    `;
    wrap.appendChild(row);
  });

  $("#join-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    joinEvent(new FormData(e.target).get("code"));
  });

  document.querySelectorAll("[data-open-event]").forEach((btn) =>
    btn.addEventListener("click", () => openEvent(btn.dataset.openEvent, loadEventState(btn.dataset.openEvent)))
  );

  $("#leave-btn")?.addEventListener("click", leaveEvent);

  document.querySelectorAll("[data-toggle-issue]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.toggleIssue;
      uiOpenStallIssue = uiOpenStallIssue === id ? null : id;
      render();
    })
  );

  document.querySelectorAll("[data-issue-form]").forEach((form) =>
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      issueCertificate(form.dataset.issueForm, new FormData(form).get("pubkey"));
    })
  );

  $("#show-become-stall")?.addEventListener("click", () => {
    uiShowBecomeStall = true;
    render();
  });

  $("#become-stall-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    saveCertificate(data.get("stall"), data.get("cert"));
  });

  $("#start-round-btn")?.addEventListener("click", startRound);
  $("#close-round-btn")?.addEventListener("click", closeRound);

  $("#claim-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    verifyAndStamp(new FormData(e.target).get("payload"));
  });

  document.querySelectorAll("[data-copy]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const el = document.getElementById(btn.dataset.copy);
      navigator.clipboard?.writeText(el.value ?? el.textContent);
    })
  );
}

// Ticks the stall device's rotating code and re-renders the countdown-ish
// badges; cheap no-op when nothing needs refreshing.
setInterval(() => {
  if (currentCode && currentState && currentState.role !== "admin") refreshPayloadIfNeeded();
}, 1000);

boot();
