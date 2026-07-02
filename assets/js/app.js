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
})();
