/* RealIRacing - header nav enhancement. External file because script-src has no 'unsafe-inline'.
   Progressive enhancement: without JS the links stay a plain row (CSS in blog.css and index.html).
   With JS:
   - desktop: the in-page destinations (Media, Content, Where to watch, Vote) sit under one "More" dropdown,
     so the bar shows at most 6 items (Blog, Setup Packs, Forum, My Rig, More, Subscribe);
   - at <= 900px the links collapse behind a menu button, Subscribe stays in the bar, and the "More"
     entries are listed flat in the open menu, so every destination is one tap away. */
(function () {
  'use strict';
  var ul = document.querySelector('.nav-links');
  var nav = ul && ul.closest('nav');
  if (!nav || nav.classList.contains('nav-js')) return;

  nav.classList.add('nav-js');
  ul.id = ul.id || 'nav-links';

  /* ---- "More" group ---- */
  var LABELS = { platforms: 'Where to watch', poll: 'Vote' };
  var groupRe = /#(media|content|platforms|poll)$/;
  var grouped = [];
  [].slice.call(ul.children).forEach(function (li) {
    var a = li.querySelector('a');
    var m = a && groupRe.exec(a.getAttribute('href') || '');
    if (!m) return;
    if (LABELS[m[1]]) a.textContent = LABELS[m[1]];
    grouped.push(li);
  });
  if (grouped.length) {
    var css = document.createElement('style');
    css.textContent =
      '.nav-more{position:relative}' +
      '.nav-more-btn{font:inherit;font-size:.9rem;font-weight:500;color:var(--muted,#b4b8bf);background:none;border:0;padding:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px}' +
      '.nav-more-btn::after{content:"";width:6px;height:6px;border:solid currentColor;border-width:0 2px 2px 0;transform:rotate(45deg) translateY(-2px)}' +
      '.nav-more-btn:hover,.nav-more-btn[aria-expanded="true"]{color:var(--text,#f0f0f0)}' +
      '.nav-more-btn:focus-visible{outline:2px solid var(--accent,#e8ff00);outline-offset:3px}' +
      '.nav-sub{display:none;position:absolute;top:calc(100% + 14px);right:-12px;min-width:190px;list-style:none;margin:0;padding:8px;background:#0a0a0a;border:1px solid var(--border,#2a2d35);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.5)}' +
      '.nav-more.open .nav-sub{display:block}' +
      '@media (hover:hover) and (min-width:901px){.nav-more:hover .nav-sub{display:block}.nav-more:hover::before{content:"";position:absolute;left:0;right:0;top:100%;height:16px}}' +
      '.nav-sub li{display:block;padding:0;margin:0}' +
      '.nav-sub a{display:block;padding:10px 12px;border-radius:6px;white-space:nowrap}' +
      '.nav-sub a:hover,.nav-sub a:focus-visible{background:rgba(255,255,255,.08)}' +
      '@media (max-width:900px){nav.nav-js .nav-more-btn{display:none}nav.nav-js .nav-sub{display:block;position:static;min-width:0;padding:0;border:0;box-shadow:none;background:none}nav.nav-js .nav-sub a{padding:0 4px;border-radius:0;white-space:normal}}';
    document.head.appendChild(css);

    var more = document.createElement('li');
    more.className = 'nav-more';
    var moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'nav-more-btn';
    moreBtn.setAttribute('aria-expanded', 'false');
    moreBtn.setAttribute('aria-haspopup', 'true');
    moreBtn.textContent = 'More';
    var sub = document.createElement('ul');
    sub.className = 'nav-sub';
    sub.id = 'nav-more-list';
    moreBtn.setAttribute('aria-controls', sub.id);
    grouped.forEach(function (li) { sub.appendChild(li); });
    more.appendChild(moreBtn);
    more.appendChild(sub);
    var ctaLi = ul.querySelector('.nav-cta');
    ctaLi = ctaLi && ctaLi.closest('li');
    ul.insertBefore(more, ctaLi && ctaLi.parentNode === ul ? ctaLi : null);

    var setMore = function (open) {
      more.classList.toggle('open', open);
      moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    moreBtn.addEventListener('click', function () { setMore(!more.classList.contains('open')); });
    sub.addEventListener('click', function (e) { if (e.target.closest('a')) setMore(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && more.classList.contains('open')) { setMore(false); moreBtn.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (more.classList.contains('open') && !more.contains(e.target)) setMore(false);
    });
  }

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
