// Rewrites the reel gallery in published event posts from _deploy/event-reels.json.
// publish-blogs.yml runs this, so a list updated by the Realtape poster reaches the
// pages on the next publish. Prints how many pages changed.
//   node _deploy/sync-event-reels.js

const fs = require('fs');
const path = require('path');
const { refreshHtml, load } = require('./lib/event-reels.js');

process.chdir(path.join(__dirname, '..'));

const all = load();
let changed = 0;
for (const f of fs.readdirSync('blog').filter((n) => n.endsWith('.html'))) {
  const p = path.join('blog', f);
  const html = fs.readFileSync(p, 'utf8');
  if (!html.includes('<!-- reels:')) continue;
  const next = refreshHtml(html, all);
  if (next !== html) {
    fs.writeFileSync(p, next);
    changed += 1;
  }
}
console.log(`event reels: ${changed} page(s) updated`);
