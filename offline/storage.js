// localStorage layer — OFFLINE.md §7. One key per event so leaving one
// event can't wipe another. Wipe-on-close is lazy: checked whenever a
// state is loaded, rather than on a timer.

const KEY_PREFIX = "sr:";

export function loadEventState(code) {
  const raw = localStorage.getItem(KEY_PREFIX + code);
  if (!raw) return null;
  const state = JSON.parse(raw);
  if (state.event?.closesAt && Date.now() > new Date(state.event.closesAt).getTime()) {
    localStorage.removeItem(KEY_PREFIX + code);
    return null;
  }
  return state;
}

export function saveEventState(code, state) {
  localStorage.setItem(KEY_PREFIX + code, JSON.stringify(state));
}

export function clearEventState(code) {
  localStorage.removeItem(KEY_PREFIX + code);
}

export function listSavedEvents() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(KEY_PREFIX)) continue;
    const code = k.slice(KEY_PREFIX.length);
    const state = loadEventState(code); // also applies the wipe-on-close check
    if (state) out.push({ code, state });
  }
  return out;
}
