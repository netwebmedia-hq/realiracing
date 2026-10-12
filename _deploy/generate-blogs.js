// _deploy/generate-blogs.js
// Generates RealIRacing blog posts from posts-queue/*.json files, rebuilds
// blog/index.html (prepending new cards, newest first) and appends new
// entries to sitemap.xml. Each JSON file in posts-queue/ represents one
// post. After rendering to HTML inside /blog/, the JSON file is moved to
// posts-queue/_published/.
//
// Usage:
//   node _deploy/generate-blogs.js             # render everything pending
//   node _deploy/generate-blogs.js --limit 2   # render at most 2 posts
//
// Every rendered post carries a live affiliate gear box (#rir-gear +
// renderGearBox()) driven by js/affiliates.js — that's the whole point of
// the pipeline: traffic into genuinely useful iRacing content -> Amazon
// affiliate revenue. gearKeys in the queue JSON are validated against the
// live RIR_AFF.products keys at render time; unknown keys are dropped
// (never crash the pipeline over a bad key), and if nothing valid remains
// we fall back to the core rig ['moza-r9', 'cockpit'] so no post ever ships
// without a gear box.

const fs = require('fs');
const path = require('path');

const photos = require('./lib/photos.js');
process.chdir(path.join(__dirname, '..'));

const QUEUE_DIR = path.join('_deploy', 'posts-queue');
const PUBLISHED_DIR = path.join(QUEUE_DIR, '_published');
const BLOG_DIR = 'blog';
const SITE_URL = 'https://realiracing.com';

if (!fs.existsSync(PUBLISHED_DIR)) fs.mkdirSync(PUBLISHED_DIR, { recursive: true });

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

// Card visuals for blog/index.html — deterministic pick per slug (like a
// mini version of NWM's imageFor()) so new cards get some visual variety
// without needing per-post art direction.
const CARD_STYLES = [
  { emoji: '🎯', rgb: '255,110,60' },
  { emoji: '🔧', rgb: '0,200,255' },
  { emoji: '🏆', rgb: '232,255,0' },
  { emoji: '📊', rgb: '180,120,255' },
  { emoji: '🖥️', rgb: '0,220,180' },
  { emoji: '🎮', rgb: '255,80,180' },
  { emoji: '🌐', rgb: '100,200,50' },
  { emoji: '⚙️', rgb: '255,160,0' },
  { emoji: '🚗', rgb: '255,200,0' },
  { emoji: '🔥', rgb: '255,60,60' },
  { emoji: '💡', rgb: '120,160,255' },
  { emoji: '📈', rgb: '0,255,150' },
  { emoji: '🧠', rgb: '150,100,255' },
  { emoji: '🕹️', rgb: '255,120,120' },
];

