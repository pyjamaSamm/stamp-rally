/**
 * Hash routing.
 *
 * Hash rather than path because this ships to GitHub Pages as a project site:
 * the fragment is never sent to the server, so `#/e/RLY-8K2M/admin` needs no
 * rewrite rules and no base-path handling, and it still works from file://.
 * The pitch deck's own runtime (deck-stage.js) routes the same way.
 *
 * Both functions are pure. The component owns the History API; this module
 * only converts between a URL fragment and the three pieces of navigation
 * state: which screen, which event, which tab.
 *
 *   #/                      welcome
 *   #/create                name a new event
 *   #/join                  enter a code
 *   #/join/RLY-8K2M         enter a code, prefilled
 *   #/e/RLY-8K2M            role picker
 *   #/e/RLY-8K2M/card       collector, card tab   (also /scan, /receipts)
 *   #/e/RLY-8K2M/stall      stall kiosk           (also /stall/log, /stall/setup)
 *   #/e/RLY-8K2M/admin      organiser console
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SR = Object.assign(root.SR || {}, factory());
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const HOME_HASH = "#/";
  const CARD_TABS = ["card", "scan", "receipts"];
  const STALL_TABS = ["round", "log", "setup"];

  function normaliseCode(raw) {
    return String(raw || "").trim().toUpperCase();
  }

  /**
   * decodeURIComponent throws on malformed input ("%%%"), which anyone can
   * type into the address bar. A bad escape is not worth crashing over —
   * fall back to the raw segment and let the route matcher reject it.
   */
  function safeDecode(part) {
    try {
      return decodeURIComponent(part);
    } catch (err) {
      return part;
    }
  }

  /** Split "#/e/RLY-8K2M/card" into ["e", "RLY-8K2M", "card"]. */
  function segments(hash) {
    return String(hash || "")
      .replace(/^#/, "")
      .replace(/^\/+/, "")
      .split("/")
      .map((s) => safeDecode(s.trim()))
      .filter(Boolean);
  }

  /**
   * Turn a fragment into navigation state. Anything unrecognised resolves to
   * the welcome screen rather than throwing or rendering a blank page.
   */
  function parseHash(hash) {
    const parts = segments(hash);
    if (!parts.length) return { screen: "welcome", eventId: null, tab: null, oTab: null };

    const head = parts[0].toLowerCase();

    if (head === "create") return { screen: "create", eventId: null, tab: null, oTab: null };

    if (head === "join") {
      return { screen: "join", eventId: parts[1] ? normaliseCode(parts[1]) : null, tab: null, oTab: null };
    }

    if (head === "e" && parts[1]) {
      const eventId = normaliseCode(parts[1]);
      const view = (parts[2] || "").toLowerCase();

      if (!view) return { screen: "role", eventId, tab: null, oTab: null };
      if (view === "admin") return { screen: "admin", eventId, tab: null, oTab: null };
      if (CARD_TABS.indexOf(view) !== -1) return { screen: "collector", eventId, tab: view, oTab: null };
      if (view === "stall") {
        const sub = (parts[3] || "round").toLowerCase();
        return {
          screen: "organiser",
          eventId,
          tab: null,
          oTab: STALL_TABS.indexOf(sub) !== -1 ? sub : "round",
        };
      }
      // An event route we don't recognise still names a real event.
      return { screen: "role", eventId, tab: null, oTab: null };
    }

    return { screen: "welcome", eventId: null, tab: null, oTab: null };
  }

  /** Turn navigation state back into a fragment. Inverse of parseHash. */
  function toHash(screen, eventId, tab, oTab) {
    if (screen === "create") return "#/create";
    if (screen === "join") return "#/join";

    if (!eventId) return HOME_HASH;
    const base = "#/e/" + encodeURIComponent(eventId);

    if (screen === "role") return base;
    if (screen === "admin") return base + "/admin";
    if (screen === "collector") return base + "/" + (CARD_TABS.indexOf(tab) !== -1 ? tab : "card");
    if (screen === "organiser") {
      const sub = STALL_TABS.indexOf(oTab) !== -1 ? oTab : "round";
      return sub === "round" ? base + "/stall" : base + "/stall/" + sub;
    }
    return HOME_HASH;
  }

  /**
   * Does moving between these two routes warrant a history entry? Changing
   * screen or event does — pressing back should undo it. Flipping a tab
   * within one screen replaces instead, so back doesn't strand you on a
   * dozen tab switches before it leaves the screen.
   */
  function isNewHistoryEntry(prev, next) {
    if (!prev) return true;
    return prev.screen !== next.screen || prev.eventId !== next.eventId;
  }

  return { HOME_HASH, CARD_TABS, STALL_TABS, segments, parseHash, toHash, isNewHistoryEntry, normaliseCode };
});
