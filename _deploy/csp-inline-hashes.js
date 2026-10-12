#!/usr/bin/env node
/* Regenerate the sha256 allow-list in the CSP's script-src from the HTML that is
 * actually being deployed.
 *
 * Why: realiracing enforces a CSP, and 29 blog posts each carry their own inline
 * <script> calling renderGearBox() with that post's affiliate keys — all
 * different, and the blog machine keeps publishing more. A hand-maintained hash
 * list would go stale the first time a post auto-published, and 'unsafe-inline'
 * would permit ANY inline script, including one injected at runtime. Hashing at
 * deploy time gives the strong version of both: only the inline scripts that are
 * actually in the committed source can run, and the list can never drift.
 *
 * <script type="application/ld+json"> is a data block the browser never
 * executes, so script-src does not apply to it — skipped.
 *
 * Usage: node _deploy/csp-inline-hashes.js <site-dir> [--check]
 *        --check exits non-zero if the file would change (for CI drift checks)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.argv[2] || '.';
const checkOnly = process.argv.includes('--check');
const htaccessPath = path.join(root, '.htaccess');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.github', 'node_modules', '_deploy', '_stage', 'hyperframes-highlights'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const hashes = new Map();
for (const file of walk(root)) {
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1].toLowerCase();
    if (attrs.includes('src=') || attrs.includes('ld+json')) continue;
    const digest = 'sha256-' + crypto.createHash('sha256').update(m[2], 'utf8').digest('base64');
    if (!hashes.has(digest)) hashes.set(digest, []);
    hashes.get(digest).push(path.relative(root, file));
  }
}

const list = [...hashes.keys()].sort().map(h => `'${h}'`).join(' ');
const original = fs.readFileSync(htaccessPath, 'utf8');

// Replace whatever is between "script-src 'self'" and the googletagmanager
// origin — i.e. the previous hash list, or 'unsafe-inline' on a first run.
const updated = original.replace(
  /(script-src 'self')[^;]*?( https:\/\/www\.googletagmanager\.com)/,
  (_all, head, tail) => head + (list ? ' ' + list : '') + tail
);

if (updated === original) {
  console.log(`CSP inline hashes already current — ${hashes.size} distinct across ${[...hashes.values()].flat().length} block(s).`);
  process.exit(0);
}
if (checkOnly) {
  console.error('::error::CSP inline-script hashes in .htaccess are stale. Run: node _deploy/csp-inline-hashes.js .');
  process.exit(1);
}
fs.writeFileSync(htaccessPath, updated);
console.log(`CSP script-src updated with ${hashes.size} inline-script hash(es) from ${[...hashes.values()].flat().length} block(s):`);
for (const [h, files] of [...hashes].sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
  console.log(`  ${String(files.length).padStart(3)} x ${h}  e.g. ${files[0]}`);
}
if (hashes.size > 8) console.log(`  … ${hashes.size - 8} more`);