// Google renders roughly 60 characters of <title>; append the brand only when it
// fits, otherwise the suffix just pushes the end of the headline out of view.
function brandTitle(title) {
  const core = String(title).trim();
  const withBrand = core + ' | RealIRacing';
  return withBrand.length <= 60 ? withBrand : core;
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff; return h; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// Real, public profiles only (same set the homepage Person/Organization carry).
const AUTHOR_SAMEAS = ['https://www.youtube.com/@realtape', 'https://www.instagram.com/realiracing'];

function breadcrumbLd(title, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog/` },
      { '@type': 'ListItem', position: 3, name: title, item: url },
    ],
  };
}

function stripTags(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, ''); }
// Titles/tags scraped back out of already-rendered HTML (scanExistingPosts)
// come out HTML-escaped (e.g. "&amp;"). Un-escape them here so downstream
// esc() calls (related-card links, index cards) don't double-escape into
// "&amp;amp;".
function unescapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
}

// ─── Affiliate gear key allowlist ───────────────────────────────────────────
// Parsed live from js/affiliates.js so this list can never drift out of sync
// with the single source of truth (RIR_AFF.products). Each product entry in
// that file follows the exact shape `'key': {\n  name: ...`, which is what
// the regex below keys off.
function loadAllowedGearKeys() {
  const src = fs.readFileSync(path.join('js', 'affiliates.js'), 'utf8');
  const keys = new Set();
  const re = /'([a-z][a-z0-9-]*)':\s*\{\s*\r?\n\s*name:/g;
  let m;
  while ((m = re.exec(src))) keys.add(m[1]);
  return keys;
}

// ─── Server-side gear box ───────────────────────────────────────────────────
// Rendered at build time (see _deploy/lib/affiliates-ssr.js) so the affiliate
// links exist in the served HTML: crawlable, and working even if JS fails. The
// runtime renderGearBox() call each post still carries then finds a populated
// container and no-ops.
const {
  loadAffiliateConfig, renderGearBoxHtml, gearItemListLd,
  PAGE_DISCLOSURE, enforceAmazonTags, linkProductMentions,
} = require('./lib/affiliates-ssr.js');

const FALLBACK_GEAR_KEYS = ['moza-r9', 'cockpit'];

// ─── Publish date clamp ─────────────────────────────────────────────────────
// generate-post-queue.js stamps queued posts with scheduled dates that run
// days or weeks ahead, but this publisher renders whatever is pending the
// moment it fires. A post goes live now, so it can never claim a later date:
// a future datePublished confuses search engines and made the NWM
// blog-staleness check read RealiRacing as "-27d old" (2026-09-14).
const TODAY = new Date().toISOString().slice(0, 10);

function longDateLabel(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function clampPublishedToToday(post) {
  if (!post.published || post.published <= TODAY) return false;
  console.warn(`  ${post.slug}: published ${post.published} is in the future — clamped to ${TODAY}.`);
  post.published = TODAY;
  post.dateLabel = longDateLabel(TODAY);
  return true;
}

// ─── FAQ helpers (fallback only — seed/generated posts should ship explicit
// post.faqs; this heuristic mirrors NWM's derivation as a safety net) ───────

function isPluralTopic(s) {
  const t = String(s || '').trim().toLowerCase().replace(/\?+$/, '');
  if (!t.endsWith('s')) return false;
  if (/(ss|us|is)$/.test(t)) return false;
  return true;
}

function h2ToQuestion(h2) {
  const t = String(h2 || '').replace(/\s+/g, ' ').trim();
  if (/^(how|what|why|when|who|where|is|are|can|do|does|should|will)\b/i.test(t)) {
    return t.endsWith('?') ? t : t + '?';
  }
  const lower = t.charAt(0).toLowerCase() + t.slice(1).replace(/\?$/, '');
  if (/^the\s/i.test(t)) {
    const verb = isPluralTopic(lower.replace(/^the\s+/, '')) ? 'are' : 'is';
    return `What ${verb} ${lower}?`;
  }
  return `How do you ${lower}?`;
}

function buildFallbackFaqs(post) {
  const faqs = [];
  const cleanTitle = String(post.title || '').split(/—|:/)[0].trim();
  if (cleanTitle && post.description) {
    let q;
    if (/^(how|what|why|when|who|where|is|are|can|do|does|should|will)\b/i.test(cleanTitle)) {
      q = cleanTitle.endsWith('?') ? cleanTitle : cleanTitle + '?';
    } else {
      const verb = isPluralTopic(cleanTitle) ? 'are' : 'is';
      q = `What ${verb} ${cleanTitle}?`;
    }
    faqs.push({ q, a: post.description });
  }
  const sections = post.sections || [];
  const h2s = sections.filter(s => s.h2);
  for (let i = 0; i < Math.min(3, h2s.length); i++) {
    const h2Sec = h2s[i];
    const idx = sections.indexOf(h2Sec);
    let answer = '';
    for (let j = idx + 1; j < Math.min(sections.length, idx + 4); j++) {
      const sec = sections[j];
      if (sec.h2) break;
      if (sec.p) { answer = sec.p; break; }
    }
    if (answer) faqs.push({ q: h2ToQuestion(h2Sec.h2), a: answer });
  }
  if (faqs.length < 4) {
    faqs.push({
      q: 'How much does this actually cost?',
      a: 'Prices move constantly, so I avoid quoting numbers that go stale — shop the current price on the linked gear and compare it against the tiers described above.'
    });
  }
  return faqs.slice(0, 5);
}

// ─── Body rendering ──────────────────────────────────────────────────────────
// Section object keys: p, h2, h3, list, olist, tip (+ optional tipLabel).
// The FIRST `p` in the array gets the special "article-lead" treatment,
// matching the hand-written template. Text is inserted raw (not escaped) —
// same convention as the NWM reference machine — so seed/generated copy can
// carry inline <a>/<strong> exactly like the hand-written posts do.
function renderSections(sections) {
  let leadUsed = false;
  return (sections || []).map(s => {
    if (s.h2) return `      <h2>${esc(s.h2)}</h2>`;
    if (s.h3) return `      <h3>${esc(s.h3)}</h3>`;
    if (s.list) return `      <ul>\n` + s.list.map(li => `        <li>${li}</li>`).join('\n') + `\n      </ul>`;
    if (s.olist) return `      <ol>\n` + s.olist.map(li => `        <li>${li}</li>`).join('\n') + `\n      </ol>`;
    if (s.tip || s.quote) {
      const label = esc(s.tipLabel || 'Worth noting');
      const text = s.tip || s.quote;
      return `      <div class="tip-box">\n        <span class="box-label">${label}</span>\n        <p>${text}</p>\n      </div>`;
    }
    if (s.p) {
      if (!leadUsed) { leadUsed = true; return `      <p class="article-lead">${s.p}</p>`; }
      return `      <p>${s.p}</p>`;
    }
    return '';
  }).filter(Boolean).join('\n\n');
}

function shortDateLabel(dateLabelFull) {
  const d = new Date(dateLabelFull);
  if (isNaN(d)) return dateLabelFull;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function readTimeShort(rt) {
  return String(rt || '').replace(/\s*read\s*$/i, '').trim() || '6 min';
}

// ─── Related posts ───────────────────────────────────────────────────────────
// Deterministic pick (seeded by slug hash) preferring same-category posts
// first, so "Keep reading" links feel relevant without needing hand-authored
// cross-links for every generated post.
function pickRelated(pool, currentSlug, tag, n) {
  const catShort = String(tag || '').split('·')[0].trim();
  const others = pool.filter(p => p.slug !== currentSlug);
  const sameCat = others.filter(p => String(p.tag || '').split('·')[0].trim() === catShort);
  const sameCatSet = new Set(sameCat);
  const rest = others.filter(p => !sameCatSet.has(p));

  function seededShuffle(arr, seed) {
    const a = [...arr];
    let s = seed;
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const seed = hash(currentSlug);
  const ordered = seededShuffle(sameCat, seed).concat(seededShuffle(rest, seed + 1));
  return ordered.slice(0, n);
}

// ─── Scan existing posts (for related-links pool + index rebuild) ──────────
function scanExistingPosts() {
  if (!fs.existsSync(BLOG_DIR)) return [];
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
  return files.map(f => {
    const html = fs.readFileSync(path.join(BLOG_DIR, f), 'utf8');
    const slug = f.replace(/\.html$/, '');
    const title = unescapeHtml(((html.match(/<h1>([\s\S]*?)<\/h1>/) || [, ''])[1] || '').trim());
    const tag = unescapeHtml(((html.match(/<p class="section-label">([^<]*)<\/p>/) || [, ''])[1] || '').trim());
    return { slug, title, tag };
  });
}

// ─── Render one post ─────────────────────────────────────────────────────────
function renderPostHtml(post, related, allowedGearKeys) {
  const slug = post.slug;
  const url = `${SITE_URL}/blog/${slug}.html`;
  // Every post gets a picture with a stated origin: a photograph under an
  // attribution-only licence, credited under the image, or a cover we rendered.
  // Before this the article carried none and the index card showed an emoji on a
  // gradient — the same emoji on a lot of cards.
  const photo = photos.photoFor({ slug, title: post.title, description: post.description, tag: post.tag });
  const photoUrl = photos.ogImage(photo, SITE_URL);
  const publishedISO = post.published || new Date().toISOString().slice(0, 10);
  const title = post.title;
  const description = post.description;
  const author = post.author || 'Carlos Martinez';
  const dateLabel = post.dateLabel || publishedISO;
  const readTime = post.readTime || '7 min read';
  const tag = post.tag || 'Guides';

  let gearKeys = Array.isArray(post.gearKeys) ? post.gearKeys.filter(k => allowedGearKeys.has(k)) : [];
  if (gearKeys.length === 0) gearKeys = FALLBACK_GEAR_KEYS.slice();

  // Rendered into the HTML at build time so the affiliate links are crawlable
  // and survive a JS failure; the runtime renderGearBox() call below then
  // finds a populated container and leaves it alone.
  const affCfg = loadAffiliateConfig();
  const gearBoxHtml = renderGearBoxHtml(affCfg, gearKeys, 'The gear in this guide');
  const gearLd = gearItemListLd(affCfg, gearKeys, url, 'The gear in this guide');

  const faqs = Array.isArray(post.faqs) && post.faqs.length ? post.faqs : buildFallbackFaqs(post);
  // 2026-10-12 money audit: (1) any raw amazon.com href the model wrote in prose
  // gets the Associates tag + rel=sponsored, (2) the first in-text mention of
  // each catalog product becomes a tagged link (max 5 per page), so the reader
  // can click at the moment they decide — not only from the gear box below.
  const taggedBody = enforceAmazonTags(renderSections(post.sections), affCfg).html;
  const bodyHtml = linkProductMentions(taggedBody, affCfg, { max: 5 }).html;

  const faqJsonLd = faqs.map(f => `    {
      "@type": "Question",
      "name": ${JSON.stringify(stripTags(f.q))},
      "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(stripTags(f.a))} }
    }`).join(',\n');

  const relatedHtml = related.map(r =>
    `      <a class="related-card" href="${r.slug}.html"><span>${esc(String(r.tag || '').split('·')[0].trim())}</span>${esc(r.title)}</a>`
  ).join('\n');

  const faqItemsHtml = faqs.map(f => `      <div class="faq-item">
        <h3>${esc(f.q)}</h3>
        <p>${f.a}</p>
      </div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(brandTitle(title))}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:image" content="${photoUrl}" />
  <meta property="og:image:width" content="${photo.width}" />
  <meta property="og:image:height" content="${photo.height}" />
  <meta property="og:image:alt" content="${esc(photo.alt_en)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${photoUrl}" />
  <link rel="stylesheet" href="blog.css?v=20261005" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(title)},
    "description": ${JSON.stringify(description)},
    "author": { "@type": "Person", "@id": "${SITE_URL}/#carlos", "name": ${JSON.stringify(author)}, "url": "${SITE_URL}/", "sameAs": ${JSON.stringify(AUTHOR_SAMEAS)} },
    "publisher": { "@type": "Organization", "name": "RealIRacing", "url": "${SITE_URL}" },
    "mainEntityOfPage": "${url}",
    "image": ${JSON.stringify(photoUrl)},
    "datePublished": "${publishedISO}",
    "dateModified": "${publishedISO}"
  }
  </script>
  <script type="application/ld+json">
  ${JSON.stringify(breadcrumbLd(title, url))}
  </script>
