'use strict';
// Title-level duplicate detection for the blog machine. Slug checks alone let
// three pairs of identical-title posts ship (2026-11-10 audit): the model picks
// a fresh slug for a topic that is already covered.
const fs = require('fs');
const path = require('path');

const STOP = new Set(('a an the and or of to for in on with your you how why what when is are vs ' +
  'iracing sim racing guide').split(' '));

function normTitle(t) {
  return String(t || '').toLowerCase().replace(/&amp;|&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(t) {
  return new Set(normTitle(t).split(' ').filter((w) => w && !STOP.has(w)));
}
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / ((A.size + B.size - i) || 1);
}
/** 'exact' (same normalised title), 'near' (token Jaccard >= threshold) or null. */
function compareTitles(a, b, threshold = 0.8) {
  if (!normTitle(a) || !normTitle(b)) return null;
  if (normTitle(a) === normTitle(b)) return 'exact';
  return similarity(a, b) >= threshold ? 'near' : null;
}
function liveTitle(html) {
  const m = /<title>([\s\S]*?)<\/title>/.exec(html);
  return m ? m[1].replace(/\s*[|–—-]\s*RealI?Racing\s*$/i, '').trim() : '';
}
/** Every title already live (blog/*.html) or pending (_deploy/posts-queue/*.json). */
function loadTitles(root) {
  const out = [];
  const blog = path.join(root, 'blog');
  if (fs.existsSync(blog)) {
    for (const f of fs.readdirSync(blog)) {
      if (!f.endsWith('.html') || f === 'index.html') continue;
      out.push({ where: 'blog/' + f, title: liveTitle(fs.readFileSync(path.join(blog, f), 'utf8')) });
    }
  }
  const q = path.join(root, '_deploy', 'posts-queue');
  if (fs.existsSync(q)) {
    for (const f of fs.readdirSync(q)) {
      if (!f.endsWith('.json')) continue;
      try { out.push({ where: '_deploy/posts-queue/' + f, title: JSON.parse(fs.readFileSync(path.join(q, f), 'utf8')).title || '' }); } catch (e) { /* validator reports bad JSON */ }
    }
  }
  return out;
}
/** First existing entry that duplicates `title`, with its kind, or null. */
function findDuplicate(title, existing, threshold = 0.8) {
  for (const e of existing) {
    const kind = compareTitles(title, e.title, threshold);
    if (kind) return { kind, of: e };
  }
  return null;
}

module.exports = { normTitle, tokens, similarity, compareTitles, loadTitles, findDuplicate };
