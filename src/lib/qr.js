/**
 * Decorative QR renderer.
 *
 * This draws a 15x15 grid that *looks* like a QR code — finder eyes in three
 * corners, deterministic noise elsewhere. It does not encode anything and
 * cannot be scanned. Swapping in a real encoder (e.g. the `qrcode` package)
 * only needs to keep the same {rows: [{cells: [{on, off}]}]} shape.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./tokens.js"));
  else root.SR = Object.assign(root.SR || {}, factory(root.SR));
})(typeof globalThis !== "undefined" ? globalThis : this, function (tokens) {
  const SIZE = 15;

  function isEye(x, y) {
    return (x < 5 && y < 5) || (x > 9 && y < 5) || (x < 5 && y > 9);
  }

  function isQuietZone(x, y) {
    return (
      (x === 5 && y < 6) ||
      (y === 5 && x < 6) ||
      (x === 9 && y < 6) ||
      (y === 5 && x > 8) ||
      (x === 5 && y > 8) ||
      (y === 9 && x < 6)
    );
  }

  /** Build the grid for `code`. Same code always yields the same grid. */
  function qrMatrix(code) {
    const rows = [];
    for (let y = 0; y < SIZE; y++) {
      const cells = [];
      for (let x = 0; x < SIZE; x++) {
        let on;
        if (isEye(x, y)) {
          const cx = x < 5 ? 2 : 12;
          const cy = y < 5 ? 2 : 12;
          const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
          on = d === 0 || d === 2;
        } else if (isQuietZone(x, y)) {
          on = false;
        } else {
          on = tokens.fnv(code + ":" + x + ":" + y) % 100 < 47;
        }
        cells.push({ on, off: !on });
      }
      rows.push({ cells });
    }
    return rows;
  }

  return { qrMatrix, QR_SIZE: SIZE };
});
