#!/usr/bin/env node
/**
 * The batch-reply parse contract — run in deploy.yml.
 *
 *   node _ci/validate-batch-parse.mjs
 *
 * generate-post-queue.js turns one API reply into posts. What the reply looks
 * like is not under our control, so this pins down which shapes must survive.
 *
 * WHY THIS EXISTS
 * ---------------
 * The 2026-09-16 run reported "the model wrote JSON that could not be parsed or
 * salvaged" on 11 of 31 calls — a third of the run's wall clock and spend, on
 * posts that had already been written. None of them were truncated: stop_reason
 * said so, which is why the error text distinguishes the two cases.
 *
 * They were BARE OBJECTS. BATCH_SIZE went 2 -> 1 the day before, so the prompt
 * began asking for "a JSON array of exactly 1 object", and a model handed that
 * instruction returns the object on its own a good fraction of the time. Both
 * layers then dropped it:
 *
 *   - JSON.parse() succeeded, but the `Array.isArray()` guard rejected the
 *     result and fell through.
 *   - salvageObjects() anchored its scan on the first `[`, which in a bare
 *     object is the "sections" field — so it scanned the inside of the post and
 *     returned section objects, none of which pass isUsablePost.
 *
 * A complete, paid-for post was thrown away by the code meant to rescue it.
 * The failure is invisible in aggregate: the run still ended 20/20, because the
 * loop just retried on the next topic.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// The real function the generator calls — NOT a re-implementation of it. An
// earlier draft of this file inlined its own copy of the contract and passed
// cleanly against a generator with the bug still in it.
const { isUsablePost, parseBatchReply } = require(path.join(ROOT, '_deploy', 'lib', 'salvage.js'));

const parseReply = (clean) => parseBatchReply(clean).posts;

const post = (slug) => ({
  slug,
  tag: 'Track Guide · Road',
  author: 'Carlos Martinez',
  readTime: '8 min read',
  title: `${slug}: what the first ten laps teach you`,
  description: 'A lap-by-lap read.',
  // The inner array is the point: it is what the old scan latched onto.
  sections: [{ p: 'Deceptive circuit.' }, { h2: 'The esses' }, { list: ['brake early', 'be patient'] }],
  faqs: [{ q: 'Beginner friendly?', a: 'Not especially.' }],
  gearKeys: ['moza-r9', 'moza-crp2'],
  published: '2026-09-16',
  dateLabel: 'September 16, 2026',
});

const one = post('okayama-iracing-guide');
const two = post('mid-ohio-iracing-guide');

const linked = { ...one, sections: [{ p: 'See <a href="okayama-iracing-guide.html">the Okayama guide</a> first.' }, ...one.sections] };

const cases = [
  ['array of one', JSON.stringify([one], null, 2), 1],
  ['array of two', JSON.stringify([one, two], null, 2), 2],
  ['bare object (the 2026-09-16 failure)', JSON.stringify(one, null, 2), 1],
  ['bare object wrapped in a ```json fence', '```json\n' + JSON.stringify(one) + '\n```', 1],
  ['bare object with prose in front of it', 'Here you go:\n' + JSON.stringify(one), 1],
  ['array truncated after the first post', JSON.stringify([one, two]).slice(0, -80), 1],
  // Salvage must not invent posts out of fragments. A reply truncated inside its
  // only post has no complete post in it, and reporting one would be worse than
  // reporting none — that is the max_tokens case, which has its own error text.
  ['bare object truncated mid-post yields nothing', JSON.stringify(one).slice(0, 300), 0],
  ['prose with no JSON at all yields nothing', 'I was unable to write these posts.', 0],
  // Inline HTML is allowed in "p", and the model writes href="..." unescaped.
  ['unescaped quotes in an inline link', JSON.stringify([linked]).replace(/\\"/g, '"'), 1],
];

const failures = [];
for (const [name, raw, expected] of cases) {
  let got;
  try {
    got = parseReply(raw).length;
  } catch (e) {
    failures.push(`${name}: threw ${e.message}`);
    continue;
  }
  if (got !== expected) failures.push(`${name}: expected ${expected} post(s), got ${got}`);
  else console.log(`  ✓ ${name} → ${got} post(s)`);
}

// Whatever comes back must be renderable, or the queue file poisons the build.
const salvagedBare = parseReply(JSON.stringify(one, null, 2));
if (!salvagedBare.every(isUsablePost)) failures.push('bare object: returned a post the renderer cannot use');
if (salvagedBare[0]?.slug !== one.slug) {
  failures.push(`bare object: expected the post itself, got slug "${salvagedBare[0]?.slug}" (a section object?)`);
}

// The route matters, not just the count. Both layers now rescue a bare object —
// the fast path in parseBatchReply and, since it learned to anchor on `{`, the
// salvage scan. That redundancy is deliberate, but only the fast path reports it
// honestly: `via: 'salvage'` makes the generator log "⚠ batch JSON was
// malformed", and a clean bare object is not malformed. Drop the fast path and
// every single-post run cries wolf.
const routes = [
  ['array of one', JSON.stringify([one]), 'array'],
  ['clean bare object', JSON.stringify(one), 'object'],
  ['truncated array', JSON.stringify([one, two]).slice(0, -80), 'salvage'],
  ['no JSON at all', 'sorry, nothing', 'none'],
  ['unescaped quotes', JSON.stringify([linked]).replace(/\\"/g, '"'), 'repair'],
];
for (const [name, raw, expected] of routes) {
  const via = parseBatchReply(raw).via;
  if (via !== expected) failures.push(`${name}: expected via "${expected}", got "${via}"`);
}

// ...and the generator must actually route through it, or everything above is
// testing a library the shipping code no longer calls.
const generatorSrc = fs.readFileSync(path.join(ROOT, '_deploy', 'generate-post-queue.js'), 'utf8');
if (!/parseBatchReply\s*\(/.test(generatorSrc)) {
  failures.push('generate-post-queue.js no longer calls parseBatchReply() — this file would be testing nothing');
}

// The repaired post must keep its link intact, not just parse.
const repaired = parseReply(JSON.stringify([linked]).replace(/\\"/g, '"'))[0];
if (repaired?.sections?.[0]?.p !== linked.sections[0].p) failures.push('unescaped quotes: repaired text differs from the original');

if (failures.length) {
  console.error(`\n✗ batch parse contract broken (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ batch parse OK — arrays, bare objects, fences and truncation all handled');
