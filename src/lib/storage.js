/**
 * Persistence.
 *
 * Each event space is stored under its own key so leaving or wiping one can
 * never touch another. Two rules matter:
 *
 *   - Wipe on close. A space whose closing time has passed is deleted on the
 *     next load, not merely hidden. "Deletes itself when the event ends" is
 *     the product promise, so it has to be true on disk.
 *   - Never let storage break the app. Private windows, disabled cookies and
 *     quota limits all throw; every entry point degrades to memory instead.
 *
 * The key prefix carries a version. Bumping it orphans old data rather than
 * migrating it, which is the right trade while the shape is still moving.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SR = Object.assign(root.SR || {}, factory());
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PREFIX = "sr1:";
  const DEVICE_KEY = PREFIX + "device";
  const SPACE_PREFIX = PREFIX + "space:";

  /** A Storage-shaped object backed by a Map. Used for tests and as fallback. */
  function memoryStorage(seed) {
    const map = new Map(seed ? Object.entries(seed) : []);
    return {
      get length() {
        return map.size;
      },
      key: (i) => Array.from(map.keys())[i] ?? null,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => void map.set(k, String(v)),
      removeItem: (k) => void map.delete(k),
      clear: () => map.clear(),
    };
  }

  /** Does this backend actually accept writes? Safari private mode does not. */
  function isUsable(storage) {
    if (!storage) return false;
    try {
      const probe = PREFIX + "probe";
      storage.setItem(probe, "1");
      storage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  /** The real backend when it works, an in-memory stand-in when it doesn't. */
  function safeStorage(candidate) {
    return isUsable(candidate) ? candidate : memoryStorage();
  }

  function loadDeviceKey(storage) {
    try {
      return storage.getItem(DEVICE_KEY) || null;
    } catch (err) {
      return null;
    }
  }

  function saveDeviceKey(storage, key) {
    try {
      storage.setItem(DEVICE_KEY, key);
    } catch (err) {
      /* out of quota or read-only — the app still works, it just forgets */
    }
  }

  /** Every space key currently held, in no particular order. */
  function spaceKeys(storage) {
    const keys = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.indexOf(SPACE_PREFIX) === 0) keys.push(k);
      }
    } catch (err) {
      return [];
    }
    return keys;
  }

  /** Reject anything that isn't recognisably a space, rather than trusting it. */
  function isValidSpace(value) {
    return !!(
      value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      value.id &&
      Array.isArray(value.domains) &&
      Array.isArray(value.stamps) &&
      Array.isArray(value.log) &&
      typeof value.endsAt === "number"
    );
  }

  /** True once the event's closing time has passed — time to delete it. */
  function isWipeable(space, now) {
    return !space || typeof space.endsAt !== "number" || now >= space.endsAt;
  }

  /**
   * Read every stored space, dropping the expired and the unreadable, and
   * deleting both from storage as it goes.
   */
  function loadSpaces(storage, now) {
    const spaces = {};
    for (const key of spaceKeys(storage)) {
      let parsed = null;
      try {
        parsed = JSON.parse(storage.getItem(key));
      } catch (err) {
        parsed = null;
      }
      if (!isValidSpace(parsed) || isWipeable(parsed, now)) {
        try {
          storage.removeItem(key);
        } catch (err) {
          /* nothing sensible to do */
        }
        continue;
      }
      spaces[parsed.id] = parsed;
    }
    return spaces;
  }

  /** Write the given spaces and delete any stored space no longer present. */
  function syncSpaces(storage, spaces) {
    try {
      for (const key of spaceKeys(storage)) {
        const id = key.slice(SPACE_PREFIX.length);
        if (!spaces[id]) storage.removeItem(key);
      }
      for (const id in spaces) {
        storage.setItem(SPACE_PREFIX + id, JSON.stringify(spaces[id]));
      }
    } catch (err) {
      /* quota or read-only: keep running from memory */
    }
  }

  function removeSpace(storage, id) {
    try {
      storage.removeItem(SPACE_PREFIX + id);
    } catch (err) {
      /* nothing sensible to do */
    }
  }

  /** Drop everything this app owns. Leaves other keys on the origin alone. */
  function clearAll(storage) {
    try {
      for (const key of spaceKeys(storage)) storage.removeItem(key);
      storage.removeItem(DEVICE_KEY);
    } catch (err) {
      /* nothing sensible to do */
    }
  }

  return {
    PREFIX,
    DEVICE_KEY,
    SPACE_PREFIX,
    memoryStorage,
    isUsable,
    safeStorage,
    loadDeviceKey,
    saveDeviceKey,
    spaceKeys,
    isValidSpace,
    isWipeable,
    loadSpaces,
    syncSpaces,
    removeSpace,
    clearAll,
  };
});