${gearLd ? `  <script type="application/ld+json">
  ${JSON.stringify(gearLd)}
  </script>
` : ''}  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
${faqJsonLd}
    ]
  }
  </script>
</head>
<body>

  <nav>
    <a class="nav-logo" href="/">
      <svg class="nav-logo-wheel" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="18" stroke="#e8ff00" stroke-width="2.5"/>
        <circle cx="20" cy="20" r="11" fill="none" stroke="#2a2d35" stroke-width="7"/>
        <circle cx="20" cy="20" r="11" fill="none" stroke="#e8ff00" stroke-width="2" stroke-dasharray="14 56" stroke-dashoffset="-10"/>
        <line x1="20" y1="20" x2="7" y2="24" stroke="#e8ff00" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="20" y1="20" x2="33" y2="16" stroke="#e8ff00" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="20" y1="20" x2="20" y2="34" stroke="#e8ff00" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="20" cy="20" r="3" fill="#e8ff00"/>
      </svg>
      <span>Real</span>IRacing
    </a>
    <ul class="nav-links">
      <li><a href="/#media">Media</a></li>
      <li><a href="/#content">Content</a></li>
      <li><a class="active" href="/blog/">Blog</a></li>
      <li><a href="/gear.html">My Rig</a></li>
      <li><a href="/#platforms">Platforms</a></li>
      <li><a class="nav-cta" href="https://www.youtube.com/@realtape" target="_blank">Subscribe</a></li>
    </ul>
  </nav>

  <main class="article-wrap">
    <p class="section-label">${esc(tag)}</p>
    <h1>${esc(title)}</h1>
    <div class="article-meta">
      <span class="author"><a href="https://dongaston.com/" rel="noopener" style="color:inherit">${esc(author)}</a></span>
      <span class="dot">·</span>
      <span>Updated ${esc(dateLabel)}</span>
      <span class="dot">·</span>
      <span>${esc(readTime)}</span>
      <span class="dot">·</span>
      <a class="meta-gear" href="#rir-gear">Gear picks ↓</a>
    </div>

