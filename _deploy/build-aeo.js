// _deploy/build-aeo.js
// Regenerates the answer-engine surfaces that list blog posts, so they never go
// stale when the publisher adds posts:
//   - llms.txt         (curated: newest 20 posts)
//   - llms-full.txt    (every post, one line each)
//   - index.html       (the #latest-posts-ld JSON-LD ItemList + WebSite dateModified)
// Post order = card order in blog/index.html (newest first, maintained by
// generate-blogs.js). Titles/descriptions/dates are read from each post's HTML.
// Usage: node _deploy/build-aeo.js   (also called from generate-blogs.js)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://realiracing.com';
const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function loadPosts() {
  const idx = fs.readFileSync(path.join(ROOT, 'blog', 'index.html'), 'utf8');
  const slugs = [];
  const re = /<a class="blog-card" href="([^"]+?)\.html">/g;
  let m;
  while ((m = re.exec(idx))) if (!slugs.includes(m[1])) slugs.push(m[1]);
  const posts = [];
  for (const slug of slugs) {
    const f = path.join(ROOT, 'blog', slug + '.html');
    if (!fs.existsSync(f)) continue;
    const h = fs.readFileSync(f, 'utf8');
    const t = h.match(/<title>([\s\S]*?)<\/title>/);
    const d = h.match(/<meta name="description" content="([^"]*)"/);
    const p = h.match(/"datePublished":\s*"([^"]+)"/);
    if (!t) continue;
    posts.push({
      slug, url: `${SITE}/blog/${slug}.html`,
      title: dec(t[1]).trim(), description: d ? dec(d[1]).trim() : '',
      date: p ? p[1] : '',
    });
  }
  return posts;
}

const line = p => `- [${p.title}](${p.url})${p.description ? ': ' + p.description : ''}`;

function header(total) {
  return `# RealIRacing

> RealIRacing (realiracing.com) is an iRacing sim racing site by Carlos Martinez: practical guides on force feedback settings, wheel and pedal buyer's guides, safety rating and racecraft, car and track guides, and OBS streaming setups, plus race highlights, setup guides and rig tours on the @realtape YouTube channel. Real motorsport roots, tested on a real rig.

## About
- Author: Carlos Martinez (iRacing user "Carlos Martinez9"). Home: ${SITE}/
- Rig: MOZA R9 direct drive wheelbase, MOZA CS V2 wheel, MOZA SR-P pedals, RTX 5060 Ti, 1440p 120 Hz monitor. Full breakdown: ${SITE}/gear.html
- Affiliate disclosure: gear links go to Amazon and carry an affiliate tag; the author may earn a commission at no cost to the reader. The site does not use sponsored loaner hardware.
- ${total} blog guides published so far; new posts appear several times a week.

## Main sections
- [Home](${SITE}/): channel overview, content types, gear picks, FAQ
- [Blog](${SITE}/blog/): all iRacing guides, settings and gear advice
- [My Rig](${SITE}/gear.html): every part Carlos races and streams on, with notes on why
- [Link hub](${SITE}/go/): all platforms in one place
- [YouTube @realtape](https://www.youtube.com/@realtape): race highlights, setup guides, rig tours, iRacing tips
- Social: [Instagram @realiracing](https://www.instagram.com/realiracing) · [TikTok @realiracing](https://www.tiktok.com/@realiracing) · [X @realiracing](https://x.com/realiracing)
`;
}

function build() {
  const posts = loadPosts();
  const short = header(posts.length) + `\n## Latest blog posts (newest first)\n\n` + posts.slice(0, 20).map(line).join('\n') +
    `\n\n## More\n- Every post, one line each: ${SITE}/llms-full.txt\n- Sitemap: ${SITE}/sitemap.xml\n`;
  const full = header(posts.length) + `\n## All blog posts (newest first)\n\n` + posts.map(line).join('\n') + `\n\n## More\n- Sitemap: ${SITE}/sitemap.xml\n`;
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), short);
  fs.writeFileSync(path.join(ROOT, 'llms-full.txt'), full);

  // Homepage: latest-posts ItemList + dateModified
  const ip = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(ip, 'utf8');
  const dates = posts.map(p => p.date).filter(Boolean).sort();
  const newest = dates[dates.length - 1] || new Date().toISOString().slice(0, 10);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Latest RealIRacing blog posts',
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: Math.min(10, posts.length),
    itemListElement: posts.slice(0, 10).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: p.url, name: p.title })),
  };
  const block = `<script type="application/ld+json" id="latest-posts-ld">\n  ${JSON.stringify(ld, null, 2).replace(/\n/g, '\n  ')}\n  </script>`;
  const re = /<script type="application\/ld\+json" id="latest-posts-ld">[\s\S]*?<\/script>/;
  if (re.test(html)) html = html.replace(re, () => block);
  // dateModified only ever moves forward (the homepage itself may have been edited after the newest post)
  html = html.replace(/("@id": "https:\/\/realiracing\.com\/#website"[\s\S]*?"dateModified": ")([\d-]+)(")/, (all, a, cur, b) => a + (cur > newest ? cur : newest) + b);
  fs.writeFileSync(ip, html);
  console.log(`build-aeo: ${posts.length} posts -> llms.txt (20), llms-full.txt (all), index.html ItemList (10), dateModified ${newest}`);
}

module.exports = { build };
if (require.main === module) build();
