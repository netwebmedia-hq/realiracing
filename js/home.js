/* RealIRacing — homepage behaviour (slideshow, media tabs, poll, smooth scroll).
   Extracted from an inline <script> in index.html on 2026-08-18 so the site can
   enforce a Content-Security-Policy without 'unsafe-inline' in script-src. The
   onclick="" attributes that used to drive these are now addEventListener
   bindings for the same reason — inline handlers are inline script as far as
   CSP is concerned, so leaving even one would have forced the policy open. */
(function () {
  'use strict';

  /* ── SLIDESHOW ── */
  var currentSlide = 0;
  var slideshowTimer = null;
  var slideshowPaused = false;
  var SLIDE_DURATION = 5000;

  var slides = document.querySelectorAll('.slide');
  var dots   = document.querySelectorAll('.progress-dot');

  /* Slides 2-7 carry their photos in data-bg / data-bg-sm instead of the
     stylesheet, so only slide 1 is fetched before first paint (every slide is
     opacity:0, not display:none, so a CSS background on all seven would have
     downloaded ~1 MB up front). The same media query as the stylesheet picks
     the phone crop. Attached after window.load, and defensively just before a
     slide is shown in case load is still pending on a slow connection. */
  var SMALL_VIEWPORT = '(max-width: 640px) and (orientation: portrait)';
  function attachBackground(slide) {
    var small = window.matchMedia(SMALL_VIEWPORT).matches;
    var src = (small && slide.getAttribute('data-bg-sm')) || slide.getAttribute('data-bg');
    if (src && !slide.style.backgroundImage) slide.style.backgroundImage = 'url("' + src + '")';
  }
  function attachAllBackgrounds() { slides.forEach(attachBackground); }

  function goToSlide(n) {
    if (!slides.length) return;
    slides[currentSlide].classList.remove('active');
    dots[currentSlide].classList.remove('active');
    currentSlide = (n + slides.length) % slides.length;
    attachBackground(slides[currentSlide]);
    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');
    dots.forEach(function (dot, i) {
      dot.setAttribute('aria-current', i === currentSlide ? 'true' : 'false');
    });
    resetTimer();
  }
  function nextSlide() { goToSlide(currentSlide + 1); }
  function prevSlide() { goToSlide(currentSlide - 1); }

  function resetTimer() {
    clearInterval(slideshowTimer);
    if (!slideshowPaused) slideshowTimer = setInterval(nextSlide, SLIDE_DURATION);
  }

  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { goToSlide(i); });
  });

  var prevBtn = document.querySelector('.slide-nav-prev');
  var nextBtn = document.querySelector('.slide-nav-next');
  if (prevBtn) prevBtn.addEventListener('click', prevSlide);
  if (nextBtn) nextBtn.addEventListener('click', nextSlide);

  var ss = document.getElementById('slideshow');
  if (ss) {
    // Pause on hover
    ss.addEventListener('mouseenter', function () { clearInterval(slideshowTimer); });
    ss.addEventListener('mouseleave', resetTimer);

    // Touch swipe support
    var touchStartX = 0;
    ss.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    ss.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) { dx < 0 ? nextSlide() : prevSlide(); }
    }, { passive: true });
  }

  // Keyboard support
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft')  prevSlide();
  });

  if (slides.length) {
    resetTimer();
    if (document.readyState === 'complete') attachAllBackgrounds();
    else window.addEventListener('load', attachAllBackgrounds);
  }

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

  var slideToggle = document.querySelector('.slide-toggle');
  if (slideToggle) {
    slideToggle.addEventListener('click', function () {
      slideshowPaused = !slideshowPaused;
      if (slideshowPaused) clearInterval(slideshowTimer); else resetTimer();
      slideToggle.textContent = slideshowPaused ? 'Play' : 'Pause';
      slideToggle.setAttribute('aria-label', slideshowPaused ? 'Resume slideshow' : 'Pause slideshow');
      slideToggle.setAttribute('aria-pressed', String(slideshowPaused));
    });
  }
  if (ss) {
    ss.addEventListener('focusin', function () { clearInterval(slideshowTimer); });
    ss.addEventListener('focusout', function () { if (!slideshowPaused) resetTimer(); });
  }
})();
