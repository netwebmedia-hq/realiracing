// Cover pictures for the blog, with their credit.
//
// Sim racing hardware barely exists on Wikimedia Commons — there is no
// Category:Racing_wheels and no Category:Sim_racing_cockpits — so the pictures
// here are a mix: photographs of real motorsport and sim rigs under
// attribution-only licences, credited under the image because CC BY wants the
// attribution next to the work, and covers RealiRacing renders itself for the
// hardware tags where no honest photograph exists.
//
// This is a trimmed copy of _deploy/lib/blog-photos.js in the netwebmedia
// monorepo, which is where the registry is generated
// (`node _deploy/fetch-blog-photos.js --property realiracing`, with
// REALIRACING_ROOT pointing at a clone of this repo). Keep the two in step: if
// the caption format changes there, change it here too.

'use strict';

const fs = require('fs');
const path = require('path');

const REGISTRY = path.join(__dirname, '..', '..', 'assets', 'photos', 'credits.json');

let cache = null;
function registry() {
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    if (!Array.isArray(cache) || !cache.length) throw new Error('assets/photos/credits.json is empty');
  }
  return cache;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i += 1) h = (h * 31 + String(str).charCodeAt(i)) & 0x7fffffff;
  return h;
}

// Primero gana, de específico a genérico; el último es el comodín.
const TAG_RULES = [
  [/\b(pedals?|brake|load ?cell|throttle|heel ?toe)\b/i, 'pedals'],
  [/\b(wheels?|force ?feedback|ffb|direct ?drive|torque|rim)\b/i, 'wheel'],
  [/\b(cockpits?|rigs?|seats?|mounts?|desks?|wheel ?stand)\b/i, 'rig'],
  [/\b(vr|monitors?|triple|displays?|headsets?|fov|screens?)\b/i, 'display'],
  [/\b(setups?|settings?|tune|tuning|camber|spring|aero|lap ?times?|technique|racecraft|corner|track|circuit)\b/i, 'track'],
  [/.*/, 'sim'],
];

// Deterministic per slug: a re-render must not change the picture on a post
// that is already published.
function photoFor(post) {
  // Event posts use a frame of the owner's own footage, named for the post.
  const own = registry().find((p) => p.post_slug === post.slug);
  if (own) return own;
  const text =[post.title, post.description, post.tag, String(post.slug || '').replace(/-/g, ' ')]
    .filter(Boolean).join(' ');
  let tag = 'sim';
  for (const [re, value] of TAG_RULES) if (re.test(text)) { tag = value; break; }
  const pool = registry().filter((p) => p.tag === tag);
  const from = pool.length ? pool : registry();
  return from[hash(post.slug) % from.length];
}

const smFile = (file) => file.replace(/\.jpg$/, '-sm.jpg');
const ogImage = (photo, origin) => `${origin.replace(/\/$/, '')}${photo.file}`;

function creditHtml(photo) {
  if (photo.kind === 'own' || photo.kind === 'generated') {
    return `${photo.kind === 'own' ? 'Photo' : 'Illustration'}: ${esc(photo.author)}`;
  }
  const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener nofollow">${esc(text)}</a>`;
  const who = photo.author_url ? link(photo.author_url, photo.author) : esc(photo.author);
  return `Photo: ${who} · ${link(photo.license_url, photo.license)} · Source: ${link(photo.source, photo.source_name || 'Wikimedia Commons')}`;
}

/* The hero is the LCP element: fetchpriority=high, and srcset so a phone takes
 * the 560px file instead of the 1000px one (the article column is 712px wide at
 * most). AVIF/WebP are served by content negotiation in .htaccess. */
function figureHtml(photo, indent = '        ') {
  const srcset = photo.sm_width && photo.sm_width < photo.width
    ? ` srcset="${esc(smFile(photo.file))} ${photo.sm_width}w, ${esc(photo.file)} ${photo.width}w" sizes="(max-width: 760px) 100vw, 712px"`
    : '';
  return `${indent}<figure class="article-photo">
${indent}  <img src="${esc(photo.file)}" width="${photo.width}" height="${photo.height}" alt="${esc(photo.alt_en)}"${srcset} loading="eager" fetchpriority="high" decoding="async">
${indent}  <figcaption>${creditHtml(photo)}</figcaption>
${indent}</figure>`;
}

function thumbHtml(photo) {
  return `<span class="card-thumb"><img src="${esc(smFile(photo.file))}" width="${photo.sm_width || 560}" height="${photo.sm_height || 315}" alt="${esc(photo.alt_en)}" loading="lazy" decoding="async"></span>`;
}

module.exports = { registry, photoFor, figureHtml, thumbHtml, creditHtml, ogImage, smFile, esc };
