(function createOpenTennisDataClient(global) {
  "use strict";

  const config = global.OPEN_TENNIS_CONFIG || {};
  const storagePrefix = "openTennisDataV1:";

  function readSaved(key) {
    try {
      const raw = global.localStorage.getItem(storagePrefix + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.text === "string" ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function save(key, text, updatedAt) {
    try {
      global.localStorage.setItem(
        storagePrefix + key,
        JSON.stringify({ text, updatedAt })
      );
    } catch (_error) {
      // El sitio sigue funcionando aunque el navegador bloquee localStorage.
    }
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
    return response.text();
  }

  async function loadText(key, options) {
    const settings = options || {};
    const saved = readSaved(key);

    try {
      const text = await fetchText(settings.url);
      const updatedAt = Date.now();
      save(key, text, updatedAt);
      return { text, source: "network", updatedAt };
    } catch (networkError) {
      if (saved) {
        return {
          text: saved.text,
          source: "saved",
          updatedAt: Number(saved.updatedAt) || null,
          error: networkError
        };
      }

      if (settings.fallbackUrl) {
        try {
          const text = await fetchText(settings.fallbackUrl);
          return {
            text,
            source: "bundled",
            updatedAt: null,
            error: networkError
          };
        } catch (_fallbackError) {
          // Se informa el error de red original, que es el más útil.
        }
      }

      throw networkError;
    }
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return "una copia incluida en la aplicación";

    return new Intl.DateTimeFormat("es-CL", {
      timeZone: config.TIME_ZONE || "America/Santiago",
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(timestamp)).replace(/\.$/, "");
  }

  function describe(results) {
    const list = (Array.isArray(results) ? results : [results]).filter(Boolean);
    if (!list.length) return "";

    if (list.some(result => result.source === "bundled")) {
      return "Sin conexión: mostrando el respaldo incluido en la aplicación.";
    }

    if (list.some(result => result.source === "saved")) {
      const timestamps = list
        .map(result => Number(result.updatedAt) || 0)
        .filter(Boolean);
      const oldest = timestamps.length ? Math.min(...timestamps) : null;
      return `Sin conexión: mostrando datos guardados del ${formatDateTime(oldest)}`;
    }

    const newest = Math.max(...list.map(result => Number(result.updatedAt) || 0));
    return `Datos actualizados: ${formatDateTime(newest)}`;
  }

  function addRefreshControl(element, retry, label) {
    if (typeof retry !== "function") return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "data-retry";
    button.textContent = label;
    button.addEventListener("click", retry, { once: true });
    element.appendChild(button);
  }

  function updateStatus(element, results, retry) {
    if (!element) return;
    element.replaceChildren();

    const text = document.createElement("span");
    text.textContent = describe(results);
    element.appendChild(text);
    addRefreshControl(element, retry, "Actualizar");
  }

  function showError(element, message, retry) {
    if (!element) return;
    element.replaceChildren();

    const text = document.createElement("span");
    text.textContent = message;
    element.appendChild(text);
    addRefreshControl(element, retry, "Actualizar");
  }

  global.OPEN_TENNIS_DATA = Object.freeze({
    loadText,
    updateStatus,
    showError,
    formatDateTime
  });
})(window);
