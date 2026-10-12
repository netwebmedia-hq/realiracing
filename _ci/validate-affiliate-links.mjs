#!/usr/bin/env node
/**
 * Amazon Associates compliance — run in deploy.yml before anything ships.
 *
 *   node _ci/validate-affiliate-links.mjs
 *
 * This site's only verified earner is the Amazon Associates tag. Three ways it
 * silently stops earning, or gets the account closed, each of which was found
 * live on 2026-10-12 and none of which any earlier check would have caught:
 *
 * 1. NO REQUIRED STATEMENT. The Operating Agreement requires "As an Amazon
 *    Associate I earn from qualifying purchases." on pages with Amazon links.
 *    All 153 pages shipped with a generic affiliate sentence and not that one.
 *
 * 2. UNTAGGED OR UNMARKED LINKS. An amazon.com href without tag=<our tag> earns
 *    nothing; one without rel="sponsored" breaks Google's paid-link rules and
 *    the FTC disclosure. The generator tags the gear box, but a model-written
 *    paragraph can carry any href it likes (six did, in July).
 *
 * 3. A TAG THAT HAS GONE BACK TO THE PLACEHOLDER. js/affiliates.js documents that
 *    setting amazonTag to 'PENDING-20' sends every link out untagged.
 *
 * Short links (amzn.to, a.co) are rejected: they cannot be audited for the tag.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATEMENT = 'As an Amazon Associate I earn from qualifying purchases.';
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', '_stage', '_deploy', '_ci', 'hyperframes-highlights']);
const SKIP_FILES = new Set(['extract-slides.html']);

const errors = [];

// ─── tag + statement in the single source of truth ──────────────────────────
const affSrc = fs.readFileSync(path.join(ROOT, 'js', 'affiliates.js'), 'utf8');
const tagM = affSrc.match(/amazonTag:\s*'([^']*)'/);
const TAG = tagM ? tagM[1] : '';
if (!TAG || TAG === 'PENDING-20') {
  errors.push(`js/affiliates.js: amazonTag is "${TAG}" — every affiliate link would ship untagged.`);
}
const discM = affSrc.match(/var DISCLOSURE = '((?:[^'\\]|\\.)*)'/);
if (!discM || !discM[1].includes(STATEMENT)) {
  errors.push('js/affiliates.js: DISCLOSURE does not contain the Amazon Associates statement, so every gear box would ship without it.');
}

// ─── every page ─────────────────────────────────────────────────────────────
function htmlFiles(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.isDirectory()) continue;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) htmlFiles(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.html') && !SKIP_FILES.has(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

const AMAZON = /^https?:\/\/(?:www\.)?amazon\.[a-z.]+\//i;
const SHORT = /^https?:\/\/(?:amzn\.[a-z]+|a\.co)\//i;
let pages = 0, links = 0;

for (const file of htmlFiles(ROOT, [])) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const html = fs.readFileSync(file, 'utf8');
  let pageLinks = 0;
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const hm = m[0].match(/\bhref="([^"]*)"/i);
    if (!hm) continue;
    const href = hm[1].replace(/&amp;/g, '&');
    if (SHORT.test(href)) { errors.push(`${rel}: short Amazon link ${href} cannot be audited for the tag — use the full amazon.com URL.`); continue; }
    if (!AMAZON.test(href)) continue;
    pageLinks++; links++;
    const tags = [...href.matchAll(/[?&]tag=([^&#]*)/g)].map((x) => x[1]);
    if (!tags.length) errors.push(`${rel}: untagged Amazon link ${href}`);
    else if (tags.some((t) => t !== TAG)) errors.push(`${rel}: Amazon link with the wrong tag (${tags.join(',')}) ${href}`);
    const rm = m[0].match(/\brel="([^"]*)"/i);
    if (!rm || !/\bsponsored\b/.test(rm[1])) errors.push(`${rel}: Amazon link without rel="sponsored": ${href}`);
  }
  if (pageLinks) {
    pages++;
    if (!html.includes(STATEMENT)) errors.push(`${rel}: ${pageLinks} Amazon link(s) but no "${STATEMENT}" statement.`);
  }
}

if (errors.length) {
  console.error(`✗ Amazon Associates compliance: ${errors.length} problem(s)\n`);
  for (const e of errors.slice(0, 60)) console.error('  - ' + e);
  if (errors.length > 60) console.error(`  … and ${errors.length - 60} more`);
  process.exit(1);
}
console.log(`✓ Amazon Associates compliance: ${links} links on ${pages} pages, all tagged "${TAG}", all rel=sponsored, statement present on every page.`);
