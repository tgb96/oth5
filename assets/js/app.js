(() => {
  'use strict';

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  document.documentElement.classList.toggle('is-standalone', isStandalone());

  const getNoticeStack = () => {
    let stack = document.getElementById('appNoticeStack');

    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'appNoticeStack';
      stack.className = 'app-notice-stack';
      document.body.appendChild(stack);
    }

    return stack;
  };

  const showUpdateNotice = registration => {
    if (!registration?.waiting || document.getElementById('appUpdateBanner')) {
      return;
    }

    const banner = document.createElement('section');
    banner.id = 'appUpdateBanner';
    banner.className = 'app-update-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    const message = document.createElement('p');
    message.className = 'app-update-copy';
    message.textContent = 'Hay una nueva versión disponible.';

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'app-update-action';
    action.textContent = 'Actualizar ahora';
    action.addEventListener('click', () => {
      action.disabled = true;
      action.textContent = 'Actualizando…';
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });

    banner.append(message, action);
    getNoticeStack().appendChild(banner);
  };

  const setupServiceWorker = () => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    let isRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (isRefreshing) return;
      isRefreshing = true;
      window.location.reload();
    });

    window.addEventListener('load', async () => {
      const version = window.OPEN_TENNIS_CONFIG?.APP_VERSION || '27';

      try {
        const registration = await navigator.serviceWorker.register(`./sw.js?v=${version}`);
        showUpdateNotice(registration);

        const watchInstallingWorker = worker => {
          if (!worker) return;

          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setTimeout(() => showUpdateNotice(registration), 0);
            }
          });
        };

        watchInstallingWorker(registration.installing);
        registration.addEventListener('updatefound', () => {
          watchInstallingWorker(registration.installing);
        });
      } catch (_error) {
        // La aplicación sigue funcionando aunque el navegador no permita PWA.
      }
    });
  };

  const setupConnectionNotice = () => {
    let wasOffline = navigator.onLine === false;
    let hideTimer = null;

    const show = (message, state, autoHide = false) => {
      let notice = document.getElementById('connectionStatus');

      if (!notice) {
        notice = document.createElement('p');
        notice.id = 'connectionStatus';
        notice.className = 'connection-status';
        notice.setAttribute('role', 'status');
        notice.setAttribute('aria-live', 'polite');
        getNoticeStack().appendChild(notice);
      }

      if (hideTimer) clearTimeout(hideTimer);
      notice.textContent = message;
      notice.dataset.state = state;
      notice.hidden = false;

      if (autoHide) {
        hideTimer = setTimeout(() => {
          notice.hidden = true;
        }, 3500);
      }
    };

    if (wasOffline) {
      show('Sin conexión: usando datos guardados.', 'offline');
    }

    window.addEventListener('offline', () => {
      wasOffline = true;
      show('Sin conexión: usando datos guardados.', 'offline');
    });

    window.addEventListener('online', () => {
      if (!wasOffline) return;
      wasOffline = false;
      show('Conexión recuperada.', 'online', true);
    });
  };

  setupServiceWorker();
  setupConnectionNotice();

  const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const activeNavigationPage = current === 'resultados-2025.html' ? 'tablas.html' : current;

  document.querySelectorAll('#appBottomNav a, .app-bottom-nav a, .app-nav a, .nav a').forEach(link => {
    const href = (link.getAttribute('href') || '').split('/').pop().toLowerCase() || 'index.html';

    if (href === activeNavigationPage) {
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
