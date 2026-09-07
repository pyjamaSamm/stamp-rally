const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/config.js");
const spaces = require("../src/lib/spaces.js");

const T0 = 1_700_000_000_000;

test("a new space starts empty and open", () => {
  const s = spaces.makeSpace("RLY-AAAA", "Event A", true, T0);
  assert.equal(s.id, "RLY-AAAA");
  assert.equal(s.title, "Event A");
  assert.equal(s.isAdminHere, true);
  assert.deepEqual(s.stamps, []);
  assert.deepEqual(s.bindings, {});
  assert.equal(s.round, null);
  assert.equal(s.expired, false);
  assert.equal(s.endsAt, T0 + config.EVENT_DURATION_MS);
});

test("each space gets its own roster — editing one cannot touch another", () => {
  const a = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  const b = spaces.makeSpace("RLY-BBBB", "B", true, T0);

  assert.notEqual(a.domains, b.domains, "domains array must not be shared");
  a.domains[0].stalls[0].name = "Renamed In A";
  assert.equal(b.domains[0].stalls[0].name, "Platform Core");
});

test("seedDomains returns a fresh deep copy every call", () => {
  const first = spaces.seedDomains();
  const second = spaces.seedDomains();
  first[0].stalls.push({ id: "x", name: "Injected" });
  assert.equal(second[0].stalls.length, config.SEED[0].stalls.length);
});

test("findStall locates a stall and returns its domain", () => {
  const s = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  const hit = spaces.findStall(s, "d0s0");
  assert.equal(hit.s.name, "Platform Core");
  assert.equal(hit.d.name, "Build");
  assert.equal(spaces.findStall(s, "nope"), null);
  assert.equal(spaces.findStall(null, "d0s0"), null);
});

test("countStalls totals every stall across domains", () => {
  const s = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  const expected = config.SEED.reduce((a, d) => a + d.stalls.length, 0);
  assert.equal(spaces.countStalls(s), expected);
});

test("boundStallId finds only this device's own binding", () => {
  const s = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  s.bindings["d0s0"] = { device: "WXYZ", time: "10:00" };
  s.bindings["d1s0"] = { device: "MINE", time: "10:05" };

  assert.equal(spaces.boundStallId(s, "MINE"), "d1s0");
  assert.equal(spaces.boundStallId(s, "OTHR"), null);
  assert.equal(spaces.boundStallId(null, "MINE"), null);
});

test("buildRoster marks free, bound and mid-claim stalls", () => {
  const s = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  s.bindings["d0s0"] = { device: "WXYZ", time: "10:00" };
  s.issue = { stallId: "d0s1", nonce: "AAAAAA", issuedAt: T0, scannedBy: null, scanTime: null };

  const roster = spaces.buildRoster(s);
  const bound = roster.find((r) => r.id === "d0s0");
  const claiming = roster.find((r) => r.id === "d0s1");
  const free = roster.find((r) => r.id === "d1s0");

  assert.equal(bound.isBound, true);
  assert.equal(bound.isFree, false);
  assert.match(bound.sub, /BOUND TO WXYZ/);

  assert.equal(claiming.isFree, true);
  assert.match(claiming.sub, /CLAIM IN PROGRESS/);

  assert.equal(free.isFree, true);
  assert.match(free.sub, /NO DEVICE/);
});

test("formatRemaining renders hours and zero-padded minutes, never negative", () => {
  assert.equal(spaces.formatRemaining(3 * 3600000 + 5 * 60000), "3h 05m");
  assert.equal(spaces.formatRemaining(0), "0h 00m");
  assert.equal(spaces.formatRemaining(-5000), "0h 00m");
});

test("a live event summarises green, a closed one grey", () => {
  const live = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  const live0 = spaces.summarizeSpace(live, T0);
  assert.equal(live0.dotColor, config.COLORS.live);
  assert.equal(live0.roleLabel, "ADMIN");
  assert.match(live0.statusLabel, /left$/);

  const closed = Object.assign({}, live, { expired: true });
  const closed0 = spaces.summarizeSpace(closed, T0);
  assert.equal(closed0.dotColor, config.COLORS.dead);
  assert.equal(closed0.statusLabel, "CLOSED");
});

test("a joined (non-admin) space is labelled JOINED", () => {
  const joined = spaces.makeSpace("RLY-BBBB", "B", false, T0);
  assert.equal(spaces.summarizeSpace(joined, T0).roleLabel, "JOINED");
});

test("listSpaces returns newest first", () => {
  const store = {
    "RLY-OLD": spaces.makeSpace("RLY-OLD", "Older", true, T0),
    "RLY-NEW": spaces.makeSpace("RLY-NEW", "Newer", true, T0 + 60000),
  };
  const list = spaces.listSpaces(store, T0 + 60000);
  assert.deepEqual(list.map((s) => s.id), ["RLY-NEW", "RLY-OLD"]);
});

test("listSpaces on an empty store is empty — no phantom rows", () => {
  assert.deepEqual(spaces.listSpaces({}, T0), []);
});

test("expireDue closes only the events whose time has passed", () => {
  const store = {
    "RLY-AAAA": spaces.makeSpace("RLY-AAAA", "A", true, T0),
    "RLY-BBBB": spaces.makeSpace("RLY-BBBB", "B", true, T0 + 3600000),
  };
  const after = spaces.expireDue(store, T0 + config.EVENT_DURATION_MS + 1);

  assert.equal(after["RLY-AAAA"].expired, true);
  assert.equal(after["RLY-BBBB"].expired, false, "the later event is still open");
});

test("expireDue returns the same object when nothing changed", () => {
  const store = { "RLY-AAAA": spaces.makeSpace("RLY-AAAA", "A", true, T0) };
  assert.equal(spaces.expireDue(store, T0 + 1000), store);
});

test("expireDue never un-expires an event that was closed early", () => {
  const ended = Object.assign(spaces.makeSpace("RLY-AAAA", "A", true, T0), { expired: true });
  const after = spaces.expireDue({ "RLY-AAAA": ended }, T0 + 1000);
  assert.equal(after["RLY-AAAA"].expired, true);
});

test("newestAdminCode ignores joined and expired events", () => {
  const store = {
    "RLY-JOIN": spaces.makeSpace("RLY-JOIN", "Joined", false, T0 + 90000),
    "RLY-DEAD": Object.assign(spaces.makeSpace("RLY-DEAD", "Dead", true, T0 + 80000), { expired: true }),
    "RLY-MINE": spaces.makeSpace("RLY-MINE", "Mine", true, T0),
  };
  assert.equal(spaces.newestAdminCode(store), "RLY-MINE");
});

test("newestAdminCode is null when this device administers nothing", () => {
  assert.equal(spaces.newestAdminCode({}), null);
  const joinedOnly = { "RLY-JOIN": spaces.makeSpace("RLY-JOIN", "J", false, T0) };
  assert.equal(spaces.newestAdminCode(joinedOnly), null);
});
