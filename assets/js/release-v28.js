(() => {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  function noticeStack() {
    let stack = document.getElementById("appNoticeStack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "appNoticeStack";
      stack.className = "app-notice-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  function showUpdate(registration) {
    if (!registration?.waiting || document.getElementById("appUpdateBanner")) return;
    const banner = document.createElement("section");
    banner.id = "appUpdateBanner";
    banner.className = "app-update-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");

    const message = document.createElement("p");
    message.className = "app-update-copy";
    message.textContent = "Hay una nueva versión disponible.";

    const action = document.createElement("button");
    action.type = "button";
    action.className = "app-update-action";
    action.textContent = "Actualizar ahora";
    action.addEventListener("click", () => {
      action.disabled = true;
      action.textContent = "Actualizando…";
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    });

    banner.append(message, action);
    noticeStack().appendChild(banner);
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js?v=28");
      showUpdate(registration);
      const watch = (worker) => worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(registration);
      });
      watch(registration.installing);
      registration.addEventListener("updatefound", () => watch(registration.installing));
    } catch (_) {
      // La web sigue disponible aunque el navegador no permita actualizaciones en segundo plano.
    }
  });
})();
