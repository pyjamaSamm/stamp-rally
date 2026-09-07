const test = require("node:test");
const assert = require("node:assert/strict");
const qr = require("../src/lib/qr.js");

test("the matrix is 15x15 with an on/off flag per cell", () => {
  const rows = qr.qrMatrix("hello");
  assert.equal(rows.length, qr.QR_SIZE);
  for (const row of rows) {
    assert.equal(row.cells.length, qr.QR_SIZE);
    for (const c of row.cells) {
      assert.equal(typeof c.on, "boolean");
      assert.equal(c.off, !c.on, "off must always be the inverse of on");
    }
  }
});

test("the same code always draws the same grid", () => {
  assert.deepEqual(qr.qrMatrix("d0s0:ABC234:42"), qr.qrMatrix("d0s0:ABC234:42"));
});

test("a different code draws a visibly different grid", () => {
  const a = qr.qrMatrix("frame-1");
  const b = qr.qrMatrix("frame-2");
  const flat = (m) => m.flatMap((r) => r.cells.map((c) => c.on));
  const av = flat(a);
  const bv = flat(b);
  const differing = av.filter((v, i) => v !== bv[i]).length;
  assert.ok(differing > 10, `expected a visible change, only ${differing} cells differ`);
});

test("the three finder eyes are drawn identically in every code", () => {
  const a = qr.qrMatrix("one");
  const b = qr.qrMatrix("two");
  // top-left eye occupies rows/cols 0..4
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      assert.equal(a[y].cells[x].on, b[y].cells[x].on, `eye pixel ${x},${y} should be fixed`);
    }
  }
});

test("the eye centre is filled and its ring is hollow", () => {
  const m = qr.qrMatrix("anything");
  assert.equal(m[2].cells[2].on, true, "centre of the top-left eye");
  assert.equal(m[1].cells[2].on, false, "ring immediately around the centre is off");
  assert.equal(m[0].cells[2].on, true, "outer border of the eye is on");
});
