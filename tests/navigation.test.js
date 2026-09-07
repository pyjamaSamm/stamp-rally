const test = require("node:test");
const assert = require("node:assert/strict");
const nav = require("../src/lib/navigation.js");
const spaces = require("../src/lib/spaces.js");

const T0 = 1_700_000_000_000;
const HOME = { screen: "welcome", activeId: null };
const adminSpace = () => spaces.makeSpace("RLY-AAAA", "Event A", true, T0);
const joinedSpace = () => spaces.makeSpace("RLY-BBBB", "Event B", false, T0);

// Regression: pressing BACK on Create/Join used to land on the role picker,
// which then rendered a phantom "live" event out of empty defaults.
test("back from Join with no event open goes home, not to the role picker", () => {
  assert.deepEqual(nav.exitTarget("join", null, null), HOME);
});

test("back from Create with no event open goes home", () => {
  assert.deepEqual(nav.exitTarget("create", null, null), HOME);
});

test("back with an id but no matching space still goes home", () => {
  assert.deepEqual(nav.exitTarget("collector", "RLY-GONE", undefined), HOME);
});

test("exiting the admin console leaves the event entirely", () => {
  assert.deepEqual(nav.exitTarget("admin", "RLY-AAAA", adminSpace()), HOME);
});

test("exiting the collector card steps up to the role picker, staying in the event", () => {
  const target = nav.exitTarget("collector", "RLY-BBBB", joinedSpace());
  assert.deepEqual(target, { screen: "role" });
  assert.ok(!("activeId" in target), "must not clear the event you are still inside");
});

test("exiting the stall kiosk steps up to the role picker", () => {
  assert.deepEqual(nav.exitTarget("organiser", "RLY-BBBB", joinedSpace()), { screen: "role" });
});

// One device plays every role in this prototype, so owning the event must not
// change where "back" goes — only the screen you are leaving does.
test("role switching works the same in an event you created yourself", () => {
  assert.deepEqual(nav.exitTarget("collector", "RLY-AAAA", adminSpace()), { screen: "role" });
  assert.deepEqual(nav.exitTarget("organiser", "RLY-AAAA", adminSpace()), { screen: "role" });
});

test("every role screen returns to the picker, from either kind of event", () => {
  for (const screen of nav.ROLE_SCREENS) {
    for (const space of [adminSpace(), joinedSpace()]) {
      assert.deepEqual(nav.exitTarget(screen, space.id, space), { screen: "role" });
    }
  }
});

test("exitTarget returns a fresh object each call", () => {
  assert.notEqual(nav.exitTarget("join", null, null), nav.exitTarget("join", null, null));
});

test("screens that need an open event fall back to welcome without one", () => {
  for (const screen of nav.SPACE_SCREENS) {
    assert.equal(nav.resolveScreen(screen, null), "welcome", `${screen} needs an active space`);
  }
});

test("those same screens render normally once an event is open", () => {
  for (const screen of nav.SPACE_SCREENS) {
    assert.equal(nav.resolveScreen(screen, "RLY-AAAA"), screen);
  }
});

test("welcome, create and join never require an open event", () => {
  for (const screen of ["welcome", "create", "join"]) {
    assert.equal(nav.resolveScreen(screen, null), screen);
    assert.equal(nav.resolveScreen(screen, "RLY-AAAA"), screen);
  }
});

test("the role picker is unreachable without an event — no phantom to render", () => {
  assert.equal(nav.resolveScreen("role", null), "welcome");
  assert.notEqual(nav.resolveScreen("role", null), "role");
});

test("every role screen is also a space screen — none can render event-less", () => {
  for (const screen of nav.ROLE_SCREENS) {
    assert.ok(nav.SPACE_SCREENS.indexOf(screen) !== -1, `${screen} must be guarded`);
  }
});
