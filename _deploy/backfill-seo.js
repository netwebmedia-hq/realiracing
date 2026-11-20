// _deploy/backfill-seo.js
//
// Idempotent sitewide pass for the 2026-10-05 competitive-report backlog.
// New posts get the same things straight from generate-blogs.js; this brings
// the posts that already exist up to the same shape.
//
//   node _deploy/backfill-seo.js            # write changes
//   node _deploy/backfill-seo.js --dry-run  # report only
//
// Per blog post:
//   1. BreadcrumbList JSON-LD (Home > Blog > post)
//   2. Article author: @id + url + sameAs (real public profiles) so it merges with
//      the homepage Person
//   3. ItemList of schema.org Product entries built from the post's gear box
//      (no offers, prices, ratings or reviews: none exist as real data)
//   4. gear box rendered as a comparison table (_deploy/lib/affiliates-ssr.js);
//      Associates tag, data-aff and rel="sponsored noopener" are unchanged
//   5. hero photo: fetchpriority=high + srcset (560w / 1000w)
//   6. posts that cover a track or car the channel has a live stream for get a
//      lite YouTube embed + VideoObject (real ids/dates/durations, see VIDEOS)
//   7. blog.css cache-buster bumped so the new component styles reach readers
// Plus BreadcrumbList on blog/index.html and gear.html, and Product items in
// gear.html's ItemList.

const fs = require('fs');
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { loadAffiliateConfig, renderGearBoxHtml, gearItemListLd, esc } = require('./lib/affiliates-ssr.js');

const DRY = process.argv.includes('--dry-run');
const SITE = 'https://realiracing.com';
const CSS_V = '20261005';
const AUTHOR_SAMEAS = ['https://www.youtube.com/@realtape', 'https://www.instagram.com/realiracing'];

const cfg = loadAffiliateConfig();
if (!Object.keys(cfg.products).length) { console.error('FATAL: 0 products parsed'); process.exit(1); }

/* Live streams on @realtape. Ids, titles, durations and upload dates were read from
 * the public watch pages on 2026-10-05; titles match the ones the homepage already
 * shows next to each thumbnail. */
const VIDEOS = {
  vPj0IvaQiR8: { title: 'iRacing Live — 2025 Season 4 Week 12 · Imola & Mt Panorama', uploaded: '2025-12-03T17:59:38-08:00', duration: 'PT106M30S' },
  AXtlTyr16_w: { title: 'iRacing Live — 2025 Season 1 Week 9 Daytona Special', uploaded: '2025-02-15T21:15:03-08:00', duration: 'PT289M50S' },
  lfrYhZjowhU: { title: 'iRacing Live — DOF Reality Dallara F3 Series · Silverstone', uploaded: '2024-01-10T00:33:10-08:00', duration: 'PT222M25S' },
  n4OH2fK6svg: { title: 'iRacing Live — 2025 Winter NASCAR Series · Talladega', uploaded: '2025-02-01T06:27:15-08:00', duration: 'PT23M35S' },
  '_T_3I-ftYtI': { title: 'iRacing Live — Daily Ranked Races · Season 4 Week 3 (Nürburgring · BMW M4 GT4)', uploaded: '2024-09-25T17:22:35-07:00', duration: 'PT5M1S' },
};

const VIDEO_POSTS = {
  'bathurst-iracing-guide': 'vPj0IvaQiR8',
  'imola-iracing-guide-kerbs-chicanes-braking': 'vPj0IvaQiR8',
  'daytona-superspeedway-drafting-guide': 'AXtlTyr16_w',
  'daytona-road-course-iracing-guide': 'AXtlTyr16_w',
  'silverstone-iracing-guide': 'lfrYhZjowhU',
  'nascar-cup-next-gen-iracing-guide': 'n4OH2fK6svg',
  'nurburgring-gp-iracing-guide': '_T_3I-ftYtI',
  'bmw-m4-gt4-iracing-guide': '_T_3I-ftYtI',
};

const photos = JSON.parse(fs.readFileSync('assets/photos/credits.json', 'utf8'));
const photoByFile = new Map(photos.map((p) => [p.file, p]));

const ldBlock = (obj) => `  <script type="application/ld+json">\n  ${JSON.stringify(obj)}\n  </script>\n`;

function breadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}

