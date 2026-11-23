/* RealIRacing - phone nav menu. External file because script-src has no 'unsafe-inline'.
   Progressive enhancement: without JS the links stay a scrollable row (CSS in blog.css and index.html).
   With JS, at <= 900px the links collapse behind a menu button; Subscribe stays in the bar. */
(function () {
  'use strict';
  var ul = document.querySelector('.nav-links');
  var nav = ul && ul.closest('nav');
  if (!nav || nav.classList.contains('nav-js')) return;

  nav.classList.add('nav-js');
  ul.id = ul.id || 'nav-links';

  var cta = ul.querySelector('.nav-cta');
  if (cta) {
    cta.parentNode.classList.add('nav-cta-li');
    var mobileCta = cta.cloneNode(true);
    mobileCta.classList.add('nav-cta-m');
    nav.appendChild(mobileCta);
  }

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-toggle';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', ul.id);
  btn.setAttribute('aria-label', 'Menu');
  btn.innerHTML = '<span class="nav-toggle-bars" aria-hidden="true"></span>';
  nav.appendChild(btn);

  function setOpen(open, focusBtn) {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open && focusBtn) btn.focus();
  }

  btn.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
  ul.addEventListener('click', function (e) {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) setOpen(false, true);
  });
  document.addEventListener('click', function (e) {
    if (nav.classList.contains('open') && !nav.contains(e.target)) setOpen(false);
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 900) setOpen(false);
  });
})();
