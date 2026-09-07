const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/config.js");
const claims = require("../src/lib/claims.js");

const T0 = 1_700_000_000_000;
const issueAt = (t) => claims.newIssue("d0s0", t, () => 0.5);

test("a new claim is unscanned and pinned to its stall", () => {
  const issue = issueAt(T0);
  assert.equal(issue.stallId, "d0s0");
  assert.equal(issue.scannedBy, null);
  assert.equal(issue.scanTime, null);
  assert.equal(issue.nonce.length, 6);
});

test("a claim is live for its full TTL and dead one millisecond later", () => {
  const issue = issueAt(T0);
  assert.equal(claims.isLive(issue, T0), true);
  assert.equal(claims.isLive(issue, T0 + config.CLAIM_TTL - 1), true);
  assert.equal(claims.isLive(issue, T0 + config.CLAIM_TTL), false);
  assert.equal(claims.isLive(issue, T0 + config.CLAIM_TTL + 1), false);
});

test("remaining time counts down and floors at zero", () => {
  const issue = issueAt(T0);
  assert.equal(claims.remainingMs(issue, T0), config.CLAIM_TTL);
  assert.equal(claims.remainingMs(issue, T0 + 30000), config.CLAIM_TTL - 30000);
  assert.equal(claims.remainingMs(issue, T0 + config.CLAIM_TTL * 2), 0);
  assert.equal(claims.remainingMs(null, T0), 0);
});

test("ttlPercent runs 100 down to 0", () => {
  const issue = issueAt(T0);
  assert.equal(claims.ttlPercent(issue, T0), 100);
  assert.equal(claims.ttlPercent(issue, T0 + config.CLAIM_TTL / 2), 50);
  assert.equal(claims.ttlPercent(issue, T0 + config.CLAIM_TTL), 0);
});

test("a live, unscanned code can be claimed", () => {
  assert.deepEqual(claims.canScan(issueAt(T0), T0 + 1000, "live"), { ok: true, reason: null });
});

test("an expired code cannot be claimed", () => {
  const r = claims.canScan(issueAt(T0), T0 + config.CLAIM_TTL + 1, "live");
  assert.deepEqual(r, { ok: false, reason: "expired" });
});

test("a code already scanned by another device cannot be claimed again", () => {
  const scanned = claims.applyScan(issueAt(T0), "WXYZ", "10:00");
  const r = claims.canScan(scanned, T0 + 1000, "live");
  assert.deepEqual(r, { ok: false, reason: "already_scanned" });
});

test("there is nothing to claim when the admin has not issued a code", () => {
  assert.deepEqual(claims.canScan(null, T0, "live"), { ok: false, reason: "none_offered" });
});

test("a screenshot of a regenerated code is rejected", () => {
  assert.deepEqual(claims.canScan(issueAt(T0), T0 + 1000, "old"), { ok: false, reason: "superseded" });
});

test("a code already burned on a stall is rejected", () => {
  assert.deepEqual(claims.canScan(issueAt(T0), T0 + 1000, "used"), { ok: false, reason: "burned" });
});

test("applyScan records the device without mutating the original", () => {
  const issue = issueAt(T0);
  const scanned = claims.applyScan(issue, "WXYZ", "10:00");
  assert.equal(scanned.scannedBy, "WXYZ");
  assert.equal(scanned.scanTime, "10:00");
  assert.equal(issue.scannedBy, null, "original must be untouched");
});

test("the admin cannot bind before anyone has scanned", () => {
  assert.equal(claims.canConfirm(issueAt(T0), T0 + 1000), false);
});

test("the admin can bind a live code that has been scanned", () => {
  const scanned = claims.applyScan(issueAt(T0), "WXYZ", "10:00");
  assert.equal(claims.canConfirm(scanned, T0 + 1000), true);
});

test("the admin cannot bind a scanned code after it expires", () => {
  const scanned = claims.applyScan(issueAt(T0), "WXYZ", "10:00");
  assert.equal(claims.canConfirm(scanned, T0 + config.CLAIM_TTL + 1), false);
});

test("canConfirm is false when there is no claim at all", () => {
  assert.equal(claims.canConfirm(null, T0), false);
});

test("the spoken code is 4 stable characters derived from the nonce", () => {
  const issue = issueAt(T0);
  const code = claims.spokenCode(issue);
  assert.equal(code.length, 4);
  assert.equal(code, claims.spokenCode(issue));
  assert.equal(claims.spokenCode(null), "—");
});

test("regenerating produces a different nonce, invalidating the old code", () => {
  let n = 0;
  const rng = () => (n++ % 31) / 31;
  const first = claims.newIssue("d0s0", T0, rng);
  const second = claims.newIssue("d0s0", T0 + 5000, rng);
  assert.notEqual(first.nonce, second.nonce);
});
