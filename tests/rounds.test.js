const test = require("node:test");
const assert = require("node:assert/strict");
const spaces = require("../src/lib/spaces.js");
const rounds = require("../src/lib/rounds.js");

const T0 = 1_700_000_000_000;
const FRAME = 8000;

/** A space with a bound stall and an open round, ready to be scanned. */
function spaceWithOpenRound(now) {
  const s = spaces.makeSpace("RLY-AAAA", "A", true, now);
  s.stall = "d0s0";
  s.bindings["d0s0"] = { device: "MINE", time: "10:00" };
  s.round = rounds.openRound(s, now, () => 0.5);
  return s;
}

test("frameOf buckets time into fixed windows", () => {
  assert.equal(rounds.frameOf(0, FRAME), 0);
  assert.equal(rounds.frameOf(FRAME - 1, FRAME), 0);
  assert.equal(rounds.frameOf(FRAME, FRAME), 1);
});

test("frameMsOf prefers the open round's setting over the space default", () => {
  const s = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  s.frameMs = 12000;
  assert.equal(rounds.frameMsOf(s), 12000);
  s.round = { frameMs: 6000 };
  assert.equal(rounds.frameMsOf(s), 6000);
});

test("a payload round-trips through parse", () => {
  const round = { stallId: "d0s0", nonce: "ABC234" };
  const raw = rounds.buildPayload(round, 42);
  assert.equal(raw, "d0s0:ABC234:42");
  assert.deepEqual(rounds.parsePayload(raw), { stallId: "d0s0", nonce: "ABC234", frame: 42 });
});

test("malformed payloads parse to null rather than throwing", () => {
  assert.equal(rounds.parsePayload(""), null);
  assert.equal(rounds.parsePayload(null), null);
  assert.equal(rounds.parsePayload("only:two"), null);
  assert.equal(rounds.parsePayload("a:b:c:d"), null);
  assert.equal(rounds.parsePayload("a:b:notanumber"), null);
});

test("the current frame and the one before it are both fresh", () => {
  assert.equal(rounds.isFrameFresh(10, 10), true);
  assert.equal(rounds.isFrameFresh(9, 10), true);
  assert.equal(rounds.isFrameFresh(8, 10), false, "two frames back is stale");
  assert.equal(rounds.isFrameFresh(11, 10), false, "a future frame is not accepted");
});

test("only the device bound to the stall may open a round", () => {
  const s = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  assert.deepEqual(rounds.canOpenRound(s, "MINE"), { ok: false, reason: "not_authorised" });

  s.stall = "d0s0";
  s.bindings["d0s0"] = { device: "MINE", time: "10:00" };
  assert.deepEqual(rounds.canOpenRound(s, "MINE"), { ok: true, reason: null });
  assert.deepEqual(rounds.canOpenRound(s, "OTHR"), { ok: false, reason: "not_authorised" });
});

test("a closed event refuses new rounds", () => {
  const s = spaceWithOpenRound(T0);
  s.expired = true;
  assert.deepEqual(rounds.canOpenRound(s, "MINE"), { ok: false, reason: "event_closed" });
});

test("openRound increments the round number and starts with no claims", () => {
  const s = spaceWithOpenRound(T0);
  assert.equal(s.round.no, 1);
  assert.deepEqual(s.round.claims, []);
  s.roundNo = 1;
  assert.equal(rounds.openRound(s, T0, () => 0.5).no, 2);
});

test("a live scan earns a stamp", () => {
  const s = spaceWithOpenRound(T0);
  const frame = rounds.frameOf(T0, FRAME);
  const raw = rounds.buildPayload(s.round, frame);

  const v = rounds.evaluateScan(s, raw, T0);
  assert.equal(v.status, "ok");
  assert.equal(v.stallId, "d0s0");
});

test("a scan one frame late still counts — the grace window", () => {
  const s = spaceWithOpenRound(T0);
  const frame = rounds.frameOf(T0, FRAME);
  const raw = rounds.buildPayload(s.round, frame);

  const v = rounds.evaluateScan(s, raw, T0 + FRAME);
  assert.equal(v.status, "ok", "a redraw mid-scan must not reject the visitor");
});

