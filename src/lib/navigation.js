/**
 * Where the back/exit affordances land, and which screens are even valid.
 *
 * Several screens only make sense with an event open — the role picker, the
 * admin console, the collector card, the stall kiosk all read from the active
 * space. Reaching one without an active space renders a phantom event built
 * out of empty defaults, so both rules below exist to make that unreachable.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SR = Object.assign(root.SR || {}, factory());
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /** Screens that read from the active space and cannot render without one. */
  const SPACE_SCREENS = ["role", "admin", "collector", "organiser"];

  const HOME = { screen: "welcome", activeId: null };

  /** Screens that sit one level below the role picker. */
  const ROLE_SCREENS = ["collector", "organiser"];

  /**
   * Target for "back" / "exit", decided by the screen you are leaving rather
   * than by who owns the event — one device can be admin, stall and visitor
   * in the same event, so ownership says nothing about where back should go.
   *
   * With nothing open (Create, Join), back means home.
   * From the collector card or the stall kiosk, exit steps up to the role
   * picker so you can switch roles without leaving the event.
   * From the admin console, exit leaves the event entirely.
   */
  function exitTarget(screen, activeId, space) {
    if (!activeId || !space) return Object.assign({}, HOME);
    if (ROLE_SCREENS.indexOf(screen) !== -1) return { screen: "role" };
    return Object.assign({}, HOME);
  }

  /**
   * Guard against ever rendering a space screen with no space open. Any such
   * state resolves to the welcome screen rather than a fabricated event.
   */
  function resolveScreen(screen, activeId) {
    if (!activeId && SPACE_SCREENS.indexOf(screen) !== -1) return "welcome";
    return screen;
  }

  return { exitTarget, resolveScreen, SPACE_SCREENS, ROLE_SCREENS };
});
