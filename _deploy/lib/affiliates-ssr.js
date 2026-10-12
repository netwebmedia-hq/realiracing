// _deploy/lib/affiliates-ssr.js
//
// Server-side mirror of the runtime affiliate renderer in js/affiliates.js.
//
// The gear box used to exist only after JavaScript ran: every post shipped an
// empty `<div id="rir-gear"></div>` and renderGearBox() filled it in the
// browser. A live audit of realiracing.com found affiliate links in the served
// HTML of just 10 of 28 posts — and only because those posts' prose carried
// inline data-aff anchors. Crawlers saw nothing, and every commission depended
// on JS executing. Rendering the box at build time fixes both.
//
// js/affiliates.js stays the single source of truth for product data; this
// module PARSES it rather than duplicating it, so the two can never drift.
// Kept as its own module (not inside generate-blogs.js) because that script
// executes its pipeline at top level — requiring it would publish posts.

const fs = require('fs');
const path = require('path');

const AFFILIATES_JS = path.join('js', 'affiliates.js');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const unquote = (s) => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');

/* Parse amazonTag, products and the FTC disclosure out of js/affiliates.js. */
function loadAffiliateConfig(file) {
  const src = fs.readFileSync(file || AFFILIATES_JS, 'utf8');

  const tagM = src.match(/amazonTag:\s*'([^']*)'/);
  const amazonTag = tagM ? tagM[1] : '';

  // Each product is `'key': { name: '…', amazonUrl: '…', note: '…' }`.
  const products = {};
  const re = /'([a-z][a-z0-9-]*)':\s*\{\s*\r?\n\s*name:\s*'((?:[^'\\]|\\.)*)',\s*\r?\n\s*amazonUrl:\s*'((?:[^'\\]|\\.)*)',\s*\r?\n\s*note:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src))) {
    products[m[1]] = { name: unquote(m[2]), amazonUrl: unquote(m[3]), note: unquote(m[4]) };
  }

  const discM = src.match(/var DISCLOSURE = '((?:[^'\\]|\\.)*)'/);
  const disclosure = discM
    ? unquote(discM[1])
    : 'Some links are affiliate links — I may earn a commission at no cost to you.';

  return { amazonTag, products, disclosure };
}

/* Mirrors affUrl() in js/affiliates.js — the tag is appended only once a real
 * Associates ID is configured, never for the 'PENDING-20' placeholder. */
function affUrlFor(cfg, key) {
  const p = cfg.products[key];
  if (!p) return '#';
  let url = p.amazonUrl;
  if (cfg.amazonTag && cfg.amazonTag !== 'PENDING-20') {
    url += (url.indexOf('?') === -1 ? '?' : '&') + 'tag=' + encodeURIComponent(cfg.amazonTag);
  }
  return url;
}

/* Products Carlos actually races and streams on (the "actual rig" group in
 * js/affiliates.js, minus WHOOP: the band on his wrist is a 4.0, the product
 * linked is the 5.0 you can buy now). These get the "Raced on" badge in the
 * comparison table; every other pick is a researched recommendation, exactly as
 * the disclosure paragraph on each post already says. No ratings, no scores and
 * no prices are shown anywhere in the box. */
const RIG_KEYS = new Set([
  'moza-r9', 'moza-cs-v2', 'moza-crp2', 'gpu-rtx-5060-ti', 'cpu-ryzen-7-5700', 'monitor-1440p-120',
]);

/* Produces the gear box renderGearBox() would build in the DOM, as a comparison
 * table: pick, why it made the list, and whether it is on Carlos's own rig.
 * Unknown keys are dropped rather than throwing — a bad key must never break
 * the pipeline. Returns the empty container unchanged when nothing valid
 * remains, so the runtime path can still try. data-aff is emitted so
 * hydrateLinks() can re-point a link if the tag ever changes without a rebuild;
 * every link keeps rel="sponsored noopener" and the Associates tag. */
function renderGearBoxHtml(cfg, keys, title) {
  const rows = (keys || [])
    .filter((k) => cfg.products[k])
    .map((k) => {
      const p = cfg.products[k];
      const a = `<a href="${esc(affUrlFor(cfg, k))}" data-aff="${esc(k)}" target="_blank" rel="sponsored noopener">${esc(p.name)}</a>`;
      const status = RIG_KEYS.has(k)
        ? '<span class="rig-badge">Raced on</span>'
        : '<span class="rig-badge rig-badge--rec">Researched pick</span>';
      return `            <tr><th scope="row">${a}</th><td>${esc(p.note)}</td><td>${status}</td></tr>`;
    });

  if (!rows.length) return '<div id="rir-gear"></div>';

  return `<div id="rir-gear"><div class="gear-box">
        <span class="box-label">${esc(title || 'Gear used & recommended')}</span>
        <div class="table-scroll">
          <table class="gear-table">
            <thead><tr><th scope="col">Pick</th><th scope="col">Why it made the list</th><th scope="col">Tested?</th></tr></thead>
            <tbody>
${rows.join('\n')}
            </tbody>
          </table>
        </div>
        <p class="aff-note">${esc(cfg.disclosure)}</p>
      </div></div>`;
}