test("a photo taken several frames ago is stale, and reports its age", () => {
  const s = spaceWithOpenRound(T0);
  const frame = rounds.frameOf(T0, FRAME) - 5;
  const raw = rounds.buildPayload(s.round, frame);

  const v = rounds.evaluateScan(s, raw, T0);
  assert.equal(v.status, "stale");
  assert.equal(v.ageSeconds, 40);
  assert.equal(v.graceSeconds, 16);
});

test("a code forwarded in chat long after the fact is stale", () => {
  const s = spaceWithOpenRound(T0);
  const raw = rounds.buildPayload(s.round, rounds.frameOf(T0, FRAME) - 12);
  assert.equal(rounds.evaluateScan(s, raw, T0).status, "stale");
});

test("scanning with no round open is rejected", () => {
  const s = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  assert.equal(rounds.evaluateScan(s, "d0s0:NONCE1:1", T0).status, "no_round");
});

test("a code from a round the stall already closed is rejected", () => {
  const s = spaceWithOpenRound(T0);
  const stale = rounds.buildPayload({ stallId: "d0s0", nonce: "OLDNCE" }, rounds.frameOf(T0, FRAME));
  assert.equal(rounds.evaluateScan(s, stale, T0).status, "no_round");
});

test("one stamp per stall — a second round adds nothing", () => {
  const s = spaceWithOpenRound(T0);
  s.stamps.push({ stallId: "d0s0", revoked: false, hash: "H1" });
  const raw = rounds.buildPayload(s.round, rounds.frameOf(T0, FRAME));
  assert.equal(rounds.evaluateScan(s, raw, T0).status, "dupe");
});

test("a revoked stamp frees the stall to be stamped again", () => {
  const s = spaceWithOpenRound(T0);
  s.stamps.push({ stallId: "d0s0", revoked: true, hash: "H1" });
  const raw = rounds.buildPayload(s.round, rounds.frameOf(T0, FRAME));
  assert.equal(rounds.evaluateScan(s, raw, T0).status, "ok");
});

test("a round stops granting once its seats are gone", () => {
  const s = spaceWithOpenRound(T0);
  s.round.seats = 2;
  s.round.claims = [
    { device: "AAAA", revoked: false },
    { device: "BBBB", revoked: false },
  ];
  const raw = rounds.buildPayload(s.round, rounds.frameOf(T0, FRAME));

  const v = rounds.evaluateScan(s, raw, T0);
  assert.equal(v.status, "seats_full");
  assert.equal(v.seats, 2);
});

test("revoked claims free a seat back up", () => {
  const s = spaceWithOpenRound(T0);
  s.round.seats = 2;
  s.round.claims = [
    { device: "AAAA", revoked: true },
    { device: "BBBB", revoked: false },
  ];
  assert.equal(rounds.grantedSeats(s.round), 1);
  const raw = rounds.buildPayload(s.round, rounds.frameOf(T0, FRAME));
  assert.equal(rounds.evaluateScan(s, raw, T0).status, "ok");
});

test("buildStamp chains each stamp to the one before it", () => {
  const s = spaceWithOpenRound(T0);
  const frame = rounds.frameOf(T0, FRAME);
  const v = rounds.evaluateScan(s, rounds.buildPayload(s.round, frame), T0);

  const first = rounds.buildStamp(s, v, "DEVKEY", T0, "10:00");
  assert.equal(first.stallId, "d0s0");
  assert.equal(first.domainId, "d0");
  assert.equal(first.revoked, false);
  assert.equal(first.hash.length, 8);

  s.stamps.push(first);
  const second = rounds.buildStamp(s, v, "DEVKEY", T0, "10:01");
  assert.notEqual(second.hash, first.hash, "the chain must move when the previous stamp changes");
});

test("the same scan on a different device key yields a different stamp hash", () => {
  const s = spaceWithOpenRound(T0);
  const frame = rounds.frameOf(T0, FRAME);
  const v = rounds.evaluateScan(s, rounds.buildPayload(s.round, frame), T0);

  const mine = rounds.buildStamp(s, v, "DEVKEY-A", T0, "10:00");
  const theirs = rounds.buildStamp(s, v, "DEVKEY-B", T0, "10:00");
  assert.notEqual(mine.hash, theirs.hash);
});
