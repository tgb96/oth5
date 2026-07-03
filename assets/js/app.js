(() => {
  'use strict';

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  document.documentElement.classList.toggle('is-standalone', isStandalone());

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js?v=5').catch(() => {});
    });
  }

  const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  document.querySelectorAll('#appBottomNav a, .app-bottom-nav a, .app-nav a, .nav a').forEach(link => {
    const href = (link.getAttribute('href') || '').split('/').pop().toLowerCase() || 'index.html';

    if (href === current) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });

  /**
   * Control del gesto/botón "atrás" en celular/PWA.
   *
   * Objetivo:
   * - Primer gesto atrás: no retrocede de página, muestra aviso.
   * - Segundo gesto atrás dentro de unos segundos: intenta salir/cerrar la app.
   *
   * Nota:
   * Los navegadores no siempre permiten cerrar una PWA con JavaScript.
   * Por eso se intenta window.close() y luego se libera el historial hacia atrás.
   */
  const setupDoubleBackToExit = () => {
    const isTouchDevice =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0;

    const shouldEnableBackControl = isStandalone() || isTouchDevice;

    if (!shouldEnableBackControl || !window.history || !window.history.pushState) {
      return;
    }

    const EXIT_DELAY = 2200;
    let lastBackPress = 0;
    let resetTimer = null;
    let isExiting = false;

    const showExitToast = () => {
      let toast = document.getElementById('appExitToast');

      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appExitToast';
        toast.textContent = 'Desliza atrás otra vez para salir';

        Object.assign(toast.style, {
          position: 'fixed',
          left: '50%',
          bottom: 'calc(86px + env(safe-area-inset-bottom, 0px))',
          transform: 'translateX(-50%)',
          zIndex: '99999',
          padding: '10px 14px',
          borderRadius: '999px',
          background: 'rgba(15, 23, 42, 0.92)',
          color: '#ffffff',
          fontSize: '14px',
          fontWeight: '600',
          lineHeight: '1.2',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.28)',
          opacity: '0',
          pointerEvents: 'none',
          transition: 'opacity 180ms ease, transform 180ms ease',
          whiteSpace: 'nowrap'
        });

        document.body.appendChild(toast);
      }

      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(-4px)';
      });
    };

    const hideExitToast = () => {
      const toast = document.getElementById('appExitToast');

      if (!toast) {
        return;
      }

      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    };

    const resetBackPress = () => {
      lastBackPress = 0;
      hideExitToast();

      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
    };

    const exitApp = () => {
      isExiting = true;
      resetBackPress();

      window.removeEventListener('popstate', handleBackGesture);

      try {
        window.close();
      } catch (error) {
        // Algunos navegadores bloquean window.close().
      }

      setTimeout(() => {
        try {
          if (window.history.length > 1) {
            window.history.go(-window.history.length);
          } else {
            window.history.back();
          }
        } catch (error) {
          window.history.back();
        }
      }, 80);
    };

    function handleBackGesture(event) {
      if (isExiting) {
        return;
      }

      const now = Date.now();
      const isSecondBack = now - lastBackPress <= EXIT_DELAY;

      if (isSecondBack) {
        exitApp();
        return;
      }

      lastBackPress = now;
      showExitToast();

      window.history.pushState(
        {
          openTennisBackGuard: true
        },
        '',
        window.location.href
      );

      if (resetTimer) {
        clearTimeout(resetTimer);
      }

      resetTimer = setTimeout(resetBackPress, EXIT_DELAY);
    }

    window.history.replaceState(
      {
        openTennisPage: true
      },
      '',
      window.location.href
    );

    window.history.pushState(
      {
        openTennisBackGuard: true
      },
      '',
      window.location.href
    );

    window.addEventListener('popstate', handleBackGesture);
  };

  setupDoubleBackToExit();
})();
