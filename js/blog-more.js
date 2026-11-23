/* RealIRacing - /blog/ index: show the first 9 cards, "Load more" reveals 9 more each time.
   External file because script-src has no 'unsafe-inline'.
   Every card stays in the HTML (crawlable, and everything shows when JS is off); this only
   sets the `hidden` attribute on cards after the first page and removes it again on click. */
(function () {
  'use strict';
  var STEP = 9;
  var grid = document.querySelector('.blog-grid');
  if (!grid) return;
  var cards = [].slice.call(grid.children).filter(function (n) { return n.classList.contains('blog-card'); });
  if (cards.length <= STEP) return;

  var shown = STEP;
  cards.forEach(function (c, i) { if (i >= STEP) c.hidden = true; });

  var wrap = document.createElement('div');
  wrap.className = 'blog-more';
  var status = document.createElement('p');
  status.className = 'blog-more-status';
  status.setAttribute('aria-live', 'polite');
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'blog-more-btn';
  btn.textContent = 'Load more';
  wrap.appendChild(status);
  wrap.appendChild(btn);

  function paint() {
    status.textContent = 'Showing ' + shown + ' of ' + cards.length + ' guides';
    if (shown >= cards.length) wrap.hidden = true;
  }

  btn.addEventListener('click', function () {
    var next = Math.min(shown + STEP, cards.length);
    for (var i = shown; i < next; i++) cards[i].hidden = false;
    shown = next;
    paint();
    if (wrap.hidden) {
      var first = cards[next - 1];
      if (first && first.focus) { /* keep keyboard focus in the list once the button is gone */ first.focus({ preventScroll: true }); }
    }
  });

  var pager = grid.querySelector('.blog-pager');
  grid.insertBefore(wrap, pager || null);
  paint();
})();
