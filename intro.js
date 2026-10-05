/* Layar pembuka (start) dan menu titik tiga berisi langkah penggunaan. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const welcome = $('welcome'), start = $('welcome-start'), guideBtn = $('welcome-guide');
  const dots = $('menu-dots'), panel = $('usage-panel'), close = $('usage-close');
  if (!welcome || !dots || !panel) return;

  const lockScroll = on => { document.documentElement.style.overflow = on ? 'hidden' : ''; };

  function openPanel() {
    panel.hidden = false;
    dots.setAttribute('aria-expanded', 'true');
    panel.querySelector('.usage-body').scrollTop = 0;
    close.focus({ preventScroll: true });
  }
  function closePanel(returnFocus = true) {
    if (panel.hidden) return;
    panel.hidden = true;
    dots.setAttribute('aria-expanded', 'false');
    if (returnFocus) dots.focus({ preventScroll: true });
  }
  function enter(thenGuide) {
    welcome.classList.add('is-leaving');
    lockScroll(false);
    setTimeout(() => { welcome.hidden = true; }, 380);
    if (thenGuide) setTimeout(openPanel, 200);
  }

  lockScroll(true);
  start.focus({ preventScroll: true });
  start.addEventListener('click', () => enter(false));
  guideBtn.addEventListener('click', () => enter(true));

  dots.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  close.addEventListener('click', () => closePanel());
  document.addEventListener('click', e => {
    if (!panel.hidden && !panel.contains(e.target) && !dots.contains(e.target)) closePanel(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePanel();
  });
})();
