// _deploy/backfill-privacy-link.js
//
// Idempotent: adds a "Privacy" link to the footer link row of every page that
// does not have one. generate-blogs.js emits the same link for new posts.
// Audit 2026-10-06 found no privacy policy anywhere on the site while GA4 and
// Amazon affiliate cookies were live.
//
//   node _deploy/backfill-privacy-link.js [--dry-run]
const fs = require('fs');
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const DRY = process.argv.includes('--dry-run');
const SKIP = new Set(['node_modules', '.git', '_deploy', '_ci', 'slides', 'hyperframes-highlights', 'assets']);
const RE = /(realiracing\.com\/go<\/a>)(\s*<\/p>)/;
const RE_PACKS = /(<a href="\/gear\.html">My Rig<\/a>)(<\/p>)/; // packs/ footer variant
let changed = 0, already = 0; const noMatch = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name)); continue; }
    if (!e.name.endsWith('.html') || e.name === 'privacy.html') continue;
    const f = path.join(dir, e.name);
    const src = fs.readFileSync(f, 'utf8');
    if (!src.includes('<footer')) continue;
    if (src.includes('href="/privacy.html"')) { already++; continue; }
    const re = RE.test(src) ? RE : RE_PACKS.test(src) ? RE_PACKS : null;
    if (!re) { noMatch.push(f); continue; }
    const sep = re === RE_PACKS ? ' &middot; ' : ' · ';
    if (!DRY) fs.writeFileSync(f, src.replace(re, '$1' + sep + '<a href="/privacy.html">Privacy</a>$2'));
    changed++;
  }
})('.');
console.log(`${DRY ? '[dry-run] ' : ''}changed=${changed} already=${already} no-match=${noMatch.length}`);
noMatch.forEach(f => console.log('  no footer match:', f));
