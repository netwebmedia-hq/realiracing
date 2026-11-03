// Reel gallery for the real-world event posts. _deploy/event-reels.json maps an
// event key to its Shorts on @realtape, most watched first. A queue post asks for
// the gallery with a {"reels": "<key>"} section. The block sits between markers so
// _deploy/sync-event-reels.js can refresh a published page as new reels go up.
// Cards are .lite-yt (js/lite-yt.js): a plain link that works with JavaScript off,
// and no YouTube request until the visitor clicks.

'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'event-reels.json');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const load = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));

function card({ id, title }) {
  const t = esc(title);
  return `        <div class="lite-yt" data-video-id="${esc(id)}">
          <a class="lite-yt-link" href="https://www.youtube.com/shorts/${esc(id)}" target="_blank" rel="noopener" data-title="${t}"><img src="https://img.youtube.com/vi/${esc(id)}/hqdefault.jpg" alt="${t}" width="480" height="360" loading="lazy" decoding="async"><span class="lite-yt-play" aria-hidden="true"></span><span class="lite-yt-label">${t}</span></a>
        </div>`;
}

function reelsBlock(key, all = load()) {
  const reels = all[key] || [];
  if (!reels.length) throw new Error(`event-reels.json has no reels for "${key}"`);
  return `      <!-- reels:${key}:start -->
      <h2>Watch the clips (${reels.length})</h2>
      <div class="reel-grid">
${reels.map(card).join('\n')}
      </div>
      <!-- reels:${key}:end -->`;
}

// Replace every marked block in a page. Returns the html unchanged if it has none.
function refreshHtml(html, all = load()) {
  return html.replace(/ *<!-- reels:([a-z0-9-]+):start -->[\s\S]*?<!-- reels:\1:end -->/g, (_, key) => reelsBlock(key, all));
}

module.exports = { reelsBlock, refreshHtml, load };
