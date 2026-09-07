/**
 * The stall-authorisation handshake.
 *
 * The admin issues a single-use claim code for one stall; the stall's device
 * scans it; the admin confirms what they see. Neither side can bind alone.
 * Every rule below is a pure predicate so the two-sided flow is testable
 * without a browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("../config.js"), require("./tokens.js"));
  else root.SR = Object.assign(root.SR || {}, factory(root.SR, root.SR));
})(typeof globalThis !== "undefined" ? globalThis : this, function (config, tokens) {
  /** A freshly issued claim. `rng` is injectable so tests get stable nonces. */
  function newIssue(stallId, now, rng) {
    return {
      stallId,
      nonce: tokens.randomToken(6, rng),
      issuedAt: now === undefined ? Date.now() : now,
      scannedBy: null,
      scanTime: null,
    };
  }

  function remainingMs(issue, now) {
    if (!issue) return 0;
    return Math.max(0, config.CLAIM_TTL - (now - issue.issuedAt));
  }

  function isLive(issue, now) {
    return remainingMs(issue, now) > 0;
  }

  /** The 4 characters the admin reads out loud. Never sent, only spoken. */
  function spokenCode(issue) {
    return issue ? tokens.tok(issue.nonce + ":spoken", 4) : "—";
  }

  /**
   * Can this device claim the code currently on offer?
   * `kind` mirrors the prototype's attack buttons: "live" is a genuine scan,
   * "old" a screenshot of a regenerated code, "used" an already-bound code.
   */
  function canScan(issue, now, kind) {
    if (kind === "used") return { ok: false, reason: "burned" };
    if (kind === "old") return { ok: false, reason: "superseded" };
    if (!issue) return { ok: false, reason: "none_offered" };
    if (!isLive(issue, now)) return { ok: false, reason: "expired" };
    if (issue.scannedBy) return { ok: false, reason: "already_scanned" };
    return { ok: true, reason: null };
  }

  /** Record a scan against the claim. Returns a new issue object. */
  function applyScan(issue, deviceToken, time) {
    return Object.assign({}, issue, { scannedBy: deviceToken, scanTime: time });
  }

  /** The admin may only bind once a live code has actually been scanned. */
  function canConfirm(issue, now) {
    return !!issue && isLive(issue, now) && !!issue.scannedBy;
  }

  /** Percentage of the TTL still remaining, for the countdown bar. */
  function ttlPercent(issue, now) {
    return Math.round((remainingMs(issue, now) / config.CLAIM_TTL) * 100);
  }

  return { newIssue, remainingMs, isLive, spokenCode, canScan, applyScan, canConfirm, ttlPercent };
});
