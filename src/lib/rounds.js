/**
 * Stamp rounds and the rules a scanned code has to survive.
 *
 * `evaluateScan` is the heart of it: given a space and a scanned payload it
 * returns a verdict — never a rendered string. The component maps verdicts to
 * copy, which keeps the rules testable without asserting on prose.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./tokens.js"), require("./spaces.js"));
  else root.SR = Object.assign(root.SR || {}, factory(root.SR, root.SR));
})(typeof globalThis !== "undefined" ? globalThis : this, function (tokens, spaces) {
  /** Which rotation window a timestamp falls in. */
  function frameOf(t, frameMs) {
    return Math.floor(t / frameMs);
  }

  /** The frame length in force: the open round's, else the space default. */
  function frameMsOf(space) {
    if (space && space.round && space.round.frameMs) return space.round.frameMs;
    return space ? space.frameMs : 8000;
  }

  function buildPayload(round, frame) {
    return round.stallId + ":" + round.nonce + ":" + frame;
  }

  function parsePayload(raw) {
    const parts = (raw || "").split(":");
    if (parts.length !== 3) return null;
    const frame = Number(parts[2]);
    if (!Number.isFinite(frame)) return null;
    return { stallId: parts[0], nonce: parts[1], frame };
  }

  /** A code is good for the current frame and the one before it. */
  function isFrameFresh(frame, nowFrame) {
    return frame === nowFrame || frame === nowFrame - 1;
  }

  function openRound(space, now, rng) {
    return {
      no: space.roundNo + 1,
      stallId: space.stall,
      nonce: tokens.randomToken(6, rng),
      openedAt: now === undefined ? Date.now() : now,
      seats: space.seats,
      frameMs: space.frameMs,
      claims: [],
    };
  }

  /** This device is only allowed to open a round for a stall it is bound to. */
  function canOpenRound(space, deviceToken) {
    if (!space || space.expired) return { ok: false, reason: "event_closed" };
    const stallId = space.stall;
    if (!stallId || !space.bindings[stallId]) return { ok: false, reason: "not_authorised" };
    if (space.bindings[stallId].device !== deviceToken) return { ok: false, reason: "not_authorised" };
    return { ok: true, reason: null };
  }

  function grantedSeats(round) {
    return round ? round.claims.filter((c) => !c.revoked).length : 0;
  }

  /**
   * Decide what a scanned payload earns. Returns:
   *   { status, ... }  where status is one of
   *   no_round | stale | dupe | seats_full | ok
   */
  function evaluateScan(space, raw, now) {
    const round = space && space.round;
    const parsed = parsePayload(raw);

    if (!round || !parsed || parsed.nonce !== round.nonce) {
      return { status: "no_round" };
    }

    const frameMs = frameMsOf(space);
    const nowFrame = frameOf(now, frameMs);
    if (!isFrameFresh(parsed.frame, nowFrame)) {
      const ageSeconds = Math.max(0, Math.round(((nowFrame - parsed.frame) * frameMs) / 1000));
      return {
        status: "stale",
        round: round.no,
        ageSeconds,
        graceSeconds: Math.round((frameMs * 2) / 1000),
      };
    }

    const alreadyStamped = space.stamps.some((x) => x.stallId === round.stallId && !x.revoked);
    if (alreadyStamped) {
      return { status: "dupe", round: round.no, stallId: round.stallId };
    }

    if (grantedSeats(round) >= round.seats) {
      return { status: "seats_full", round: round.no, seats: round.seats };
    }

    return { status: "ok", round: round.no, stallId: round.stallId, frame: parsed.frame };
  }

  /**
   * Build the stamp a successful scan earns. Each stamp hashes the previous
   * one — a local tamper-tell, not a security boundary (see tokens.js).
   */
  function buildStamp(space, verdict, deviceKey, now, time) {
    const found = spaces.findStall(space, verdict.stallId);
    const prev = space.stamps.length ? space.stamps[space.stamps.length - 1].hash : "GENESIS";
    const hash = tokens.tok(prev + deviceKey + space.round.nonce + verdict.frame, 8);
    return {
      stallId: verdict.stallId,
      domainId: found ? found.d.id : null,
      at: now,
      time,
      hash,
      round: verdict.round,
      revoked: false,
    };
  }

  return {
    frameOf,
    frameMsOf,
    buildPayload,
    parsePayload,
    isFrameFresh,
    openRound,
    canOpenRound,
    grantedSeats,
    evaluateScan,
    buildStamp,
  };
});
