/* /forum/ board list: real thread count and latest thread title per board.
   Reads the same community API the board pages use (js/community-widget.js).
   If a request fails the line stays empty: nothing is ever invented. */
(function () {
  'use strict';
  var API = 'https://netwebmedia.com/api/community/threads?property=realiracing&page=1&post=';
  document.querySelectorAll('[data-board]').forEach(function (node) {
    var board = node.getAttribute('data-board');
    fetch(API + encodeURIComponent(board))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.threads || !d.threads.length) return;
        var latest = d.threads.reduce(function (a, b) {
          return String(b.created_at) > String(a.created_at) ? b : a;
        });
        var n = d.total || d.threads.length;
        var strong = document.createElement('strong');
        strong.textContent = n + (n === 1 ? ' thread' : ' threads');
        node.appendChild(strong);
        node.appendChild(document.createTextNode(' · Latest: ' + latest.title));
      })
      .catch(function () {});
  });
})();
