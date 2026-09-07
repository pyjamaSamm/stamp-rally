/**
 * Event "spaces".
 *
 * Every event a device creates or joins is an independent space, keyed by its
 * event code. Creating or joining only ever adds a key — one event's stalls,
 * bindings, stamps and rounds can never overwrite another's. All functions
 * here are pure: they take a space and return new data, never mutating.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../config.js"));
  else root.SR = Object.assign(root.SR || {}, factory(root.SR));
})(typeof globalThis !== "undefined" ? globalThis : this, function (config) {
  /** A fresh copy of the seeded roster. Never share references between spaces. */
  function seedDomains() {
    return config.SEED.map((d, i) => ({
      id: "d" + i,
      name: d.name,
      stalls: d.stalls.map((n, j) => ({ id: "d" + i + "s" + j, name: n })),
    }));
  }

  /** Build a brand new space. `isAdminHere` is true only on the creating device. */
  function makeSpace(id, title, isAdminHere, now) {
    const t = now === undefined ? Date.now() : now;
    return {
      id,
      title,
      isAdminHere,
      createdAt: t,
      domains: seedDomains(),
      nextId: 100,
      required: 6,
      stamps: [],
      log: [],
      stall: null,
      bindings: {},
      issue: null,
      round: null,
      roundNo: 0,
      seats: 8,
      lastRound: null,
      frameMs: config.FRAME_MS,
      endsAt: t + config.EVENT_DURATION_MS,
      expired: false,
      winDismissed: false,
    };
  }

  /** The shape renderVals falls back to when no space is open. */
  function emptySpace() {
    return makeSpace("", "", false, 0);
  }

  function findStall(space, stallId) {
    if (!space) return null;
    for (const d of space.domains) {
      for (const s of d.stalls) if (s.id === stallId) return { d, s };
    }
    return null;
  }

  function countStalls(space) {
    return space.domains.reduce((a, d) => a + d.stalls.length, 0);
  }

  /** Which stall (if any) this device is authorised to run in this space. */
  function boundStallId(space, deviceToken) {
    if (!space) return null;
    for (const stallId in space.bindings) {
      if (space.bindings[stallId].device === deviceToken) return stallId;
    }
    return null;
  }

  /** Rows for the admin's stall roster. */
  function buildRoster(space) {
    const rows = [];
    const issue = space.issue;
    space.domains.forEach((d) =>
      d.stalls.forEach((st) => {
        const b = space.bindings[st.id];
        const pending = !!issue && issue.stallId === st.id;
        rows.push({
          id: st.id,
          name: st.name,
          isFree: !b,
          isBound: !!b,
          border: b ? "#22301e" : "#1e1e26",
          sub: b
            ? d.name.toUpperCase() + " · BOUND TO " + b.device + " AT " + b.time
            : d.name.toUpperCase() + (pending ? " · CLAIM IN PROGRESS" : " · NO DEVICE"),
        });
      })
    );
    return rows;
  }

  function formatRemaining(ms) {
    const left = Math.max(0, ms);
    const h = Math.floor(left / 3600000);
    const m = Math.floor(left / 60000) % 60;
    return h + "h " + String(m).padStart(2, "0") + "m";
  }

  /** One row in the welcome screen's "YOUR EVENTS" list. */
  function summarizeSpace(space, now) {
    return {
      id: space.id,
      title: space.title,
      roleLabel: space.isAdminHere ? "ADMIN" : "JOINED",
      statusLabel: space.expired ? "CLOSED" : formatRemaining(space.endsAt - now) + " left",
      dotColor: space.expired ? config.COLORS.dead : config.COLORS.live,
    };
  }

  /** Newest first, so the event you just made is at the top. */
  function listSpaces(spaces, now) {
    return Object.values(spaces)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => summarizeSpace(s, now));
  }

  /**
   * Mark every space whose closing time has passed as expired. Returns the
   * same object identity when nothing changed, so callers can skip a render.
   */
  function expireDue(spaces, now) {
    let changed = false;
    const next = {};
    for (const id in spaces) {
      const s = spaces[id];
      if (!s.expired && now >= s.endsAt) {
        next[id] = Object.assign({}, s, { expired: true });
        changed = true;
      } else {
        next[id] = s;
      }
    }
    return changed ? next : spaces;
  }

  /** Most recent non-expired event this device administers, or null. */
  function newestAdminCode(spaces) {
    const admin = Object.values(spaces)
      .filter((s) => s.isAdminHere && !s.expired)
      .sort((a, b) => b.createdAt - a.createdAt);
    return admin.length ? admin[0].id : null;
  }

  return {
    seedDomains,
    makeSpace,
    emptySpace,
    findStall,
    countStalls,
    boundStallId,
    buildRoster,
    formatRemaining,
    summarizeSpace,
    listSpaces,
    expireDue,
    newestAdminCode,
  };
});
