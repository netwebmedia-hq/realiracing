/* /forum/ board list: real thread count and latest thread title per board.
   Reads the same community API the board pages use (js/community-widget.js).
   Every card always shows a state: "Loading threads…" (also in the HTML, so it is there on first paint),
   then the real count + latest title, or an honest empty/failed line. Nothing is ever invented. */
(function () {
  'use strict';
  var API = 'https://netwebmedia.com/api/community/threads?property=realiracing&page=1&post=';
  // "Nov 22, 2026" from the API's created_at (UTC, "YYYY-MM-DD HH:MM:SS"); '' when missing.
  function fmtDate(iso) {
    var d = new Date(String(iso || '').replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return ''; }
  }
  document.querySelectorAll('[data-board]').forEach(function (node) {
    var board = node.getAttribute('data-board');
    function say(text) { node.textContent = text; }
    say('Loading threads…');
    fetch(API + encodeURIComponent(board))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.threads) { say('Threads could not be loaded right now. Open the board to see them.'); return; }
        if (!d.threads.length) {
          // A reachable API with no threads: say so. The whole card links to the board page, where the post form is.
          say('No threads yet. Start the first one.');
          return;
        }
        var latest = d.threads.reduce(function (a, b) {
          return String(b.created_at) > String(a.created_at) ? b : a;
        });
        var n = d.total || d.threads.length;
        var strong = document.createElement('strong');
        strong.textContent = n + (n === 1 ? ' thread' : ' threads');
        node.textContent = '';
        node.appendChild(strong);
        node.appendChild(document.createTextNode(' · Latest: ' + latest.title));
        // Author and date as the API returns them; nothing shown when a field is missing.
        var by = [latest.author, fmtDate(latest.created_at)].filter(Boolean).join(' · ');
        if (by) {
          var line = document.createElement('span');
          line.className = 'board-by';
          line.textContent = by;
          node.appendChild(line);
        }
      })
      .catch(function () { say('Threads could not be loaded right now. Open the board to see them.'); });
  });
})();
