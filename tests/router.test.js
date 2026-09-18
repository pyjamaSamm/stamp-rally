const test = require("node:test");
const assert = require("node:assert/strict");
const router = require("../src/lib/router.js");

const CODE = "RLY-8K2M";

test("an empty or root fragment is the welcome screen", () => {
  for (const hash of ["", "#", "#/", "#//"]) {
    assert.deepEqual(router.parseHash(hash), { screen: "welcome", eventId: null, tab: null, oTab: null });
  }
});

test("create and join parse without an event", () => {
  assert.equal(router.parseHash("#/create").screen, "create");
  assert.equal(router.parseHash("#/join").screen, "join");
  assert.equal(router.parseHash("#/join").eventId, null);
});

test("a join link carries the code, ready to prefill", () => {
  const r = router.parseHash("#/join/" + CODE);
  assert.equal(r.screen, "join");
  assert.equal(r.eventId, CODE);
});

test("event codes are normalised to upper case", () => {
  assert.equal(router.parseHash("#/join/rly-8k2m").eventId, CODE);
  assert.equal(router.parseHash("#/e/rly-8k2m").eventId, CODE);
});

test("an event with no view is the role picker", () => {
  assert.deepEqual(router.parseHash("#/e/" + CODE), {
    screen: "role", eventId: CODE, tab: null, oTab: null,
  });
});

test("the admin console parses", () => {
  const r = router.parseHash("#/e/" + CODE + "/admin");
  assert.equal(r.screen, "admin");
  assert.equal(r.eventId, CODE);
});

test("each collector tab parses to the collector screen", () => {
  for (const tab of router.CARD_TABS) {
    const r = router.parseHash("#/e/" + CODE + "/" + tab);
    assert.equal(r.screen, "collector");
    assert.equal(r.tab, tab);
  }
});

test("the stall kiosk defaults to its round tab", () => {
  const r = router.parseHash("#/e/" + CODE + "/stall");
  assert.equal(r.screen, "organiser");
  assert.equal(r.oTab, "round");
});

test("stall sub-tabs parse, and an unknown one falls back to round", () => {
  assert.equal(router.parseHash("#/e/" + CODE + "/stall/log").oTab, "log");
  assert.equal(router.parseHash("#/e/" + CODE + "/stall/setup").oTab, "setup");
  assert.equal(router.parseHash("#/e/" + CODE + "/stall/nonsense").oTab, "round");
});

test("an unknown view on a real event still lands you in that event", () => {
  const r = router.parseHash("#/e/" + CODE + "/wat");
  assert.equal(r.screen, "role");
  assert.equal(r.eventId, CODE);
});

test("garbage resolves to welcome rather than throwing", () => {
  for (const hash of ["#/nonsense", "#/e", "#/../../etc", "#/%%%", null, undefined]) {
    assert.doesNotThrow(() => router.parseHash(hash));
    assert.equal(router.parseHash(hash).screen, "welcome");
  }
});

test("every route round-trips through toHash and back", () => {
  const cases = [
    { screen: "welcome", eventId: null, tab: null, oTab: null },
    { screen: "create", eventId: null, tab: null, oTab: null },
    { screen: "join", eventId: null, tab: null, oTab: null },
    { screen: "role", eventId: CODE, tab: null, oTab: null },
    { screen: "admin", eventId: CODE, tab: null, oTab: null },
    { screen: "collector", eventId: CODE, tab: "card", oTab: null },
    { screen: "collector", eventId: CODE, tab: "scan", oTab: null },
    { screen: "collector", eventId: CODE, tab: "receipts", oTab: null },
    { screen: "organiser", eventId: CODE, tab: null, oTab: "round" },
    { screen: "organiser", eventId: CODE, tab: null, oTab: "log" },
    { screen: "organiser", eventId: CODE, tab: null, oTab: "setup" },
  ];
  for (const c of cases) {
    const hash = router.toHash(c.screen, c.eventId, c.tab, c.oTab);
    assert.deepEqual(router.parseHash(hash), c, "round trip failed for " + hash);
  }
});

test("a screen needing an event falls back home when it has none", () => {
  for (const screen of ["role", "admin", "collector", "organiser"]) {
    assert.equal(router.toHash(screen, null, null, null), router.HOME_HASH);
  }
});

test("the collector defaults to the card tab when the tab is unknown", () => {
  assert.equal(router.toHash("collector", CODE, "bogus", null), "#/e/" + CODE + "/card");
  assert.equal(router.toHash("collector", CODE, null, null), "#/e/" + CODE + "/card");
});

test("hashes are readable — no double slashes or stray encoding", () => {
  assert.equal(router.toHash("collector", CODE, "scan", null), "#/e/RLY-8K2M/scan");
  assert.equal(router.toHash("organiser", CODE, null, "setup"), "#/e/RLY-8K2M/stall/setup");
  assert.equal(router.toHash("role", CODE, null, null), "#/e/RLY-8K2M");
});

// Back should undo a screen change, not force you through every tab you tried.
test("changing screen or event earns a history entry", () => {
  const at = (screen, eventId) => ({ screen, eventId });
  assert.equal(router.isNewHistoryEntry(at("welcome", null), at("join", null)), true);
  assert.equal(router.isNewHistoryEntry(at("role", CODE), at("collector", CODE)), true);
  assert.equal(router.isNewHistoryEntry(at("admin", "RLY-AAAA"), at("admin", "RLY-BBBB")), true);
});

test("flipping a tab within one screen replaces instead", () => {
  const at = (screen, eventId) => ({ screen, eventId });
  assert.equal(router.isNewHistoryEntry(at("collector", CODE), at("collector", CODE)), false);
});

test("the first navigation always earns an entry", () => {
  assert.equal(router.isNewHistoryEntry(null, { screen: "welcome", eventId: null }), true);
});

test("segments strips leading hash and slashes and decodes each part", () => {
  assert.deepEqual(router.segments("#/e/RLY-8K2M/stall/log"), ["e", "RLY-8K2M", "stall", "log"]);
  assert.deepEqual(router.segments("#/join/RLY%2D8K2M"), ["join", "RLY-8K2M"]);
  assert.deepEqual(router.segments(""), []);
});
