/* RealIRacing — homepage behaviour (media tabs, poll, smooth scroll).
   Extracted from an inline <script> in index.html on 2026-08-18 so the site can
   enforce a Content-Security-Policy without 'unsafe-inline' in script-src. The
   onclick="" attributes that used to drive these are now addEventListener
   bindings for the same reason — inline handlers are inline script as far as
   CSP is concerned, so leaving even one would have forced the policy open. */
(function () {
  'use strict';

  /* ── TAB SWITCHER ── */
  // Reads the target panel from data-tab. The old version called switchTab('x')
  // from an onclick and then used the non-standard global `event` to find which
  // tab to highlight; currentTarget is the element the listener is bound to, so
  // it is correct even when the click lands on a child node.
  document.querySelectorAll('.media-tab').forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      var name = tab.getAttribute('data-tab');
      var panel = document.querySelector('#panel-' + name);
      if (!panel) return;
      document.querySelectorAll('.media-tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.media-tab').forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.media-panel').forEach(function (p) { p.classList.remove('active'); });
      panel.classList.add('active');
      e.currentTarget.classList.add('active');
      e.currentTarget.setAttribute('aria-selected', 'true');
      // Roving tabindex: only the selected tab is in the Tab order; arrows move between tabs.
      document.querySelectorAll('.media-tab').forEach(function (t) { t.tabIndex = t === e.currentTarget ? 0 : -1; });
    });
    tab.addEventListener('keydown', function (e) {
      var tabs = Array.prototype.slice.call(document.querySelectorAll('.media-tab'));
      var i = tabs.indexOf(tab), n = null;
      if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') n = tabs[(i + tabs.length - 1) % tabs.length];
      else if (e.key === 'Home') n = tabs[0];
      else if (e.key === 'End') n = tabs[tabs.length - 1];
      if (n) { e.preventDefault(); n.focus(); n.click(); }
    });
  });

  /* ── POLL ── */
  document.querySelectorAll('.poll-option').forEach(function (opt) {
    opt.addEventListener('click', function (e) {
      document.querySelectorAll('.poll-option').forEach(function (o) { o.classList.remove('selected'); });
      document.querySelectorAll('.poll-option').forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
      e.currentTarget.classList.add('selected');
      e.currentTarget.setAttribute('aria-pressed', 'true');
    });
  });

  /* ── SMOOTH SCROLL ── */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var href = a.getAttribute('href');
      if (!href || href === '#') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      var target = document.querySelector(href);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