/* schema.org ItemList of Product entries for a post's gear keys. Deliberately
 * has no offers, price, rating or review: none of those exist as real data, and
 * affiliate URLs are not the product's canonical page. */
function gearItemListLd(cfg, keys, pageUrl, title) {
  const items = (keys || []).filter((k) => cfg.products[k]).map((k, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Product',
      name: cfg.products[k].name,
      description: cfg.products[k].note,
      url: `${pageUrl}#rir-gear`,
    },
  }));
  if (!items.length) return null;
  return { '@context': 'https://schema.org', '@type': 'ItemList', name: title || 'The gear in this guide', itemListElement: items };
}

/* ─── Amazon Associates compliance + in-text links (added 2026-10-12) ─────────
 *
 * Three things the gear box alone did not do, found in the 2026-10-12 money
 * audit of all 153 pages:
 *
 * 1. The Operating Agreement requires the statement "As an Amazon Associate I
 *    earn from qualifying purchases." on pages that carry Amazon links. Every
 *    page had a generic affiliate disclosure and none had that sentence. A
 *    missing statement is grounds for closing the account — the only earner on
 *    this site — so it is now part of the page template and of DISCLOSURE in
 *    js/affiliates.js.
 *
 * 2. Nothing stopped a model-written paragraph from carrying a bare amazon.com
 *    href. The gear box always got the tag; prose links did not (six published
 *    queue entries shipped that way in July and were only caught by later
 *    backfills). enforceAmazonTags() runs over every rendered body.
 *
 * 3. Products named in prose ("the G923 is …", "CSL DD …") were plain text; the
 *    only link was in the gear box at the bottom. linkProductMentions() links
 *    the FIRST mention of each catalog product, once, capped per page, so the
 *    reader can click at the moment they are deciding. */

const AMAZON_STATEMENT = 'As an Amazon Associate I earn from qualifying purchases.';

/* The paragraph at the top of every article. Keep AMAZON_STATEMENT first. */
const PAGE_DISCLOSURE =
  AMAZON_STATEMENT + ' Some links on this page may earn RealIRacing a commission at no extra cost to you. ' +
  'Gear I personally race on is called out as such; other picks are researched recommendations.';

/* How each catalog key is written in prose. Anchored on a distinctive model
 * token so "R9" inside an unrelated word never matches; the optional brand
 * prefix is swallowed so the whole product name becomes the anchor text.
 * Keys with no pattern here simply get no in-text link. */
const MENTION_PATTERNS = {
  'moza-r9': /\b(?:MOZA |Moza )R9\b/,
  'moza-r5': /\b(?:MOZA |Moza )R5\b/,
  'moza-r12': /\b(?:MOZA |Moza )R12\b/,
  'moza-cs-v2': /\b(?:MOZA |Moza )?CS V2\b/,
  'moza-crp2': /\b(?:MOZA |Moza )?CRP2\b/,
  'moza-sr-p': /\b(?:MOZA |Moza )?SR-P\b/,
  'logitech-g923': /\b(?:Logitech )?G923\b/,
  'thrustmaster-t300': /\b(?:Thrustmaster )?T300(?:RS)?(?: RS)?(?: GT)?\b/,
  'fanatec-csl-dd': /\b(?:Fanatec )?CSL DD\b/,
  'fanatec-clubsport-dd': /\b(?:Fanatec )?ClubSport DD\+?/,
  'thrustmaster-t-lcm': /\b(?:Thrustmaster )?T-LCM\b/,
  'meta-quest-3': /\b(?:Meta )?Quest 3\b(?!S)/,
  'gpu-rtx-5060-ti': /\bRTX 5060 Ti\b/,
  'cpu-ryzen-7-5700': /\bRyzen 7 5700\b/,
  'whoop': /\bWHOOP\b/,
};

const AMAZON_HOST = /^https?:\/\/(?:www\.)?amazon\.[a-z.]+\//i;

/* Make every Amazon <a> in `html` carry the Associates tag and
 * rel="sponsored noopener". Returns { html, fixed } where fixed counts anchors
 * that were changed. Short links (amzn.to, a.co) cannot be tagged by us and are
 * left alone for the CI validator to flag. */
