#!/usr/bin/env node
/**
 * Blog queue integrity — run in deploy.yml before anything ships.
 *
 *   node _ci/validate-blog-queue.mjs                   # deploy.yml: low topic pool warns
 *   node _ci/validate-blog-queue.mjs --strict-topics   # generate-blog-queue.yml: low pool fails
 *
 * Three failures this catches, all of which have actually happened on one of
 * Don Gastón's blogs:
 *
 * 1. SUFFIXED TWINS. generate-post-queue.js used to auto-suffix a slug
 *    collision — -2, then -3, forever — and TOPIC_POOL wraps (`topicIdx = 0
 *    // cycle if needed`), so it was guaranteed to revisit covered ground. The
 *    monorepo cleared 18 of these by hand on 2026-08-25 after 7 auto-published.
 *    On an affiliate site a near-identical second page splits the ranking
 *    signal for the exact queries that earn the commission. The generator now
 *    drops collisions; this makes sure none reaches the site anyway.
 *
 * 2. TOPIC POOL EXHAUSTION. One post per topic means the supply is the topic
 *    count, not some combinatorial number. Golferos hit exactly this on
 *    2026-09-16: its run reported "0 combinaciones sin usar" and exited 1 with
 *    the queue already empty, and the only fix — writing new topics — needs a
 *    human. Nothing had counted the remainder until it was zero. This alerts
 *    with runway left instead.
 *
 *    It is an ALERT, not a deploy gate. A low pool is a problem for the NEXT
 *    generator run; deploy.yml only ships posts that are already written. On
 *    2026-10-12 this check failed deploy.yml at "~1 unused" and stranded both
 *    of that day's finished posts (24 committed since 10-01, 22 live, both
 *    URLs 404). Every later publish would have stranded more, and none of
 *    those deploys could have fixed the pool. So by default a low pool prints
 *    a ::warning:: annotation and a step-summary line, and the run passes.
 *    `--strict-topics` makes it an error. generate-blog-queue.yml runs it that
 *    way after it commits, so a low pool still turns a run red — the weekly
 *    run that is about to fall short, not the deploy.
 *
 * 3. MALFORMED QUEUE JSON. A post the renderer would crash on, or one with no
 *    sections, should not sit in the queue waiting to be published.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE = path.join(ROOT, '_deploy', 'posts-queue');
const PUBLISHED = path.join(QUEUE, '_published');
const BLOG = path.join(ROOT, 'blog');
const GENERATOR = path.join(ROOT, '_deploy', 'generate-post-queue.js');

/** Two posts per day is this site's cadence; a week of runway is the floor. */
const MIN_FREE_TOPICS = 14;

/** Low topic pool: error with this flag, warning without (see 2. above). */
const STRICT_TOPICS = process.argv.includes('--strict-topics');

const errors = [];
const warnings = [];
const notes = [];

// ─── 1. no suffixed twins, anywhere ──────────────────────────────────────────

const SUFFIXED = /-(\d+)$/;
const liveSlugs = fs.existsSync(BLOG)
  ? fs.readdirSync(BLOG).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.slice(0, -5))
  : [];

const queueSlugs = [];
for (const dir of [QUEUE, PUBLISHED]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let post;
    try {
      post = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) {
      errors.push(`${path.relative(ROOT, path.join(dir, f))}: not valid JSON — ${e.message}`);
      continue;
    }
    // 3. shape check, pending items only — _published is history, not a queue.
    if (dir === QUEUE) {
      if (!post.slug) errors.push(`${f}: no slug`);
      if (!Array.isArray(post.sections) || post.sections.length === 0) errors.push(`${f}: no sections — the renderer would emit an empty post`);
    }
    if (post.slug) queueSlugs.push(post.slug);
  }
}

for (const slug of [...new Set([...liveSlugs, ...queueSlugs])]) {
  const m = SUFFIXED.exec(slug);
  if (!m) continue;
  const base = slug.slice(0, -m[0].length);
  // A trailing number is only suspicious when the unsuffixed twin also exists
  // — "best-budget-sim-racing-wheel-2026" is a year, not a collision.
  if (liveSlugs.includes(base) || queueSlugs.includes(base)) {
    errors.push(`"${slug}" is a suffixed twin of "${base}" — drop it, never publish both`);
  }
}

// ─── 2. topic headroom ───────────────────────────────────────────────────────

const src = fs.readFileSync(GENERATOR, 'utf8');
const poolMatch = /const TOPIC_POOL = \[([\s\S]*?)\n\];/.exec(src);
if (!poolMatch) {
  errors.push('could not find TOPIC_POOL in _deploy/generate-post-queue.js');
} else {
  const topics = (poolMatch[1].match(/^\s*'(?:[^'\\]|\\.)*'/gm) || []).length;
  // Each published or live post consumed one topic. This is approximate — the
  // model picks its own slug, so a topic and its post do not share a key — but
  // the COUNT is exact, and the count is what runs out.
  const consumed = new Set([...liveSlugs, ...queueSlugs]).size;
  const free = topics - consumed;
  notes.push(`topic pool: ${topics} topics, ${consumed} posts already written, ~${free} unused`);
  if (free < MIN_FREE_TOPICS) {
    (STRICT_TOPICS ? errors : warnings).push(
      `only ~${free} unused topic(s) left (floor ${MIN_FREE_TOPICS}, ~7 days at 2/day). ` +
      'Add topics to TOPIC_POOL in _deploy/generate-post-queue.js covering subjects the ' +
      'corpus does not have yet — the generator drops a collision rather than suffixing it, ' +
      'so an exhausted pool means it silently writes nothing.'
    );
  }
}

// ─── report ──────────────────────────────────────────────────────────────────

for (const n of notes) console.log(`  ${n}`);
for (const w of warnings) {
  // GitHub Actions reads workflow commands from stdout. A warning shows on the
  // run page and in the PR checks without failing the job.
  console.log(`::warning title=Blog topic pool low::${w}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ⚠ Blog topic pool low\n\n${w}\n`);
  }
}
if (errors.length) {
  console.error(`\n✗ blog queue validation failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  warnings.length
    ? '✓ blog queue OK to ship — no suffixed twins, queue JSON is well-formed (topic pool LOW, see warning)'
    : '✓ blog queue OK — no suffixed twins, topic pool has runway, queue JSON is well-formed'
);