${photos.figureHtml(photo)}

    <div class="article-body">
      <p class="disclosure">${PAGE_DISCLOSURE}</p>

${bodyHtml}

      ${gearBoxHtml}

      <div class="cta-box">
        <h3>Watch it, don't just read about it</h3>
        <p>I stream and upload iRacing races on my MOZA R9 rig — real laps, real force feedback, real mistakes. See the gear from this guide working before you spend a cent.</p>
        <a class="btn-primary" href="https://www.youtube.com/@realtape" target="_blank">▶ Subscribe on YouTube</a>
      </div>

      <h2>FAQ</h2>

${faqItemsHtml}
    </div>
  </main>

  <div class="related">
    <h2>Keep reading</h2>
    <div class="related-grid">
${relatedHtml}
    </div>
  </div>

  <footer>
    <p>© 2026 RealIRacing · iRacing User: <strong>Carlos Martinez9</strong> · Built with 🏎️</p>
    <p style="margin-top:6px;font-size:0.78rem;">
      <a href="/">Home</a> · <a href="/blog/">Blog</a> ·
      <a href="https://realiracing.com/go/" target="_blank">realiracing.com/go</a> · <a href="/privacy.html">Privacy</a>
    </p>
    <p class="dg-credit" style="margin-top:8px;font-size:0.78rem;text-align:center">A <a href="https://dongaston.com/" rel="noopener" style="color:inherit;text-decoration:underline">Don Gast&oacute;n</a> company</p>
  <div class="nwm-credit" style="flex:1 1 100%;width:100%;box-sizing:border-box;margin-top:14px;padding-top:10px;border-top:1px solid rgba(128,128,128,.25);font-size:12px;line-height:1.6;text-align:center;opacity:1">Made by <a href="https://netwebmedia.com/?utm_source=realiracing&amp;utm_medium=footer&amp;utm_campaign=made-by" rel="noopener" style="color:inherit;text-decoration:underline">NetWebMedia</a> · est. 2006 · <a class="nwm-credit-cta" href="https://netwebmedia.com/free-audit.html?utm_source=realiracing&amp;utm_medium=footer&amp;utm_campaign=made-by" rel="noopener" style="color:inherit;font-weight:600;text-decoration:underline;white-space:nowrap">Want a site like this? Get a free audit →</a></div>
  </footer>

  <script src="/js/ga4.js" defer></script>
  <script src="/js/affiliates.js" defer></script>
  <script>
    window.addEventListener('DOMContentLoaded', function () {
      if (typeof renderGearBox === 'function') {
        renderGearBox('rir-gear', ${JSON.stringify(gearKeys)}, 'The gear in this guide');
      }
      if (window.RIR_AFF) { RIR_AFF.hydrateLinks(); }
    });
  </script>

