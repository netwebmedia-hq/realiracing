// _deploy/backfill-amazon-compliance.js
//
// Idempotent backfill from the 2026-10-12 money audit. For every published page
// that carries an Amazon link it:
//
//   1. puts the Operating-Agreement statement ("As an Amazon Associate I earn
//      from qualifying purchases.") into the page's disclosure paragraph —
//      inserting a disclosure paragraph where a post never had one — and into
//      the gear box's aff-note. None of the 153 pages carried it before.
//   2. re-renders each post's gear box from js/affiliates.js, so a swapped
//      product (name, note, link) reaches already-published posts, plus the
//      ItemList JSON-LD entries for products whose name/note changed.
//   3. links the first in-text mention of each catalog product (max 5 a page)
//      that has no inline link yet. Posts named products in prose and linked
//      them only in the gear box at the bottom.
//   4. makes sure every Amazon anchor has the Associates tag + rel=sponsored.
//
// generate-blogs.js does 1, 3 and 4 for every NEW post, so this only has to run
// once; re-running changes nothing.
//
// Usage:
//   node _deploy/backfill-amazon-compliance.js --dry-run
//   node _deploy/backfill-amazon-compliance.js

const fs = require('fs');
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const {
  loadAffiliateConfig, renderGearBoxHtml, AMAZON_STATEMENT, PAGE_DISCLOSURE,
  enforceAmazonTags, linkProductMentions, esc,
} = require('./lib/affiliates-ssr.js');

const DRY = process.argv.includes('--dry-run');
const cfg = loadAffiliateConfig();
if (!Object.keys(cfg.products).length || !cfg.disclosure.includes(AMAZON_STATEMENT)) {
  console.error('FATAL: js/affiliates.js did not parse, or its DISCLOSURE lacks the Amazon statement.');
  process.exit(1);
}

const files = ['index.html', 'gear.html']
  .concat(fs.readdirSync('blog').filter((f) => f.endsWith('.html')).map((f) => 'blog/' + f))
  .filter((f) => fs.existsSync(f));

/* Products whose displayed name/note changed after pages were rendered. The
 * JSON-LD ItemList in <head> repeats both, so it is rewritten too. */
const LD_RENAMES = [
  {
    from: '{"@type":"Product","name":"Thrustmaster T-LCM Pedals","description":"cheapest genuine load cell, works with any base over USB"',
    key: 'thrustmaster-t-lcm',
  },
];

const stats = { files: 0, statement: 0, disclosureInserted: 0, gearBoxes: 0, ldRenamed: 0, inline: 0, inlineFiles: 0, tagged: 0 };
const linkedBy = {};

for (const f of files) {
  const original = fs.readFileSync(f, 'utf8');
  if (!/amazon\.[a-z]+\//i.test(original)) continue;
  let html = original;
  const isPost = f.startsWith('blog/');

  // 1a. disclosure paragraph(s)
  html = html.replace(/<p class="disclosure">([\s\S]*?)<\/p>/g, (whole, inner) => {
    if (inner.includes(AMAZON_STATEMENT)) return whole;
    stats.statement++;
    // posts carry the standard sentence; other pages keep their own wording
    if (/^Some links on this page may earn RealIRacing a commission at no extra cost to you\./.test(inner)) {
      return `<p class="disclosure">${PAGE_DISCLOSURE}</p>`;
    }
    return `<p class="disclosure">${AMAZON_STATEMENT} ${inner}</p>`;
  });
  // 1b. posts that never had a top-of-article disclosure paragraph
  if (isPost && !/<p class="disclosure">/.test(html) && /<div class="article-body">/.test(html)) {
    html = html.replace(/(<div class="article-body">\s*\n)/, `$1      <p class="disclosure">${PAGE_DISCLOSURE}</p>\n\n`);
    stats.disclosureInserted++;
  }

  // 2. gear box re-render (keys + title come from the post's own inline call)
  if (isPost) {
    const call = html.match(/renderGearBox\(\s*'rir-gear'\s*,\s*(\[[^\]]*\])\s*(?:,\s*'([^']*)')?\s*\)/);
    const box = html.match(/<div id="rir-gear"><div class="gear-box">[\s\S]*?<p class="aff-note">[^<]*<\/p>\s*<\/div><\/div>/);
    if (call && box) {
      const keys = (call[1].match(/['"]([a-z][a-z0-9-]*)['"]/g) || []).map((s) => s.slice(1, -1)).filter((k) => cfg.products[k]);
      if (keys.length) {
        const fresh = renderGearBoxHtml(cfg, keys, call[2] || 'The gear in this guide');
        if (fresh !== box[0]) { html = html.replace(box[0], () => fresh); stats.gearBoxes++; }
      }
    }
  }
  // gear.html / index.html / any leftover aff-note: statement only
  html = html.replace(/<p class="aff-note">([^<]*)<\/p>/g, (whole, inner) => {
    if (inner.includes(AMAZON_STATEMENT)) return whole;
    return `<p class="aff-note">${esc(cfg.disclosure)}</p>`;
  });

  // 2b. JSON-LD ItemList entries for renamed products
  for (const r of LD_RENAMES) {
    if (!html.includes(r.from)) continue;
    const p = cfg.products[r.key];
    const to = `{"@type":"Product","name":${JSON.stringify(p.name)},"description":${JSON.stringify(p.note)}`;
    html = html.split(r.from).join(to);
    stats.ldRenamed++;
  }

  // 3. in-text links, in the article body only (not the gear box, not the FAQ)
  if (isPost && f !== 'blog/index.html') {
    const start = html.indexOf('<div class="article-body">');
    let end = html.indexOf('<div id="rir-gear">');
    if (end === -1) end = html.indexOf('<div class="cta-box">');
    if (start !== -1 && end > start) {
      const region = html.slice(start, end);
      const res = linkProductMentions(region, cfg, { max: 5 });
      if (res.linked.length) {
        html = html.slice(0, start) + res.html + html.slice(end);
        stats.inline += res.linked.length; stats.inlineFiles++;
        for (const k of res.linked) linkedBy[k] = (linkedBy[k] || 0) + 1;
      }
    }
  }

  // 4. tag + rel on every Amazon anchor
  const enforced = enforceAmazonTags(html, cfg);
  if (enforced.fixed) { html = enforced.html; stats.tagged += enforced.fixed; }

  if (html !== original) {
    stats.files++; if (DRY) console.log("  would change: " + f);
    if (!DRY) fs.writeFileSync(f, html);
  }
}

console.log(`${DRY ? '[dry-run] ' : ''}files changed: ${stats.files}`);
console.log(`  disclosure paragraphs given the Amazon statement: ${stats.statement}`);
console.log(`  posts that had no disclosure paragraph (inserted): ${stats.disclosureInserted}`);
console.log(`  gear boxes re-rendered: ${stats.gearBoxes}; JSON-LD entries renamed: ${stats.ldRenamed}`);
console.log(`  in-text product links added: ${stats.inline} across ${stats.inlineFiles} posts`);
console.log(`  anchors re-tagged / rel fixed: ${stats.tagged}`);
console.log('  inline links by product:', JSON.stringify(linkedBy));
