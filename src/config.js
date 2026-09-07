/**
 * Shared constants. Every magic number and status colour lives here so the
 * template, the component and the tests all read from one source.
 *
 * Modules in src/ use a small UMD shim: in the browser they merge into a
 * single global `SR` namespace (loaded via <script> tags in index.html);
 * under Node they behave as CommonJS modules so tests/ can require them.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SR = Object.assign(root.SR || {}, factory());
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Base32 minus the characters that get misread on a screen: no I, L, O,
  // no 0 or 1. 31 characters, so codes stay legible when read out loud.
  const B32 = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

  const FRAME_MS = 8000; // how often the stall's rotating code redraws
  const CLAIM_TTL = 120000; // a claim QR is worth 2 minutes, then it's dead
  const EVENT_DURATION_MS = 3 * 3600 * 1000; // default lifespan of a new event

  const COLORS = {
    accent: "#ff5a1f", // brand orange: primary actions, progress
    live: "#3ecf8e", // green: something is live/open right now
    dead: "#5f5f6a", // closed, expired, revoked
    danger: "#e0616c",
    warn: "#e0c05a",
    text: "#f2f0ec",
    muted: "#8a8a96",
    faint: "#6d6d78",
  };

  // The starting roster every new event is seeded with. Admins edit it in Setup.
  const SEED = [
    { name: "Build", stalls: ["Platform Core", "Dev Tools", "Release Eng"] },
    { name: "Data", stalls: ["Warehouse", "ML Ops", "Analytics"] },
    { name: "Craft", stalls: ["Design Systems", "Research", "Accessibility"] },
    { name: "Trust", stalls: ["Security", "Privacy", "SRE"] },
  ];

  return { B32, FRAME_MS, CLAIM_TTL, EVENT_DURATION_MS, COLORS, SEED };
});
