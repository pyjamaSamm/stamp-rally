const test = require("node:test");
const assert = require("node:assert/strict");
const storage = require("../src/lib/storage.js");
const spaces = require("../src/lib/spaces.js");
const config = require("../src/config.js");

const T0 = 1_700_000_000_000;
const CLOSES = T0 + config.EVENT_DURATION_MS;
const key = (id) => storage.SPACE_PREFIX + id;

function storeWith(...spaceList) {
  const s = storage.memoryStorage();
  for (const sp of spaceList) s.setItem(key(sp.id), JSON.stringify(sp));
  return s;
}

test("a space survives a round trip through storage", () => {
  const original = spaces.makeSpace("RLY-AAAA", "Event A", true, T0);
  original.stamps.push({ stallId: "d0s0", hash: "H1", revoked: false });
  original.bindings["d0s0"] = { device: "WXYZ", time: "10:00" };

  const s = storeWith(original);
  const loaded = storage.loadSpaces(s, T0 + 1000);

  assert.deepEqual(loaded["RLY-AAAA"], original);
});

test("device key persists and is read back", () => {
  const s = storage.memoryStorage();
  assert.equal(storage.loadDeviceKey(s), null);
  storage.saveDeviceKey(s, "ABCDEFGH2345");
  assert.equal(storage.loadDeviceKey(s), "ABCDEFGH2345");
});

// Wipe-on-close: "deletes itself when the event ends" has to be true on disk,
// not merely hidden in the UI.
test("an event past its closing time is deleted on load, not just hidden", () => {
  const s = storeWith(spaces.makeSpace("RLY-AAAA", "A", true, T0));
  const loaded = storage.loadSpaces(s, CLOSES + 1);

  assert.deepEqual(loaded, {});
  assert.equal(s.getItem(key("RLY-AAAA")), null, "the key itself must be gone");
});

test("an event is kept right up to the moment it closes", () => {
  const s = storeWith(spaces.makeSpace("RLY-AAAA", "A", true, T0));
  assert.ok(storage.loadSpaces(s, CLOSES - 1)["RLY-AAAA"], "still open one ms before");
  assert.deepEqual(storage.loadSpaces(s, CLOSES), {}, "gone at the closing instant");
});

test("wiping one event leaves the others untouched", () => {
  const dead = spaces.makeSpace("RLY-DEAD", "Dead", true, T0);
  const live = spaces.makeSpace("RLY-LIVE", "Live", true, CLOSES);
  const s = storeWith(dead, live);

  const loaded = storage.loadSpaces(s, CLOSES + 1);
  assert.deepEqual(Object.keys(loaded), ["RLY-LIVE"]);
  assert.ok(s.getItem(key("RLY-LIVE")), "the live event's key survives");
});

test("corrupt JSON is discarded rather than crashing the load", () => {
  const s = storeWith(spaces.makeSpace("RLY-GOOD", "Good", true, T0));
  s.setItem(key("RLY-BAD"), "{not json");

  const loaded = storage.loadSpaces(s, T0 + 1000);
  assert.deepEqual(Object.keys(loaded), ["RLY-GOOD"]);
  assert.equal(s.getItem(key("RLY-BAD")), null, "the bad key is cleaned up");
});

test("well-formed JSON that isn't a space is rejected", () => {
  const s = storage.memoryStorage();
  s.setItem(key("RLY-JUNK"), JSON.stringify({ id: "RLY-JUNK", nope: true }));
  assert.deepEqual(storage.loadSpaces(s, T0), {});
});

test("keys belonging to other apps on the origin are ignored", () => {
  const s = storeWith(spaces.makeSpace("RLY-AAAA", "A", true, T0));
  s.setItem("unrelated", "keep me");
  s.setItem("sr0:space:OLD", "previous version");

  storage.loadSpaces(s, T0 + 1000);
  assert.equal(s.getItem("unrelated"), "keep me");
  assert.equal(s.getItem("sr0:space:OLD"), "previous version", "old versions are orphaned, not touched");
});

test("syncSpaces writes what is present and deletes what is gone", () => {
  const a = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  const b = spaces.makeSpace("RLY-BBBB", "B", true, T0);
  const s = storeWith(a, b);

  storage.syncSpaces(s, { "RLY-AAAA": a });

  assert.ok(s.getItem(key("RLY-AAAA")));
  assert.equal(s.getItem(key("RLY-BBBB")), null, "removed spaces are removed from disk");
});

test("syncSpaces persists edits made since the last write", () => {
  const sp = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  const s = storeWith(sp);

  const edited = Object.assign({}, sp, { title: "Renamed" });
  storage.syncSpaces(s, { "RLY-AAAA": edited });

  assert.equal(storage.loadSpaces(s, T0 + 1000)["RLY-AAAA"].title, "Renamed");
});

test("removeSpace deletes exactly one event", () => {
  const a = spaces.makeSpace("RLY-AAAA", "A", true, T0);
  const b = spaces.makeSpace("RLY-BBBB", "B", true, T0);
  const s = storeWith(a, b);

  storage.removeSpace(s, "RLY-AAAA");
  assert.deepEqual(Object.keys(storage.loadSpaces(s, T0 + 1000)), ["RLY-BBBB"]);
});

test("clearAll drops this app's data and nothing else", () => {
  const s = storeWith(spaces.makeSpace("RLY-AAAA", "A", true, T0));
  storage.saveDeviceKey(s, "DEVICE1234AB");
  s.setItem("unrelated", "keep me");

  storage.clearAll(s);

  assert.deepEqual(storage.loadSpaces(s, T0), {});
  assert.equal(storage.loadDeviceKey(s), null);
  assert.equal(s.getItem("unrelated"), "keep me");
});

// A private window throws on write. The app must keep working, just forgetfully.
test("a throwing backend is detected and swapped for memory", () => {
  const hostile = {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  };

  assert.equal(storage.isUsable(hostile), false);
  const safe = storage.safeStorage(hostile);
  assert.notEqual(safe, hostile);

  storage.saveDeviceKey(safe, "FALLBACK1234");
  assert.equal(storage.loadDeviceKey(safe), "FALLBACK1234");
});

test("a usable backend is passed through unchanged", () => {
  const real = storage.memoryStorage();
  assert.equal(storage.isUsable(real), true);
  assert.equal(storage.safeStorage(real), real);
});

test("a missing backend degrades to memory instead of throwing", () => {
  assert.equal(storage.isUsable(null), false);
  const safe = storage.safeStorage(null);
  storage.saveDeviceKey(safe, "NOSTORAGE123");
  assert.equal(storage.loadDeviceKey(safe), "NOSTORAGE123");
});

test("writes that throw mid-sync do not propagate to the caller", () => {
  const flaky = storage.memoryStorage();
  flaky.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  assert.doesNotThrow(() => storage.syncSpaces(flaky, { "RLY-AAAA": spaces.makeSpace("RLY-AAAA", "A", true, T0) }));
});
