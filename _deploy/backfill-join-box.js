// _deploy/backfill-join-box.js
//
// One-shot backfill: adds the email-capture box (lib/join-box.js) to posts
// generated before generate-blogs.js started emitting it. The 10-19 audit found
// 0 forms on 186 of 187 pages, so the site's only real audience left no list.
//
// Inserts the box right after the setup-pack CTA, adds /js/join.js, and bumps
// the blog.css version so the new styles are fetched. A post without the pack
// CTA or the affiliates.js tag is reported and left alone, rather than guessed at.
//
// Idempotent: a post that already has form.rir-join is skipped.
//
// Usage:
//   node _deploy/backfill-join-box.js --dry-run   # report only
//   node _deploy/backfill-join-box.js             # write changes

const fs = require('fs');
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { JOIN_BOX_HTML, JOIN_SCRIPT_TAG, BLOG_CSS_HREF } = require('./lib/join-box.js');

const DRY = process.argv.includes('--dry-run');
const BLOG_DIR = 'blog';
// \r?\n: autocrlf checkouts on Windows hold CRLF; each file keeps its own EOL.
const PACK_CTA_END = /(<div class="cta-box rir-pack-cta">[\s\S]*?<\/div>\r?\n)/;
const AFF_SCRIPT = /(<script src="\/js\/affiliates\.js"(?: defer)?><\/script>\r?\n)/; // hand-written posts omit defer

let patched = 0, already = 0;
const skipped = [];

for (const f of fs.readdirSync(BLOG_DIR).filter((n) => n.endsWith('.html') && n !== 'index.html').sort()) {
  const p = path.join(BLOG_DIR, f);
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('class="rir-join"')) { already++; continue; }
  if (!PACK_CTA_END.test(html) || !AFF_SCRIPT.test(html)) { skipped.push(f); continue; }

  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  html = html.replace(PACK_CTA_END, `$1      ${JOIN_BOX_HTML.replace(/\n/g, nl)}${nl}`)
             .replace(AFF_SCRIPT, `$1  ${JOIN_SCRIPT_TAG}${nl}`)
             .replace(/blog\.css\?v=\d+/, BLOG_CSS_HREF);
  if (!DRY) fs.writeFileSync(p, html);
  patched++;
}

console.log(`${DRY ? '[dry-run] ' : ''}patched ${patched}, already had it ${already}, skipped ${skipped.length}`);
if (skipped.length) console.log('skipped (no pack CTA or affiliates.js tag):\n  ' + skipped.join('\n  '));
