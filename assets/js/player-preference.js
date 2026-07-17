(function (global) {
  "use strict";

  const STORAGE_KEY = "openTennisPreferredPlayerV1";

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function playerEntries() {
    const groups = global.OPEN_TENNIS_CONFIG?.CLUB_PLAYERS || {};
    return Object.entries(groups).flatMap(([category, players]) =>
      (players || []).map((name) => ({ category, name }))
    );
  }

  function canonicalName(value) {
    const wanted = normalize(value);
    if (!wanted) return "";
    return playerEntries().find((entry) => normalize(entry.name) === wanted)?.name || "";
  }

  function read() {
    try {
      const stored = global.localStorage.getItem(STORAGE_KEY);
      const canonical = canonicalName(stored);
      if (!canonical && stored) global.localStorage.removeItem(STORAGE_KEY);
      return canonical;
    } catch (_) {
      return "";
    }
  }

  function notify(name) {
    try {
      global.dispatchEvent(new CustomEvent("open-tennis-player-change", { detail: { name } }));
    } catch (_) {
      // El guardado sigue funcionando aunque el navegador no admita CustomEvent.
    }
  }

  function set(value) {
    const canonical = canonicalName(value);
    if (!canonical) return "";
    try {
      global.localStorage.setItem(STORAGE_KEY, canonical);
    } catch (_) {
      // La selección todavía se usa durante esta visita.
    }
    notify(canonical);
    return canonical;
  }

  function clear() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // No hay nada más que limpiar si el almacenamiento está bloqueado.
    }
    notify("");
  }

  global.OPEN_TENNIS_PLAYER = Object.freeze({
    STORAGE_KEY,
    normalize,
    entries: playerEntries,
    canonicalName,
    get: read,
    set,
    clear,
    is(value) {
      const selected = read();
      return Boolean(selected && normalize(selected) === normalize(value));
    }
  });
})(window);
