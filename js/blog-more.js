/* RealIRacing - blog index pages: show the first 9 cards of the page, "Load more" reveals 9 more each time.
   External file because script-src has no 'unsafe-inline'.
   One model on every index page: the count line reads "Showing N of 30 on this page · page X of 10",
   "Load more" reveals the rest of THIS page, and the numbered page row (Newer / 1..10 / Older)
   appears only once every card of the page is visible.
   Every card and the page row stay in the HTML (crawlable, and everything shows when JS is off);
   this only sets the `hidden` attribute and removes it again. */
(function () {
  'use strict';
  var STEP = 9;
  var grid = document.querySelector('.blog-grid');
  if (!grid) return;
  var cards = [].slice.call(grid.children).filter(function (n) { return n.classList.contains('blog-card'); });
  var pager = grid.querySelector('.blog-pager');
  var status = grid.querySelector('.blog-count');
  if (cards.length <= STEP || !status) return;

  var shown = STEP;
  cards.forEach(function (c, i) { if (i >= STEP) c.hidden = true; });
  if (pager) pager.hidden = true;

  var wrap = document.createElement('div');
  wrap.className = 'blog-more';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'blog-more-btn';
  btn.textContent = 'Load more';
  grid.insertBefore(wrap, status);
  wrap.appendChild(status);
  wrap.appendChild(btn);

  function paint() {
    status.textContent = 'Showing ' + shown + ' of ' + cards.length + ' on this page · page ' +
      status.getAttribute('data-page') + ' of ' + status.getAttribute('data-pages');
    if (shown >= cards.length) {
      btn.hidden = true;
      if (pager) pager.hidden = false;
    }
  }

  btn.addEventListener('click', function () {
    var first = shown;
    var next = Math.min(shown + STEP, cards.length);
    for (var i = shown; i < next; i++) cards[i].hidden = false;
    shown = next;
    paint();
    // the button is gone after the last reveal: keep keyboard focus in the list, on the first
    // new card, so Tab continues through the new cards and on into the page row
    if (btn.hidden && cards[first] && cards[first].focus) cards[first].focus({ preventScroll: true });
  });

  paint();
})();