function enforceAmazonTags(html, cfg) {
  const tag = cfg && cfg.amazonTag;
  if (!tag || tag === 'PENDING-20') return { html, fixed: 0 };
  let fixed = 0;
  const out = String(html).replace(/<a\b[^>]*>/gi, (anchor) => {
    const hm = anchor.match(/\bhref="([^"]*)"/i);
    if (!hm) return anchor;
    const href = hm[1];
    if (!AMAZON_HOST.test(href.replace(/&amp;/g, '&'))) return anchor;
    let next = anchor;
    let nh = href;
    if (/(\?|&amp;|&)tag=/.test(nh)) {
      nh = nh.replace(/(\?|&amp;|&)tag=[^&"]*/, '$1tag=' + encodeURIComponent(tag));
    } else {
      nh += (nh.indexOf('?') === -1 ? '?' : '&amp;') + 'tag=' + encodeURIComponent(tag);
    }
    if (nh !== href) next = next.replace(/\bhref="[^"]*"/i, 'href="' + nh + '"');
    const rm = next.match(/\brel="([^"]*)"/i);
    if (!rm) next = next.replace(/^<a\b/i, '<a rel="sponsored noopener"');
    else if (!/\bsponsored\b/.test(rm[1])) next = next.replace(/\brel="[^"]*"/i, 'rel="sponsored ' + rm[1].trim() + '"');
    if (!/\btarget=/.test(next)) next = next.replace(/^<a\b/i, '<a target="_blank"');
    if (next !== anchor) fixed++;
    return next;
  });
  return { html: out, fixed };
}

/* Link the first in-text mention of each catalog product that has no inline
 * affiliate link yet. `html` is an HTML fragment (the article body). Text
 * inside <a>, headings, <script>, <style>, <code>, <figcaption> and
 * <p class="disclosure"> is never touched. Returns { html, linked: [keys] }. */
function linkProductMentions(html, cfg, opts) {
  const max = (opts && opts.max) || 5;
  const src = String(html);
  const already = new Set();
  for (const m of src.matchAll(/data-aff="([a-z0-9-]+)"/g)) already.add(m[1]);

  const tokens = src.split(/(<[^>]*>)/).filter((t) => t !== '');
  const skipTags = new Set(['a', 'script', 'style', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'figcaption']);
  const voidTags = new Set(['br', 'img', 'hr', 'meta', 'link', 'input']);
  const depth = {};
  let disclosureDepth = 0; // inside <p class="disclosure">
  const eligible = new Array(tokens.length).fill(false);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const tm = t.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>$/);
    if (!tm) { // text
      eligible[i] = !t.startsWith('<') && Object.keys(depth).every((k) => depth[k] <= 0) && disclosureDepth <= 0;
      continue;
    }
    const closing = tm[1] === '/';
    const name = tm[2].toLowerCase();
    if (/\/\s*>$/.test(t) || voidTags.has(name)) continue;
    if (skipTags.has(name)) depth[name] = (depth[name] || 0) + (closing ? -1 : 1);
    if (name === 'p') {
      if (!closing && /class="[^"]*\bdisclosure\b/.test(tm[3])) disclosureDepth = 1;
      else if (closing) disclosureDepth = 0;
    }
  }

  // earliest match per key, in document order
  const found = [];
  for (const [key, re] of Object.entries(MENTION_PATTERNS)) {
    if (already.has(key) || !cfg.products[key]) continue;
    for (let i = 0; i < tokens.length; i++) {
      if (!eligible[i]) continue;
      const m = re.exec(tokens[i]);
      if (m) { found.push({ key, i, start: m.index, end: m.index + m[0].length, text: m[0] }); break; }
    }
  }
  found.sort((a, b) => a.i - b.i || a.start - b.start);

  // drop overlaps inside one token, then cap
  const chosen = [];
  for (const f of found) {
    const prev = chosen[chosen.length - 1];
    if (prev && prev.i === f.i && f.start < prev.end) continue;
    // links already in the text count toward the cap, so a re-run is a no-op
    if (chosen.length >= max - already.size) break;
    chosen.push(f);
  }

  // apply right-to-left so earlier offsets stay valid
  const byToken = {};
  for (const c of chosen) (byToken[c.i] = byToken[c.i] || []).push(c);
  for (const idx of Object.keys(byToken)) {
    const list = byToken[idx].sort((a, b) => b.start - a.start);
    let text = tokens[idx];
    for (const c of list) {
      const a = '<a href="' + esc(affUrlFor(cfg, c.key)) + '" data-aff="' + c.key +
        '" target="_blank" rel="sponsored noopener">' + c.text + '</a>';
      text = text.slice(0, c.start) + a + text.slice(c.end);
    }
    tokens[idx] = text;
  }
  return { html: tokens.join(''), linked: chosen.map((c) => c.key) };
}

module.exports = {
  loadAffiliateConfig, affUrlFor, renderGearBoxHtml, gearItemListLd, RIG_KEYS, esc,
  AMAZON_STATEMENT, PAGE_DISCLOSURE, MENTION_PATTERNS, enforceAmazonTags, linkProductMentions,
};
