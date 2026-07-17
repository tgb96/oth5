(function () {
  "use strict";

  const STORAGE_KEY = "openTennisThemeV1";
  const root = document.documentElement;

  function preferredTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (_) {
      // Se usa la preferencia del sistema si el almacenamiento está bloqueado.
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function updateButton(button, theme) {
    const dark = theme === "dark";
    button.innerHTML = `<span aria-hidden="true">${dark ? "☀️" : "🌙"}</span><span>${dark ? "Modo claro" : "Modo oscuro"}</span>`;
    button.setAttribute("aria-label", dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    button.setAttribute("aria-pressed", String(dark));
  }

  function applyTheme(theme, button) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = theme === "dark" ? "#031912" : "#0b2f25";
    if (button) updateButton(button, theme);
  }

  const initialTheme = preferredTheme();
  applyTheme(initialTheme);

  window.addEventListener("DOMContentLoaded", () => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    updateButton(button, root.dataset.theme || initialTheme);
    button.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (_) {
        // El cambio sigue activo durante la visita.
      }
      applyTheme(next, button);
    });
    document.body.appendChild(button);
  });
})();