function videoLd(id) {
  const v = VIDEOS[id];
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: v.title,
    description: `${v.title}. Live iRacing stream from the @realtape YouTube channel.`,
    thumbnailUrl: [`https://img.youtube.com/vi/${id}/hqdefault.jpg`],
    uploadDate: v.uploaded,
    duration: v.duration,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    publisher: { '@type': 'Organization', name: 'RealIRacing', url: `${SITE}/` },
  };
}

function videoSection(id) {
  const v = VIDEOS[id];
  return `      <h2>Watch it on track</h2>
      <div class="lite-yt" data-video-id="${id}">
        <a class="lite-yt-link" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" data-title="${esc(v.title)}">
          <img src="https://img.youtube.com/vi/${id}/hqdefault.jpg" width="480" height="360" alt="${esc(v.title)}" loading="lazy" decoding="async">
          <span class="lite-yt-play" aria-hidden="true"></span>
          <span class="lite-yt-label">&#9654; Play: ${esc(v.title)}</span>
        </a>
      </div>
      <p class="video-note">A full live stream from the @realtape channel. The video loads from YouTube (privacy-enhanced mode) only when you press play.</p>

`;
}

function patchPost(file) {
  const slug = file.replace(/\.html$/, '');
  const url = `${SITE}/blog/${file}`;
  const original = fs.readFileSync(path.join('blog', file), 'utf8');
  const nl = original.includes('\r\n') ? '\r\n' : '\n';
  let html = original.replace(/\r\n/g, '\n');
  const notes = [];

  const title = (html.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1];
  if (!title) return null;
  const plainTitle = title.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

  // 1. Breadcrumb
  if (!html.includes('"BreadcrumbList"')) {
    html = html.replace('</head>', ldBlock(breadcrumb([['Home', `${SITE}/`], ['Blog', `${SITE}/blog/`], [plainTitle, url]])) + '</head>');
    notes.push('breadcrumb');
  }

  // 2. Author entity
  const authorRe = /"author":\s*\{\s*"@type":\s*"Person",\s*"name":\s*("[^"]*"),\s*"url":\s*"[^"]*"\s*\}/;
  if (authorRe.test(html) && !html.includes('"sameAs": ["https://www.youtube.com/@realtape"')) {
    html = html.replace(authorRe, (_m, name) =>
      `"author": { "@type": "Person", "@id": "${SITE}/#carlos", "name": ${name}, "url": "${SITE}/", "sameAs": ${JSON.stringify(AUTHOR_SAMEAS)} }`);
    notes.push('author sameAs');
  }

  // 3 + 4. Gear box -> table, and ItemList of Product
  const boxRe = /<div id="rir-gear"><div class="gear-box">[\s\S]*?<\/div><\/div>/;
  const box = html.match(boxRe);
  if (box) {
    const keys = [...box[0].matchAll(/data-aff="([a-z][a-z0-9-]*)"/g)].map((m) => m[1]).filter((k) => cfg.products[k]);
    const label = (box[0].match(/<span class="box-label">([^<]*)<\/span>/) || [])[1] || 'The gear in this guide';
    if (keys.length) {
      if (!box[0].includes('gear-table')) {
        html = html.replace(boxRe, () => renderGearBoxHtml(cfg, keys, label.replace(/&amp;/g, '&')));
        notes.push(`gear table x${keys.length}`);
      }
      if (!html.includes('"@type":"ItemList"')) {
        const ld = gearItemListLd(cfg, keys, url, label.replace(/&amp;/g, '&'));
        if (ld) { html = html.replace('</head>', ldBlock(ld) + '</head>'); notes.push('product ItemList'); }
      }
    }
  }

  // 5. Hero photo
  const heroRe = /<img src="(\/assets\/photos\/[^"]+\.jpg)" width="(\d+)" height="(\d+)" alt="([^"]*)" loading="eager" decoding="async">/;
  const hero = html.match(heroRe);
  if (hero) {
    const ph = photoByFile.get(hero[1]);
    const srcset = ph && ph.sm_width && ph.sm_width < ph.width
      ? ` srcset="${hero[1].replace(/\.jpg$/, '-sm.jpg')} ${ph.sm_width}w, ${hero[1]} ${ph.width}w" sizes="(max-width: 760px) 100vw, 712px"` : '';
    html = html.replace(heroRe, `<img src="${hero[1]}" width="${hero[2]}" height="${hero[3]}" alt="${hero[4]}"${srcset} loading="eager" fetchpriority="high" decoding="async">`);
    notes.push('hero priority');
  }

  // 6. Lite YouTube embed + VideoObject
  const vid = VIDEO_POSTS[slug];
  if (vid && !html.includes('lite-yt')) {
    if (html.includes('<div class="cta-box">')) {
      html = html.replace('<div class="cta-box">', () => videoSection(vid) + '      <div class="cta-box">');
      html = html.replace('</head>', ldBlock(videoLd(vid)) + '</head>');
      html = html.replace('<script src="/js/ga4.js" defer></script>', '<script src="/js/ga4.js" defer></script>\n  <script src="/js/lite-yt.js" defer></script>');
      notes.push(`video ${vid}`);
    }
  }

  // 7. CSS cache-buster
  html = html.replace(/blog\.css\?v=\d{8}/, `blog.css?v=${CSS_V}`);

  html = html.replace(/\n/g, nl);
  if (html === original) return null;
  if (!DRY) fs.writeFileSync(path.join('blog', file), html);
  return notes;
}

let changed = 0;
for (const f of fs.readdirSync('blog').filter((x) => x.endsWith('.html') && x !== 'index.html').sort()) {
  const n = patchPost(f);
  if (n) { changed++; console.log(`  ${DRY ? 'would patch' : 'patched'} ${f} — ${n.join(', ') || 'css version'}`); }
}

function patchFile(file, fn) {
  const original = fs.readFileSync(file, 'utf8');
  const nl = original.includes('\r\n') ? '\r\n' : '\n';
  const out = fn(original.replace(/\r\n/g, '\n')).replace(/\n/g, nl);
  if (out !== original) {
    if (!DRY) fs.writeFileSync(file, out);
    console.log(`  ${DRY ? 'would patch' : 'patched'} ${file}`);
    changed++;
  }
}

// Blog index
patchFile('blog/index.html', (html) => {
  if (html.includes('"BreadcrumbList"')) return html;
  return html.replace('</head>', ldBlock(breadcrumb([['Home', `${SITE}/`], ['Blog', `${SITE}/blog/`]])) + '</head>');
});

// Gear page: breadcrumb, Product items, lite embed
patchFile('gear.html', (html) => {
  if (!html.includes('"BreadcrumbList"')) {
    html = html.replace('</head>', ldBlock(breadcrumb([['Home', `${SITE}/`], ['My Rig', `${SITE}/gear.html`]])) + '</head>');
  }
  if (!html.includes('"@type": "Product"') && !html.includes('"@type":"Product"')) {
    // Pair each ItemList name with the product key whose rig card carries it.
    const byName = new Map(Object.entries(cfg.products).map(([k, p]) => [p.name.replace(/\s+/g, ' '), k]));
    const rigCards = [...html.matchAll(/<h3>([^<]+)<\/h3>[\s\S]*?<p>([^<]*)<\/p>[\s\S]*?data-aff="([a-z0-9-]+)"/g)];
    const info = new Map(rigCards.map((m) => [m[3], { name: m[1].replace(/&amp;/g, '&'), desc: m[2].replace(/&amp;/g, '&').trim() }]));
        const keys = Object.keys(info);
    if (keys.length) {
      const list = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'RealIRacing Sim Racing Rig',
        description: 'The hardware Carlos Martinez races and streams iRacing on.',
        itemListElement: keys.map((k, i) => {
          const entry = { '@type': 'ListItem', position: i + 1, name: cfg.products[k] ? cfg.products[k].name : info.get(k).name, url: `${SITE}/gear.html` };
          if (info.get(k).desc) entry.description = info.get(k).desc;
          return entry;
        }),
      };
      html = html.replace(/  <script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema.org",\s*"@type": "ItemList",[\s\S]*?<\/script>\n/, () => ldBlock(list));
    }
  }
  if (!html.includes('lite-yt')) {
    const id = 'vPj0IvaQiR8';
    html = html.replace('      <div class="cta-box">\n        <h3>See this rig on track</h3>', () => videoSection(id) + '      <div class="cta-box">\n        <h3>See this rig on track</h3>');
    html = html.replace('</head>', ldBlock(videoLd(id)) + '</head>');
    html = html.replace('<script src="/js/ga4.js" defer></script>', '<script src="/js/ga4.js" defer></script>\n  <script src="/js/lite-yt.js" defer></script>');
  }
  return html.replace(/blog\.css\?v=\d{8}/, `blog.css?v=${CSS_V}`);
});


// ── Homepage ────────────────────────────────────────────────────────────────
// Guide + gear hub above the social wall: a clear primary CTA, "start here"
// guide cards, a wheel/wheelbase ladder (same data as the blog gear boxes), and
// the newest live stream as a lite embed. Social stays where it is, lower down.
const HOME_GUIDES = [
  ['iracing-force-feedback-explained', 'Force feedback', 'iRacing Force Feedback Explained', 'How the FFB signal really works and which sliders matter.'],
  ['moza-r9-iracing-settings', 'Setup guide', 'MOZA R9 iRacing Settings', 'The Pit House and in-sim values from a real R9 owner.'],
  ['best-sim-racing-wheels-iracing', "Buyer's guide", 'Best Sim Racing Wheels for iRacing', 'From budget gear and belt drive to direct drive, tier by tier.'],
  ['best-sim-racing-pedals-iracing-2026', "Buyer's guide", 'Best Sim Racing Pedals for iRacing', 'The load cell guide: why pressure-based braking protects your Safety Rating.'],
  ['iracing-starter-setup-guide-2026', 'Beginners', 'The Complete iRacing Starter Setup', 'What to buy first, first-week FFB settings and common mistakes.'],
  ['iracing-safety-rating-guide', 'Racecraft', 'iRacing Safety Rating Explained', 'Corners per incident, promotion thresholds and the road to an A license.'],
];
const HOME_LADDER = ['logitech-g923', 'thrustmaster-t300', 'moza-r5', 'fanatec-csl-dd', 'moza-r9', 'moza-r12', 'fanatec-clubsport-dd'];
const HOME_VIDEO = 'vPj0IvaQiR8';

const HOME_CSS = `
    /* ── Start here / gear ladder / lite video (added 2026-10-05) ── */
    #start { padding-top: 64px; padding-bottom: 24px; }
    .start-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 28px; }
    .start-card { display: block; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 22px; color: var(--text); text-decoration: none; transition: border-color .2s, transform .2s; }
    .start-card:hover, .start-card:focus-visible { border-color: var(--accent); transform: translateY(-3px); }
    .start-card .start-tag { display: block; font-size: 0.7rem; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); margin-bottom: 6px; }
    .start-card strong { display: block; font-size: 1.05rem; margin-bottom: 6px; }
    .start-card span.start-desc { color: var(--muted); font-size: 0.9rem; }
    #ladder { padding-top: 24px; padding-bottom: 24px; }
    #ladder .gear-box { background: rgba(232,255,0,.05); border: 1px solid rgba(232,255,0,.3); border-radius: var(--radius); padding: 22px 24px; margin-top: 24px; }
    #ladder .box-label { display: block; margin-bottom: 10px; font-size: 0.72rem; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); }
    #ladder .table-scroll { overflow-x: auto; }
    #ladder .gear-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    #ladder .gear-table th, #ladder .gear-table td { text-align: left; padding: 10px 12px; vertical-align: top; border-bottom: 1px solid rgba(232,255,0,.15); }
    #ladder .gear-table thead th { color: var(--muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; }
    #ladder .gear-table tbody th { font-weight: 700; min-width: 11em; }
    #ladder .gear-table tbody th a { color: var(--accent2); }
    #ladder .gear-table td { color: #d4d4d4; }
    #ladder .gear-table tr:last-child th, #ladder .gear-table tr:last-child td { border-bottom: 0; }
    #ladder .aff-note { font-size: 0.72rem; color: var(--muted); margin-top: 14px; padding-top: 10px; border-top: 1px solid rgba(232,255,0,.15); }
    .rig-badge { display: inline-block; white-space: nowrap; font-size: 0.7rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; padding: 3px 9px; border-radius: 999px; background: var(--accent); color: #0b0c0f; }
    .rig-badge--rec { background: transparent; color: var(--muted); border: 1px solid var(--border); }
    #watch { padding-top: 24px; padding-bottom: 40px; }
    .lite-yt { position: relative; aspect-ratio: 16 / 9; margin: 22px 0 8px; border-radius: var(--radius); overflow: hidden; background: #000; border: 1px solid var(--border); max-width: 860px; }
    .lite-yt .lite-yt-link { display: block; width: 100%; height: 100%; position: relative; color: #fff; text-decoration: none; }
    .lite-yt img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .lite-yt .lite-yt-play { position: absolute; left: 50%; top: 50%; width: 68px; height: 48px; margin: -24px 0 0 -34px; border-radius: 12px; background: rgba(0,0,0,.72); }
    .lite-yt .lite-yt-play::after { content: ''; position: absolute; left: 27px; top: 14px; border-style: solid; border-width: 10px 0 10px 18px; border-color: transparent transparent transparent #fff; }
    .lite-yt .lite-yt-link:hover .lite-yt-play, .lite-yt .lite-yt-link:focus-visible .lite-yt-play { background: #f00; }
    .lite-yt .lite-yt-label { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 14px 10px; font-size: 0.85rem; font-weight: 600; background: linear-gradient(transparent, rgba(0,0,0,.85)); }
    .lite-yt iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    .video-note { font-size: 0.82rem; color: var(--muted); }
    a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
`;

function homeSection() {
  const guides = HOME_GUIDES.map(([slug, tag, title, desc]) =>
    `        <a class="start-card" href="/blog/${slug}.html"><span class="start-tag">${esc(tag)}</span><strong>${esc(title)}</strong><span class="start-desc">${esc(desc)}</span></a>`).join('\n');
  const ladder = renderGearBoxHtml(cfg, HOME_LADDER, 'Wheel and wheelbase ladder, entry to high end').replace('<div id="rir-gear">', '<div id="rir-ladder">');
  return `<!-- seo:start-here:begin -->
  <section id="start" aria-labelledby="start-h">
    <p class="section-label">Start here</p>
    <h2 id="start-h">iRacing guides and gear, from a driver who races them</h2>
    <p class="section-sub">Written guides on force feedback, setup, buying and racecraft, tested on the same MOZA R9 rig you see on the channel.</p>
    <div class="start-grid">
${guides}
    </div>
    <p class="section-sub" style="margin-top:20px"><a href="/blog/" style="color:var(--accent2)">Browse every guide &rarr;</a></p>
  </section>

  <section id="ladder" aria-labelledby="ladder-h">
    <p class="section-label">Gear</p>
    <h2 id="ladder-h">Where to start on wheels and wheelbases</h2>
    <p class="section-sub">One table, tier by tier. Picks marked "Raced on" are on my own rig; the rest are researched recommendations. Full reviews are in the <a href="/blog/best-sim-racing-wheels-iracing.html" style="color:var(--accent2)">wheel buyer's guide</a>.</p>
    ${ladder}
  </section>

  <section id="watch" aria-labelledby="watch-h">
    <p class="section-label">Watch</p>
    <h2 id="watch-h">Latest live race on the channel</h2>
    <div class="lite-yt" data-video-id="${HOME_VIDEO}">
      <a class="lite-yt-link" href="https://www.youtube.com/watch?v=${HOME_VIDEO}" target="_blank" rel="noopener" data-title="${esc(VIDEOS[HOME_VIDEO].title)}">
        <img src="https://img.youtube.com/vi/${HOME_VIDEO}/hqdefault.jpg" width="480" height="360" alt="${esc(VIDEOS[HOME_VIDEO].title)}" loading="lazy" decoding="async">
        <span class="lite-yt-play" aria-hidden="true"></span>
        <span class="lite-yt-label">&#9654; Play: ${esc(VIDEOS[HOME_VIDEO].title)}</span>
      </a>
    </div>
    <p class="video-note">Full live stream from @realtape. YouTube loads (privacy-enhanced mode) only when you press play.</p>
  </section>
  <!-- seo:start-here:end -->
`;
}

patchFile('index.html', (html) => {
  // 1. Hero copy + single primary CTA
  if (!html.includes('data-seo-hero')) {
    html = html.replace(/<p>iRacing content from Carlos Martinez[^<]*<\/p>/, () =>
      '<p data-seo-hero>Honest iRacing setup guides, force feedback settings and gear picks from Carlos Martinez, tested on a real MOZA direct-drive rig. Real motorsport roots.</p>');
    html = html.replace(/<a class="btn-primary" href="https:\/\/www\.youtube\.com\/@realtape" target="_blank">[^<]*<\/a>\s*<a class="btn-ghost" href="#media">[^<]*<\/a>/, () =>
      '<a class="btn-primary" href="/blog/iracing-force-feedback-explained.html">Start with the FFB guide &rarr;</a>\n        <a class="btn-ghost" href="https://www.youtube.com/@realtape" target="_blank" rel="noopener">&#9654; Watch on YouTube</a>');
  }
  // 2. Start-here / ladder / watch sections after the stats bar
  if (!html.includes('seo:start-here:begin')) {
    html = html.replace('  <!-- ══ MEDIA GALLERY ══ -->', () => homeSection() + '\n  <!-- ══ MEDIA GALLERY ══ -->');
  }
  // 3. CSS
  if (!html.includes('Start here / gear ladder')) {
    html = html.replace('  </style>\n', () => HOME_CSS + '  </style>\n');
  }
  // 4. lite-yt.js
  if (!html.includes('/js/lite-yt.js')) {
    html = html.replace('<script src="/js/ga4.js" defer></script>', '<script src="/js/ga4.js" defer></script>\n  <script src="/js/lite-yt.js" defer></script>');
  }
  // 5. VideoObject graph for the streams shown on the page
  if (!html.includes('"@type":"VideoObject"')) {
    const ids = [...html.matchAll(/youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i && VIDEOS[v]);
    if (ids.length) {
      const graph = { '@context': 'https://schema.org', '@graph': ids.map((id) => { const o = videoLd(id); delete o['@context']; return o; }) };
      html = html.replace('</head>', () => ldBlock(graph) + '</head>');
    }
  }
  // 6. Person sameAs: add the Instagram account the posts already list
  html = html.replace('"sameAs": ["https://www.youtube.com/@realtape"]', '"sameAs": ["https://www.youtube.com/@realtape", "https://www.instagram.com/realiracing"]');
  return html;
});


// ── Accessibility pass (Lighthouse a11y was 86-91 on these pages) ──────────────
//  - footer credit line: opacity .8 pushed #888 on #0a0a0a to 3.9:1 (needs 4.5)
//  - posts + gear page: one <main> landmark around the article
//  - blog index: <main> landmark, card titles h3 -> h2 (heading order)
//  - homepage gear section: inline links get an underline (link-in-text-block)
function a11yFix(file, html) {
  html = html.replace(/(class="nwm-credit" style="[^"]*?)opacity:\.8"/g, '$1opacity:1"');

  const isPost = /^blog\/(?!index\.html$)[^/]+\.html$/.test(file);
  if ((isPost || file === 'gear.html') && html.includes('<div class="article-wrap">') && !html.includes('<main')) {
    html = html.replace('<div class="article-wrap">', '<main class="article-wrap">');
    html = html.replace(/\n  <\/div>(\s*\n\s*<div class="related">)/, '\n  </main>$1');
  }
  if (file === 'blog/index.html') {
    html = html.replace(/<h3>([^<]*)<\/h3>/g, '<h2>$1</h2>');
    if (!html.includes('<main')) {
      html = html.replace('  <div class="blog-hero">', '  <main>\n  <div class="blog-hero">');
      html = html.replace(/(\n  <\/div>)(\s*\n\s*<footer>)/, '$1\n  </main>$2');
    }
  }
  if (file === 'index.html') {
    html = html.replace(/(color:var\(--accent2\);)text-decoration:none;(">)/g, '$1text-decoration:underline;$2');
  }
  return html;
}

const A11Y_FILES = ['index.html', 'gear.html', '404.html', 'go/index.html', 'blog/index.html']
  .concat(fs.readdirSync('packs').filter((x) => x.endsWith('.html')).map((x) => `packs/${x}`))
  .concat(fs.readdirSync('blog').filter((x) => x.endsWith('.html') && x !== 'index.html').map((x) => `blog/${x}`));
for (const file of A11Y_FILES.filter((f) => fs.existsSync(f))) {
  patchFile(file, (html) => a11yFix(file, html));
}

console.log(`\n${DRY ? 'DRY RUN — ' : ''}${changed} file(s) ${DRY ? 'would change' : 'changed'}.`);
