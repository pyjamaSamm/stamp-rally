const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/config.js");
const tokens = require("../src/lib/tokens.js");

test("fnv is deterministic and returns an unsigned 32-bit int", () => {
  assert.equal(tokens.fnv("hello"), tokens.fnv("hello"));
  const v = tokens.fnv("stamp rally");
  assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffffff);
});

test("fnv separates inputs that differ by one character", () => {
  assert.notEqual(tokens.fnv("stall-a"), tokens.fnv("stall-b"));
});

test("tok returns exactly the requested length, from the base32 alphabet", () => {
  for (const len of [1, 3, 4, 6, 8, 12]) {
    const out = tokens.tok("seed", len);
    assert.equal(out.length, len);
    for (const ch of out) assert.ok(config.B32.includes(ch), `${ch} not in alphabet`);
  }
});

test("tok is stable for the same seed and differs across seeds", () => {
  assert.equal(tokens.tok("abc", 8), tokens.tok("abc", 8));
  assert.notEqual(tokens.tok("abc", 8), tokens.tok("abd", 8));
});

test("the alphabet excludes characters that get misread as one another", () => {
  // I/L/1 and O/0 are the pairs that actually get confused on a screen.
  for (const ch of ["I", "L", "O", "0", "1"]) {
    assert.ok(!config.B32.includes(ch), `${ch} should not be in the spoken alphabet`);
  }
  assert.equal(config.B32.length, 31);
});

test("randomToken honours an injected rng", () => {
  const alwaysFirst = () => 0;
  assert.equal(tokens.randomToken(5, alwaysFirst), config.B32[0].repeat(5));
});

test("stallDeviceToken is 4 chars and differs from the raw device key", () => {
  const key = "ABCDEFGH2345";
  const t = tokens.stallDeviceToken(key);
  assert.equal(t.length, 4);
  assert.notEqual(t, tokens.deviceShort(key));
});

test("deviceShort takes the leading 4 characters", () => {
  assert.equal(tokens.deviceShort("ABCDEFGH2345"), "ABCD");
});

test("eventCode is prefixed and 8 characters long", () => {
  const code = tokens.eventCode("Q3 Offsite", () => 0.42);
  assert.match(code, /^RLY-[2-9A-Z]{4}$/);
  assert.equal(code.length, 8);
});

test("eventCode varies with the rng even for the same name", () => {
  const a = tokens.eventCode("Same Name", () => 0.1);
  const b = tokens.eventCode("Same Name", () => 0.9);
  assert.notEqual(a, b);
});
