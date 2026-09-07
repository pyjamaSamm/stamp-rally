# Stamp Rally

A digital event stamp card. Visitors collect one stamp per stall by scanning
the stall's rotating code; at a threshold the card unlocks a prize. No install,
no account, nothing stored on a server.

```
npm start     # serve on http://localhost:3000
npm test      # run the unit tests
```

Open `http://localhost:3000` — `index.html` is the app.

## Layout

```
index.html          the app: markup template + the view component
src/
  config.js         constants — timings, colours, the seeded roster
  lib/
    tokens.js       token/code derivation (see the warning below)
    qr.js           the decorative QR grid
    spaces.js       event "spaces" — the core data model
    claims.js       the stall-authorisation handshake rules
    rounds.js       stamp rounds and what a scanned code has to survive
tests/              unit tests for everything in src/lib
support.js          Design Canvas runtime (vendored, do not edit)
```

`index.html` holds the template and a thin component. Every **rule** lives in
`src/lib` as a pure function and is unit-tested; the component only holds
state, calls into those functions, and maps their verdicts to screen copy.

The modules use a small UMD shim: in the browser they merge into one global
`SR` namespace via the `<script>` tags in `index.html`; under Node they are
CommonJS so `tests/` can require them. No build step, no bundler.

## Event spaces

Every event a device creates or joins is an independent space, keyed by its
event code, held in `state.spaces`. `state.activeId` points at whichever one is
open. Creating or joining only ever *adds* a key — one event's stalls,
bindings, stamps and rounds can never overwrite another's, and the welcome
screen lists them all so you can switch between them.

## What is real and what is a prototype

The authorisation *flow* is real and worth reviewing. The cryptography is not:

- **`tokens.fnv` is a 32-bit non-cryptographic hash**, standing in for a
  signature so the handshake can be demoed on one device. It is trivially
  forgeable. A production build replaces every use with HMAC-SHA256 or Ed25519.
- **The QR is drawn, not encoded** (`src/lib/qr.js`) — it cannot be scanned.
  Swap in a real encoder that keeps the same `{rows: [{cells: [{on, off}]}]}`
  shape.
- **There is no camera.** The scan buttons call the same code path a camera
  would, so the rules are exercised, but nothing is read off a screen.
- **Frame freshness trusts the device clock**, which an attacker controls.
- **Nothing persists.** State is in memory; a refresh clears every event.
- **One device plays every role**, so you can walk the whole handshake solo.

## Testing

`npm test` runs Node's built-in test runner over `tests/*.test.js` — no
dependencies. The suites cover token derivation, the QR grid, the space model
(including the isolation guarantee above), the claim handshake's TTL and
single-use rules, and the scan verdicts (grace window, duplicates, seat
limits).

Browser behaviour is not covered by `npm test`; changes to `index.html` still
want a manual pass through create → bind a stall → open a round → scan.