</body>
</html>
`;
}

// ─── blog/index.html card rebuild ────────────────────────────────────────────
// Preserves the exact markup (and hand-picked emoji/gradient) of existing
// cards, and inserts new cards in the correct newest-first chronological
// position — it does NOT regenerate the whole grid from scratch, since the
// per-card emoji/color choices for the 14 hand-written posts aren't
// recoverable from the post HTML itself.
function buildCardHtml(post) {
  const style = CARD_STYLES[hash(post.slug) % CARD_STYLES.length];
  // The banner keeps its per-post tint, but the emoji is replaced by the
  // article's own picture — the emoji pool had fourteen entries for thirty-one
  // posts, so cards repeated each other on sight.
  const photo = photos.photoFor(post);
  return `<a class="blog-card" href="${post.slug}.html">
      <div class="blog-card-banner" style="background:linear-gradient(135deg,rgba(${style.rgb},.10),rgba(0,0,0,.4));">
        <img class="blog-card-photo" src="${esc(photos.smFile(photo.file))}" width="${photo.sm_width || 560}" height="${photo.sm_height || 315}" alt="${esc(photo.alt_en)}" loading="lazy" decoding="async">
        <div class="blog-card-cat">${esc(post.tag || '')}</div>
      </div>
      <div class="blog-card-body">
        <h2>${esc(post.title)}</h2>
        <p>${esc(post.description)}</p>
        <div class="blog-card-meta"><strong>${esc(post.author || 'Carlos Martinez')}</strong> · ${esc(shortDateLabel(post.dateLabel))} · ${esc(readTimeShort(post.readTime))}</div>
      </div>
    </a>`;
}

// Card data for an already-published post, read back out of its own HTML. Used
// to put posts that fell off the index back on it (see rebuildBlogIndex).
function readPublishedCardMeta(slug) {
  const html = fs.readFileSync(path.join(BLOG_DIR, slug + '.html'), 'utf8');
  const pick = (re) => unescapeHtml(((html.match(re) || [, ''])[1] || '').trim());
  const meta = html.match(/<div class="article-meta">([\s\S]*?)<\/div>/);
  const spans = meta
    ? [...meta[1].matchAll(/<span(?: class="author")?>([\s\S]*?)<\/span>/g)].map(m => stripTags(m[1]).trim()).filter(t => t && t !== '·')
    : [];
  const updated = spans.find(t => /^Updated /.test(t)) || '';
  const readTime = spans.find(t => /read$/i.test(t)) || '';
  return {
    slug,
    title: pick(/<h1>([\s\S]*?)<\/h1>/),
    tag: pick(/<p class="section-label">([^<]*)<\/p>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    author: spans[0] || 'Carlos Martinez',
    dateLabel: updated.replace(/^Updated /, ''),
    readTime,
  };
}

function rebuildBlogIndex(newPosts, opts) {
  const idxPath = path.join(BLOG_DIR, 'index.html');
  if (!fs.existsSync(idxPath)) return false;
  let html = fs.readFileSync(idxPath, 'utf8');

  const cardRe = /<a class="blog-card" href="([^"]+)">[\s\S]*?<\/a>/g;
  let m;
  const existing = [];
  while ((m = cardRe.exec(html))) {
    const block = m[0];
    const slug = m[1].replace(/\.html$/, '');
    const dateMatch = block.match(/<strong>[^<]*<\/strong>\s*·\s*([A-Za-z]{3,9}\.?\s+\d{1,2},\s*\d{4})/);
    const d = dateMatch ? new Date(dateMatch[1]) : new Date(0);
    existing.push({ slug, html: block, date: isNaN(d) ? new Date(0) : d });
  }

  const newSlugs = new Set(newPosts.map(p => p.slug));
  const added = newPosts.map(post => ({
    slug: post.slug,
    html: buildCardHtml(post),
    date: new Date(post.published || Date.now())
  }));

  // Self-heal: any published post with no card on the index gets one. The grid
  // regex below stopped matching when a </main> landed between the grid and the
  // footer, so for weeks every publish logged "grid marker not found", left the
  // index unchanged and returned - and 12 posts, four of them buyer's guides,
  // never got a card or a crawlable link from /blog/.
  const have = new Set(existing.map(e => e.slug).concat([...newSlugs]));
  const orphans = fs.readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => f.replace(/\.html$/, ''))
    .filter(slug => !have.has(slug));
  for (const slug of orphans) {
    const meta = readPublishedCardMeta(slug);
    if (!meta.title) continue;
    const d = new Date(meta.dateLabel);
    added.push({ slug, html: buildCardHtml(meta), date: isNaN(d) ? new Date(0) : d });
    console.log('  index: restored card for ' + slug);
  }
  if (!added.length && !(opts && opts.force)) return false;

  const all = existing.filter(e => !newSlugs.has(e.slug))
    .concat(added)
    .sort((a, b) => b.date - a.date);

  const cardsHtml = all.map(c => '    ' + c.html).join('\n\n');

  const rebuilt = html.replace(
    /(<div class="blog-grid">)[\s\S]*?(\n\s*<\/div>\s*\n\s*(?:<\/main>\s*\n\s*)?<footer>)/,
    (_, g1, g2) => g1 + '\n\n' + cardsHtml + '\n\n' + g2
  );

  if (rebuilt === html) {
    console.warn('  Warning: blog/index.html grid marker not found — index left unchanged.');
    return false;
  }
  fs.writeFileSync(idxPath, rebuilt);
  return true;
}

// ─── sitemap.xml update ───────────────────────────────────────────────────────
function updateSitemap(newPosts) {
  const smPath = 'sitemap.xml';
  if (!fs.existsSync(smPath) || !newPosts.length) return false;
  let xml = fs.readFileSync(smPath, 'utf8');
  const today = new Date().toISOString().slice(0, 10);

  xml = xml.replace(
    /(<loc>https:\/\/realiracing\.com\/blog\/<\/loc>\s*<lastmod>)[^<]*(<\/lastmod>)/,
    `$1${today}$2`
  );

  const newEntries = newPosts.map(post => `  <url>
    <loc>${SITE_URL}/blog/${post.slug}.html</loc>
    <lastmod>${post.published}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

  if (!xml.includes('</urlset>')) return false;
  xml = xml.replace('</urlset>', newEntries + '\n</urlset>');
  fs.writeFileSync(smPath, xml);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
