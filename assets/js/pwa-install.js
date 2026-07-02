(() => {
  'use strict';

  let deferredPrompt = null;

  const actionBtn = document.getElementById('installActionBtn');
  const helpText = document.getElementById('installHelpText');
  const promptCard = document.getElementById('installPromptCard');

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const isIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const isAndroid = () => /android/i.test(window.navigator.userAgent);

  function setInstalledState() {
    if (!promptCard || !isStandalone()) return;
    promptCard.hidden = true;
  }

  function setDefaultCopy() {
    if (!helpText) return;

    if (isStandalone()) {
      helpText.textContent = 'La app ya está instalada en este dispositivo.';
      return;
    }

    if (deferredPrompt) {
      helpText.textContent = 'Android: toca Instalar para agregarla a la pantalla de inicio.';
      if (actionBtn) {
        actionBtn.hidden = false;
        actionBtn.textContent = 'Instalar';
      }
      return;
    }

    if (isIOS()) {
      helpText.textContent = 'iPhone: toca Compartir en Safari y luego Agregar a pantalla de inicio.';
      if (actionBtn) {
        actionBtn.hidden = true;
      }
      return;
    }

    if (isAndroid()) {
      helpText.textContent = 'Android: abre el menú de Chrome y elige Instalar app o Agregar a pantalla principal.';
      if (actionBtn) {
        actionBtn.hidden = true;
      }
      return;
    }

    helpText.textContent = 'Desde el celular puedes agregar esta web al inicio para abrirla como app.';
    if (actionBtn) actionBtn.hidden = true;
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    if (promptCard && !isStandalone()) promptCard.hidden = false;
    setDefaultCopy();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (promptCard) promptCard.hidden = true;
  });

  if (actionBtn) {
    actionBtn.addEventListener('click', async () => {
      if (!deferredPrompt) {
        setDefaultCopy();
        return;
      }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      setDefaultCopy();
    });
  }

  window.addEventListener('load', () => {
    setInstalledState();
    setDefaultCopy();
  });
})();
