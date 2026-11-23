/* RealIRacing - blog index pages: show the first 9 cards of the page, "Load more" reveals 9 more each time.
   External file because script-src has no 'unsafe-inline'.
   One model on every index page: the count line reads "Showing N of 30 on this page · page X of 10",
   "Load more" reveals the rest of THIS page, and the numbered page row (Newer / 1..10 / Older)
   appears only once every card of the page is visible.
   Every card and the page row stay in the HTML (crawlable, and everything shows when JS is off);
   this only sets the `hidden` attribute and removes it again.
   Topic chips (Joni R8): built here, so without JavaScript there are no chips and every card shows.
   A chip filters the cards of the CURRENT page by the category line each card already carries
   ("Track Guides · Oval Racing"); the count line then counts the matching cards. */
(function () {
  'use strict';
  var STEP = 9;
  var grid = document.querySelector('.blog-grid');
  if (!grid) return;
  var cards = [].slice.call(grid.children).filter(function (n) { return n.classList.contains('blog-card'); });
  var pager = grid.querySelector('.blog-pager');
  var status = grid.querySelector('.blog-count');
  if (cards.length <= STEP || !status) return;

  // category line -> chip: Real-World Racing is real-world; any part naming buying or hardware is gear;
  // everything else is a sim racing guide
  var GEAR = /^(buyer['’]s guide|buying guide|hardware|hardware setup|rig guide|black friday|cyber monday)$/i;
  function groupOf(card) {
    var cat = card.querySelector('.blog-card-cat');
    var parts = (cat ? cat.textContent : '').split('·').map(function (s) { return s.trim(); });
    if (/^real-world racing$/i.test(parts[0])) return 'real';
    return parts.some(function (p) { return GEAR.test(p); }) ? 'gear' : 'guides';
  }
  var CHIPS = [
    { key: 'all', label: 'All' },
    { key: 'guides', label: 'Sim racing guides' },
    { key: 'gear', label: 'Gear' },
    { key: 'real', label: 'Real-world racing' }
  ];
  var groups = cards.map(groupOf);
  var current = 'all';
  var shown = STEP;

  function matching() {
    return cards.filter(function (c, i) { return current === 'all' || groups[i] === current; });
  }

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
    var list = matching();
    var vis = Math.min(shown, list.length);
    cards.forEach(function (c) { c.hidden = true; });
    list.forEach(function (c, i) { c.hidden = i >= vis; });
    status.textContent = 'Showing ' + vis + ' of ' + list.length + ' on this page · page ' +
      status.getAttribute('data-page') + ' of ' + status.getAttribute('data-pages');
    var all = vis >= list.length;
    btn.hidden = all;
    if (pager) pager.hidden = !all;
  }

  btn.addEventListener('click', function () {
    var list = matching();
    var first = Math.min(shown, list.length);
    shown = Math.min(shown + STEP, list.length);
    paint();
    // the button is gone after the last reveal: keep keyboard focus in the list, on the first
    // new card, so Tab continues through the new cards and on into the page row
    if (btn.hidden && list[first] && list[first].focus) list[first].focus({ preventScroll: true });
  });

  // chips: only the topics this page really has, and none at all if the page has a single topic
  var present = CHIPS.filter(function (c) { return c.key !== 'all' && groups.indexOf(c.key) !== -1; });
  if (present.length > 1) {
    var row = document.createElement('div');
    row.className = 'blog-filter';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Filter posts by topic');
    var buttons = [];
    [CHIPS[0]].concat(present).forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'blog-chip';
      b.textContent = c.label;
      b.setAttribute('data-filter', c.key);
      b.setAttribute('aria-pressed', c.key === 'all' ? 'true' : 'false');
      b.addEventListener('click', function () {
        current = c.key;
        shown = STEP;
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        paint();
      });
      buttons.push(b);
      row.appendChild(b);
    });
    grid.parentNode.insertBefore(row, grid);
  }

  paint();
})();
