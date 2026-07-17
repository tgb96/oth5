(() => {
  "use strict";

  const VISIT_KEY = "openTennisHomeVisitsV1";
  let deferredPrompt = null;

  const actionButton = document.getElementById("installActionBtn");
  const helpText = document.getElementById("installHelpText");
  const title = document.getElementById("installCardTitle");
  const promptCard = document.getElementById("installPromptCard");

  if (!promptCard) return;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith("android-app://");

  const isIOS = () => {
    const userAgent = window.navigator.userAgent || "";
    return /iphone|ipad|ipod/i.test(userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  };
  const isAndroid = () => /android/i.test(window.navigator.userAgent || "");

  function visitCount() {
    try {
      const next = Math.min(Number(window.localStorage.getItem(VISIT_KEY) || 0) + 1, 99);
      window.localStorage.setItem(VISIT_KEY, String(next));
      return next;
    } catch (_) {
      return 1;
    }
  }

  const currentVisit = visitCount();

  function hideCard() {
    promptCard.hidden = true;
    if (actionButton) actionButton.hidden = true;
  }

  function showInstallPrompt() {
    if (isStandalone()) {
      hideCard();
      return;
    }
    promptCard.hidden = false;
    if (title) title.textContent = "Instalar Open Tennis";
    if (helpText) helpText.textContent = "Agrégala a tu pantalla de inicio para abrir tu torneo más rápido.";
    if (actionButton) {
      actionButton.hidden = false;
      actionButton.textContent = "Instalar";
    }
  }

  function showManualHelp() {
    if (isStandalone() || currentVisit < 2) {
      hideCard();
      return;
    }
    if (!isIOS() && !isAndroid()) {
      hideCard();
      return;
    }

    promptCard.hidden = false;
    if (actionButton) actionButton.hidden = true;
    if (isIOS()) {
      if (title) title.textContent = "Agregar al inicio";
      if (helpText) helpText.textContent = "En Safari, toca Compartir y luego Agregar a pantalla de inicio.";
    } else {
      if (title) title.textContent = "Agregar al inicio";
      if (helpText) helpText.textContent = "En Chrome, abre el menú y elige Instalar app o Agregar a pantalla principal.";
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallPrompt();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideCard();
  });

  actionButton?.addEventListener("click", async () => {
    if (!deferredPrompt) {
      showManualHelp();
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    hideCard();
  });

  window.addEventListener("load", () => {
    if (deferredPrompt) showInstallPrompt();
    else showManualHelp();
  });
})();