if (!fs.existsSync(QUEUE_DIR)) {
  console.log('no queue dir:', QUEUE_DIR);
  process.exit(0);
}

if (process.argv.includes('--reindex')) {
  // Index repair only: no queue is read and nothing is published.
  console.log(rebuildBlogIndex([], { force: true }) ? 'Updated blog/index.html.' : 'blog/index.html unchanged.');
  process.exit(0);
}

const pending = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).sort();
const allowedGearKeys = loadAllowedGearKeys();
const existingPosts = scanExistingPosts(); // grows in-memory as we render, so
                                            // later posts in the same run can
                                            // reference earlier ones too.

let rendered = 0;
const renderedPosts = [];
for (const f of pending) {
  if (rendered >= LIMIT) break;
  const srcPath = path.join(QUEUE_DIR, f);
  let post;
  try {
    post = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  } catch (e) {
    console.error(`  Skipping ${f}: invalid JSON (${e.message})`);
    continue;
  }
  if (!post || !post.slug || !post.title || !Array.isArray(post.sections)) {
    console.warn(`  Skipping ${f}: missing required fields (slug/title/sections).`);
    continue;
  }

  const clamped = clampPublishedToToday(post);

  const related = pickRelated(existingPosts, post.slug, post.tag, 3);
  const html = renderPostHtml(post, related, allowedGearKeys);
  fs.writeFileSync(path.join(BLOG_DIR, post.slug + '.html'), html);

  existingPosts.push({ slug: post.slug, title: post.title, tag: post.tag });

  const destPath = path.join(PUBLISHED_DIR, f);
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  if (clamped) {
    // Keep the archived JSON truthful too — it is what gets re-rendered from.
    const raw = fs.readFileSync(srcPath, 'utf8')
      .replace(/"published":\s*"[^"]*"/, `"published": "${post.published}"`)
      .replace(/"dateLabel":\s*"[^"]*"/, `"dateLabel": "${post.dateLabel}"`);
    fs.writeFileSync(destPath, raw);
    fs.unlinkSync(srcPath);
  } else {
    fs.renameSync(srcPath, destPath);
  }

  renderedPosts.push(post);
  rendered++;
  console.log(`+ ${post.slug} [gear: ${(post.gearKeys || FALLBACK_GEAR_KEYS).join(', ')}]`);
}
console.log(`Rendered ${rendered} post(s).`);

if (rendered > 0) {
  const idxOk = rebuildBlogIndex(renderedPosts);
  const smOk = updateSitemap(renderedPosts);
  console.log(idxOk ? 'Updated blog/index.html.' : 'blog/index.html not updated.');
  console.log(smOk ? 'Updated sitemap.xml.' : 'sitemap.xml not updated.');
  try { require('./build-aeo.js').build(); } catch (e) { console.warn('build-aeo failed (non-fatal):', e.message); }
} else {
  console.log('Nothing to render.');
}

/* Cron/CI example — publish 2 posts per fire, a few times a day:
     node _deploy/generate-blogs.js --limit 2
*/
