#!/usr/bin/env node
// _deploy/generate-post-queue.js
// Auto-generates RealIRacing blog post JSON files using the Claude API.
//
// Usage:
//   node _deploy/generate-post-queue.js                    # generate 20 posts
//   node _deploy/generate-post-queue.js --count 40         # generate 40 posts
//   node _deploy/generate-post-queue.js --start-date 2026-08-01 --count 20
//
// Requires: CLAUDE_CODE_OAUTH_TOKEN (Claude subscription) or ANTHROPIC_API_KEY

const fs   = require('fs');
const path = require('path');
const { callClaude, claudeConfigured } = require('./lib/claude-call.js');
const { withHumanizeRules } = require('./lib/humanize-rules.js');
const { parseBatchReply } = require('./lib/salvage.js');

process.chdir(path.join(__dirname, '..'));

const QUEUE_DIR     = path.join('_deploy', 'posts-queue');
const PUBLISHED_DIR = path.join(QUEUE_DIR, '_published');
const MODEL         = 'claude-haiku-4-5-20251001';
// ONE post per API call (was 2).
//
// The 2026-09-16 run — the first time this generator had ever actually run —
// died on the job timeout with every generated post discarded, and the logs say
// why: "API request timed out after 90s", five times. Two 1200-1700 word posts
// with FAQ blocks do not come back inside 90 seconds, and each miss cost 90s
// plus another 90s on the retry. Roughly half the run's wall-clock was spent
// waiting on calls that were never going to land.
//
// Same lesson the monorepo's golferos and marpolis generators already carry:
// "ONE post per call — batching lands on the output ceiling and the model
// silently truncates. One post per call gives the full budget to one article.
// Costs the same per post; just more requests."
const BATCH_SIZE    = 1;
// Two 1200-1700 word posts with FAQ blocks do not reliably fit 8192; the reply
// stops mid-post and, before salvage existed below, took the whole batch with
// it. 16000 is roughly double what a batch actually costs and still safe for a
// non-streaming request. (Same change made in the monorepo's generator, #1175.)
const MAX_TOKENS    = 16000;

// ─── CLI args ────────────────────────────────────────────────────────────────

const args        = process.argv.slice(2);
const countArg     = args.indexOf('--count');
const dateArg      = args.indexOf('--start-date');
const TARGET       = countArg !== -1 ? parseInt(args[countArg + 1], 10) : 20;
const START_DATE   = dateArg  !== -1 ? new Date(args[dateArg + 1])     : new Date();

// ─── Affiliate gear key allowlist ────────────────────────────────────────────
// Parsed live from js/affiliates.js — same parser as generate-blogs.js — so
// the prompt always offers the model the real, current product key list.
function loadAllowedGearKeys() {
  const src = fs.readFileSync(path.join('js', 'affiliates.js'), 'utf8');
  const keys = [];
  const re = /'([a-z][a-z0-9-]*)':\s*\{\s*\r?\n\s*name:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(src))) keys.push({ key: m[1], name: m[2] });
  return keys;
}

// ─── Topic pool ──────────────────────────────────────────────────────────────
// Sim-racing buyer-intent, how-to and comparison topics — broad enough to
// cover 100+ unique posts without repetition. Deliberately avoids exact
// duplication of the hand-built posts already live in blog/ (wheel buyer's
// guides, MOZA R9 settings, R9 vs R12, R9 vs CSL DD, cockpit tiers, pedals,
// budget rig, safety rating, OBS streaming, VR vs triples, BMW M4 GT4,
// starter setup) — these topics take fresh angles instead.

const TOPIC_POOL = [
  // Wheelbases & wheels
  'entry direct drive wheelbases compared for first-time buyers',
  'when to upgrade from a belt-driven wheel to direct drive',
  'quick-release standards explained and why they matter',
  'wheel rim size and diameter for open-wheel racing',
  'servo vs direct drive: what the terminology actually means in 2026',
  'how torque rating relates to real-world sim racing feel',
  'used sim racing wheelbase buying guide: what to check',

  // Pedals & braking
  'heel-toe braking technique on a load cell pedal',
  'pedal spacing and angle setup for consistent braking',
  'hydraulic vs load cell pedals for iRacing',
  'clutch pedal setups for manual iRacing cars',
  'brake pedal calibration curves explained',

  // Cockpits & rig building
  'DIY sim racing rig vs buying a pre-built cockpit',
  'monitor stand vs triple monitor rig arm setups',
  'seat position and ergonomics for long endurance stints',
  'cable management for a multi-peripheral sim rig',
  'button box and handbrake add-ons for rally and drift',

  // FFB & settings
  'iRacing FFB clipping: how to diagnose and fix it',
  'in-car vs in-menu FFB adjustments explained',
  'damping and friction settings on direct drive wheels',
  'setting up FFB for rain and low-grip conditions',
  'why FFB feels different car to car in iRacing',

  // iRacing-specific tips / SR / iRating
  'iRacing license classes explained for new members',
  'how the iRacing multiplier affects rating gains',
  'reading incident points and what actually causes them',
  'best practices for iRacing qualifying sessions',
  'iRacing series selection guide by skill level',
  'understanding strength of field in iRacing',
  'team endurance racing on iRacing: getting started',

  // Streaming & content
  'multi-camera setups for sim racing streams',
  'overlay and HUD tools for iRacing streams',
  'growing a sim racing YouTube channel from zero',
  'microphone and audio setup for sim racing commentary',
  'editing iRacing race highlights for social media',

  // Car & discipline guides
  'oval racing fundamentals for road racers switching over',
  'rally cross and dirt disciplines on iRacing',
  'endurance racing fuel and tire strategy basics',
  'formula car vs GT car handling differences',
  'left-foot braking technique for advanced drivers',
  'wet weather driving technique in iRacing',

  // Displays & PC hardware
  'GPU upgrade guide specifically for sim racing frame rates',
  'CPU vs GPU bottlenecks in iRacing',
  'refresh rate and input lag for competitive sim racing',
  'VR headset comparison for PCVR sim racing in 2026',

  // Budget & buying strategy
  'building a sim rig incrementally without buyer\'s remorse',
  'secondhand sim racing gear: what to check before buying',
  'sim racing gear worth buying used vs new',
  'seasonal sales strategy for sim racing hardware purchases',

  // ─── Expansion 2026-09-16 ──────────────────────────────────────────────────
  // 48 topics against 74 published posts, in a loop that wraps with
  // `topicIdx = 0 // cycle if needed`. The pool was guaranteed to come back
  // around to ground already covered, and the collision handler above used to
  // turn that into <slug>-2. Dropping the twin is the fix for the symptom; this
  // is the fix for the cause.
  //
  // Weighted toward the two clusters the live corpus is actually built from and
  // the pool barely represented — TRACK guides (12 live) and CAR guides (11
  // live), which are also where the affiliate and search intent is — plus the
  // areas with no coverage at all: car setup, race craft, iRacing's own systems,
  // third-party software, and the body.

  // Track guides — iRacing staples with no post yet
  'le mans circuit de la sarthe iracing guide',
  'imola iracing guide: kerbs, chicanes and braking zones',
  'interlagos iracing guide: elevation and the senna S',
  'zandvoort iracing guide: banking and blind crests',
  'brands hatch grand prix iracing guide',
  'donington park iracing guide',
  'oulton park iracing guide',
  'circuit de barcelona-catalunya iracing guide',
  'red bull ring iracing guide',
  'hungaroring iracing guide',
  'laguna seca iracing guide: the corkscrew',
  'sonoma raceway iracing guide',
  'mid-ohio iracing guide',
  'lime rock park iracing guide',
  'virginia international raceway iracing guide',
  'okayama iracing guide',
  'tsukuba iracing guide',
  'fuji speedway iracing guide',
  'motegi iracing guide',
  'snetterton iracing guide',
  'charlotte motor speedway iracing oval guide',
  'bristol motor speedway iracing guide',
  'martinsville speedway iracing guide',
  'talladega superspeedway iracing guide',
  'phoenix raceway iracing guide',
  'richmond raceway iracing guide',
  'homestead-miami iracing oval guide',
  'iowa speedway iracing guide',
  'texas motor speedway iracing guide',
  'darlington raceway iracing guide',
  'indianapolis motor speedway iracing guide',

  // Car guides — no post yet
  'ferrari 296 gt3 iracing guide',
  'bmw m4 gt3 iracing guide',
  'chevrolet corvette c8.r gte iracing guide',
  'porsche 911 rsr iracing guide',
  'cadillac v-series.r gtp iracing guide',
  'acura arx-06 gtp iracing guide',
  'oreca 07 lmp2 iracing guide',
  'ligier js p320 lmp3 iracing guide',
  'radical sr10 iracing guide',
  'super formula sf23 iracing guide',
  'formula renault 2.0 iracing guide',
  'formula vee iracing beginner guide',
  'legends cars iracing beginner guide',
  'nascar truck series iracing guide',
  'nascar xfinity series iracing guide',
  'late model stock iracing guide',
  'dirt sprint car iracing beginner guide',
  'dirt late model iracing guide',
  'mercedes amg gt3 iracing guide',
  'lamborghini huracan gt3 evo iracing guide',
  'ford mustang gt3 iracing guide',
  'aston martin vantage gt4 iracing guide',
  'toyota gr supra gt4 iracing guide',
  'global mazda mx-5 vs gr86: which rookie car to pick',
  'lotus 79 and the historic formula cars on iracing',

  // Car setup — the pool had nothing on this at all
  'spring rates and ride height: what they actually change',
  'damper settings explained without the engineering degree',
  'anti-roll bars and how they shift the balance',
  'differential settings for corner entry and exit',
  'aero balance and downforce trade-offs by track type',
  'gearing: choosing ratios for a track you do not know',
  'camber and toe: reading tyre temps to set them',
  'baseline setups vs setup shops: when to stop fiddling',
  'why a fast setup can make you slower',
  'building your own setup from the iRacing baseline',

  // Race craft — beyond the overtaking/defending posts already live
  'blue flags and lapped traffic: doing it without losing time',
  'pit stop strategy: undercut, overcut and track position',
  'pit lane procedure and the penalties that catch people out',
  'spotter calls and what to actually listen for',
  'racing in the rain: the iRacing wet weather system explained',
  'cold tyres: the out-lap and the first two corners',
  'saving the car after a slide instead of spinning it',
  'consistency over pace: why lap-time spread wins races',
  'racing clean when the other driver is not',
  'when to pit under caution and when to stay out',

  // iRacing systems
  'the iRacing season structure and build updates explained',
  'the iRacing tyre model: what changed and what it means',
  'hosted sessions vs official races vs leagues',
  'time trials and time attack: racing against yourself',
  'the iRacing protest and sporting code process',
  'rookie to class D: the fastest legitimate route',
  'iRacing content strategy: which cars and tracks to buy first',
  'practice servers and how to use them properly',

  // Software and telemetry
  'crew chief: the free spotter everyone should be running',
  'simhub dashboards and what to put on them',
  'garage61 and telemetry comparison tools',
  'racelab overlays for iRacing',
  'reading a motec trace without an engineering background',
  'comparing your lap to a fast lap: what to look at first',

  // Hardware beyond the wheel and pedals
  'shifter choice: sequential, h-pattern and paddles',
  'handbrake setups for rally and drift on iRacing',
  'bass shakers and tactile feedback: worth it or gimmick',
  'motion rigs: what they add and what they cost',
  'wind simulators and the diminishing-returns problem',
  'direct drive wheelbase maintenance and firmware updates',
  'gloves for sim racing: grip, sweat and wheel wear',
  'monitor bezels, angles and field of view maths',
  'usb power, hubs and the peripheral dropout problem',

  // The body — nothing in the pool covered this
  'posture and back pain in a fixed cockpit',
  'wrist and forearm strain on a high-torque wheelbase',
  'eye strain and screen distance over long sessions',
  'stamina for endurance stints: the unglamorous half',
  'hydration and breaks during a two-hour race',

  // Tracks not yet covered
  'laguna seca iracing guide: the corkscrew and turn 1',
  'imola iracing guide: chicanes, kerbs and the tamburello legacy',
  'road atlanta iracing guide: the esses and braking for turn 10',
  'lime rock park iracing guide: short-track road racing habits',
  'interlagos iracing guide: reading the senna s and the long back straight',
  'le mans circuit de la sarthe iracing guide for endurance drivers',
  'martinsville iracing guide: braking and rotation on a paperclip oval',
  'bristol motor speedway iracing guide: banking, tire wear and lane choice',
  'indianapolis motor speedway oval iracing guide: trim and drafting',
  'phillip island iracing guide: fast sweepers and the high-speed lines',
  'sonoma raceway iracing guide: elevation and the carousel',
  'charlotte roval iracing guide: the infield chicane and the banking',

  // ─── Expansion 2026-10-02 — bottom-funnel buying guides ────────────────────
  // Amazon Associates risk window: the account needs qualifying purchases, not
  // just traffic. These topics are deliberately purchase-intent, SKU-comparison
  // or "which tier should I buy" framing rather than technique/track content,
  // so the gearKeys boxes sit in front of someone actually deciding what to buy.
  'entry vs mid vs flagship direct drive wheelbase: which tier to buy',
  'sim racing gear checklist: what to buy first on a tight budget',
  'building a dedicated iRacing PC: CPU and GPU pairing guide',
  'single 1440p 120Hz monitor buying guide for sim racing',
  'when a fitness tracker like WHOOP is worth it for endurance racing',
  'upgrading from stock pedals to load cell: a buying checklist',
  'wheel rim buying guide: GT, open-wheel and rally shapes compared',
  'cockpit frame buying guide: what to check before you buy',

  // ─── Expansion 2026-10-13 ──────────────────────────────────────────────────
  // The 2026-10-12 deploy failed on "only ~1 unused topic(s) left": 172 topics
  // against 171 posts written. Every topic below was checked against every
  // live, queued and published slug and every entry above; none repeats one.
  // At 20 posts a week that is ~5 weeks before the floor alert fires again.

  // Tracks with no post and no pool entry — road courses, then ovals and dirt
  'hockenheimring iracing guide: the stadium section and the long straights',
  'nurburgring nordschleife iracing guide for first-timers',
  'circuit gilles villeneuve iracing guide: walls, chicanes and the hairpin',
  'portland international raceway iracing guide',
  'barber motorsports park iracing guide',
  'canadian tire motorsport park iracing guide: mosport and its fast sweepers',
  'autodromo hermanos rodriguez iracing guide: the stadium and the peraltada',
  'algarve portimao iracing guide: blind crests and elevation',
  'misano iracing guide',
  'mugello iracing guide: flowing high-speed corners',
  'circuit paul ricard iracing guide: chicane choice and the mistral straight',
  'knockhill iracing guide: a short, bumpy scottish track',
  'thruxton iracing guide: the fastest circuit in the uk',
  'circuit zolder iracing guide',
  'jerez iracing guide',
  'circuit ricardo tormo valencia iracing guide',
  'motorland aragon iracing guide',
  'oschersleben iracing guide',
  'detroit belle isle iracing guide: street circuit walls and bumps',
  'st. petersburg street circuit iracing guide',
  'chicago street course iracing guide for nascar',
  'summit point raceway iracing guide',
  'oran park iracing guide',
  'rudskogen iracing guide',
  'nashville superspeedway iracing guide',
  'kansas speedway iracing guide',
  'michigan international speedway iracing guide: drafting a two-mile oval',
  'pocono raceway iracing guide: three different corners on one oval',
  'atlanta motor speedway iracing guide: pack racing on a reconfigured oval',
  'las vegas motor speedway iracing guide',
  'dover motor speedway iracing guide: the concrete monster mile',
  'world wide technology raceway gateway iracing guide',
  'new hampshire motor speedway iracing guide',
  'eldora speedway iracing dirt guide',
  'knoxville raceway iracing dirt guide',
  'williams grove speedway iracing dirt guide',

  // Cars with no post and no pool entry — GT3/GT4, prototypes, the open-wheel ladder, touring, oval and dirt
  'porsche 911 gt3 r 992 iracing guide',
  'chevrolet corvette z06 gt3.r iracing guide',
  'acura nsx gt3 evo iracing guide',
  'porsche 718 cayman gt4 clubsport iracing guide',
  'mercedes-amg gt4 iracing guide',
  'mclaren 570s gt4 iracing guide',
  'bmw m hybrid v8 gtp iracing guide',
  'ferrari 499p iracing guide',
  'dallara p217 lmp2 iracing guide',
  'dallara f3 iracing guide',
  'fia f4 iracing guide: the open-wheel ladder starts here',
  'ray ff1600 iracing guide: momentum driving in a formula ford',
  'mercedes-amg w13 f1 iracing guide',
  'usf 2000 and indy pro 2000 iracing guide: the road to indy ladder',
  'super formula lights iracing guide',
  'hyundai elantra n tc iracing guide',
  'honda civic type r tcr iracing guide',
  'audi rs3 lms tcr iracing guide',
  'bmw m2 cs racing iracing guide',
  'renault clio cup iracing guide',
  'radical sr8 iracing guide',
  'bmw m8 gte iracing guide',
  'supercars gen3 iracing guide: mustang and camaro',
  'arca menards series iracing guide',
  'super late model iracing guide',
  'sk modified iracing guide',
  'street stock iracing guide: the cheapest way into oval racing',
  'dirt midget iracing guide',
  'ump modified dirt iracing guide',

  // Setup, race craft, iRacing systems, software, hardware buying guides and the body
  'oval setup basics: wedge, cross weight and the track bar',
  'tape and grille settings on ovals: cooling vs speed',
  'rake and aero balance in gt3 and gtp cars',
  'traction control and abs maps: when to change them mid-race',
  'engine maps and fuel mixture settings explained',
  'hybrid energy deployment in iracing gtp cars',
  'bump stops and packers: why they matter on bumpy tracks',
  'setup changes for night and temperature swings in endurance races',
  'recovering a race after a spin or an off',
  'managing a gap: racing to the flag with a lead',
  'following closely without cooking your tyres in dirty air',
  'night stints in endurance races: visibility and fatigue',
  'braking reference points that work every lap',
  'throttle control on corner exit in high-torque cars',
  'driving a damaged car: limping to the pits or carrying on',
  'staying calm after an incident: the mental side of sim racing',
  'a pre-race routine for official iracing races',
  'structuring a week of iracing practice for real improvement',
  'fixed vs open setup series in iracing explained',
  'iracing special events: daytona 24, sebring 12, spa 24 and petit le mans',
  'week 13 in iracing: how to use the off-season',
  'the iracing replay system: saving and reviewing incidents',
  'iracing graphics settings for higher fps without losing visibility',
  'racing the iracing ai: offline races and practice against ai drivers',
  'the iracing dirt track model: dynamic surface and the cushion',
  'iracing esports pathways: from official races to pro series',
  'trading paints and custom liveries in iracing',
  'irating and safety rating tracking: iracing stats sites and tools',
  'third-party force feedback tools for iracing explained',
  'team radio and voice chat setup for iracing teams',
  'nvidia and amd driver settings for iracing',
  'oled monitors for sim racing: burn-in, hud elements and brightness',
  'tv vs monitor for sim racing: input lag and size trade-offs',
  'external dash displays for sim racing: wheel screens vs standalone dashes',
  'keyboard, mouse and tablet mounts for a sim rig',
  'foldable wheel stands for small spaces: what to expect',
  'sim racing in a small apartment: space-saving rig options',
  'ups and power protection for a sim racing pc',
  'iracing on a gamepad: is it playable without a wheel',
  'console wheels that work on pc for iracing',
  'thrustmaster t818 vs moza r9: mid-tier direct drive compared',
  'simucube 2 sport vs pro: is the high-end tier worth it',
  'heusinkveld sprint vs ultimate pedals: high-end load cell compared',
  'active force-feedback pedals: what they add over load cells',
  'stream deck and macro pads for sim racers',
  'webcams and facecam setups for sim racing streams',
  'ram and storage: how much does iracing really need',
  'gaming laptops for iracing: what to expect',
  'iracing on a mac: the realistic options',
  'staying cool on the rig: fans and room temperature for long races',
  'neck strain from vr headsets during long stints',
  'warm-up exercises before a race',
  'iracing vs acc vs le mans ultimate: which sim fits which driver',
  'switching from console racing to iracing on pc',
  'what sim racing teaches you for real karting and track days',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function existingSlugs() {
  const slugs = new Set();
  for (const dir of [QUEUE_DIR, PUBLISHED_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const slug = f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.json$/, '');
      slugs.add(slug);
    }
  }
  // Also fold in slugs already published as .html, so the generator never
  // re-proposes a topic that's already live on the site.
  if (fs.existsSync('blog')) {
    for (const f of fs.readdirSync('blog')) {
      if (f.endsWith('.html') && f !== 'index.html') slugs.add(f.replace(/\.html$/, ''));
    }
  }
  return slugs;
}

function dateLabel(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── API call ────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 180000; // hard cap per API call; without this a stalled
                                   // connection hangs the whole job.

async function generateBatch(topics, publishDate, usedSlugs, gearOptions) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!claudeConfigured()) throw new Error('Neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY is set');

  const dateStr  = isoDate(publishDate);
  const labelStr = dateLabel(publishDate);
  const recentSlugs = [...usedSlugs].slice(-150);
  const gearKeyList = gearOptions.map(g => `${g.key} (${g.name})`).join(', ');

  const systemPrompt = `You are Carlos Martinez, an iRacing sim racer who writes the blog at RealIRacing (realiracing.com), an Amazon Associates affiliate site about sim racing gear and iRacing technique. You race on your own rig — a MOZA R9 direct drive wheelbase, MOZA CRP2 load-cell pedals, and a fixed aluminum cockpit — and you write from that first-person, real-rig perspective. Genuinely useful, specific, opinionated content — never vague marketing copy.

Voice rules:
- First person ("I", "my rig", "I race on"), grounded in the MOZA R9 setup described above
- Hedge every hardware spec you mention — use "~" (roughly) for torque figures, prices, and other numbers that change over time (e.g. "~9 N·m", never a bare unhedged figure presented as exact)
- NEVER use the words "risk-free", "guaranteed", or similar absolute claims — sim racing gear is a real purchase with real trade-offs, and you say so honestly
- No fabricated specs, review counts, or lap-time claims — if you don't know a number, describe the trade-off qualitatively instead
- FAQ answers must be plain text (no inline HTML tags) since they also populate FAQPage JSON-LD

Return ONLY a valid JSON array of exactly ${topics.length} blog post objects. No markdown, no explanation, just the JSON array. Always wrap the objects in an array, including when there is only one — return [ { ... } ], never a bare object.

Each object must have exactly these fields:
- slug: URL-friendly string, lowercase, hyphens, no dates, 3-7 words, must NOT be in this already-used list: ${JSON.stringify(recentSlugs)}
- tag: a short two-part category label separated by " · ", e.g. "Buyer's Guide · Hardware", "Setup Guides · FFB", "iRacing Tips · Licenses", "Car Guide · GT Racing", "Streaming · OBS", "Hardware · Displays"
- author: "Carlos Martinez"
- readTime: e.g. "7 min read" or "8 min read"
- title: compelling, specific title (8-14 words)
- description: 1-2 sentence meta description, under 160 chars, benefit-focused
- sections: array of 9-13 section objects. Each section object has exactly ONE of these keys (except tip, which may also carry a sibling "tipLabel"):
  - {"p": "paragraph text"} — body paragraph (inline <a href="..."> and <strong> allowed)
  - {"h2": "heading text"} — section heading
  - {"h3": "subheading text"} — optional subheading
  - {"list": ["item 1", "item 2", "item 3"]} — bullet list (inline HTML allowed per item)
  - {"olist": ["step 1", "step 2"]} — numbered list
  - {"tip": "callout text", "tipLabel": "short label"} — a highlighted insight callout box
  Structure: 1-2 intro paragraphs (the FIRST paragraph is treated as the article lead), then 3-4 h2 sections each with paragraphs, at least one list, one tip callout. Total should read as 1200-1700 words of real content, not padding.
- faqs: array of exactly 4 objects {"q": "question text", "a": "plain-text answer, no HTML"} — specific, genuinely useful answers, not restatements of the description
- gearKeys: array of 2-4 strings, ONLY from this exact allowed list of product keys: ${gearKeyList}. Pick keys genuinely relevant to the post's topic.
- published: "${dateStr}"
- dateLabel: "${labelStr}"

Rules:
- Every slug must be unique within this batch and not in the used-slugs list above
- Never write an amazon.com, amzn.to or a.co URL in any field. Product links are added automatically: the gear box from gearKeys, and the first in-text mention of each catalog product (so use the plain product name, e.g. "MOZA R9", "G923", "CSL DD")
- gearKeys MUST only use keys from the allowed list verbatim (exact key strings, e.g. "moza-r9" not "MOZA R9")
- Include at least one internal cross-reference per post as an inline <a href="some-other-slug.html"> where it's genuinely relevant (use plausible existing RealIRacing slugs like "best-sim-racing-wheels-iracing.html", "moza-r9-iracing-settings.html", "best-sim-racing-cockpit-2026.html", "best-sim-racing-pedals-iracing-2026.html" — these already exist on the site)
- Each post must stand alone as genuinely useful content a real sim racer would want to read`;

  const userPrompt = `Generate ${topics.length} blog posts on these topics:\n${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;

  const data = await callClaude({
    apiKey,
    model: MODEL,
    maxTokens: MAX_TOKENS,
    timeoutMs: REQUEST_TIMEOUT_MS,
    system: withHumanizeRules(systemPrompt, 'en'),
    user: userPrompt,
  });
  const text = data.content[0].text.trim();
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  // The reply shape is not ours to control — an array, a bare object, a fenced
  // block, or something truncated mid-post. parseBatchReply keeps whatever is
  // complete; see _deploy/lib/salvage.js. When nothing is, say WHY: "ran out of
  // room" (lower BATCH_SIZE) and "wrote malformed JSON" (a prompt problem) need
  // different fixes and the parse error alone cannot tell them apart.
  const { posts, via } = parseBatchReply(clean);
  if (via === 'salvage') {
    console.warn(`    ⚠ batch JSON was malformed; salvaged ${posts.length} post(s)`);
  }
  if (posts.length) return posts;
  throw new Error(
    data.stop_reason === 'max_tokens'
      ? `the model ran out of room mid-batch (stop_reason=max_tokens) — lower BATCH_SIZE or raise MAX_TOKENS (${MAX_TOKENS})`
      : 'the model wrote JSON that could not be parsed or salvaged'
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!claudeConfigured()) {
    console.error('Error: Neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY is set. Add CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) or ANTHROPIC_API_KEY as a repo secret at https://github.com/netwebmedia/realiracing/settings/secrets/actions/new');
    process.exit(1);
  }

  if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });
  if (!fs.existsSync(PUBLISHED_DIR)) fs.mkdirSync(PUBLISHED_DIR, { recursive: true });

  const allowedGearKeys = loadAllowedGearKeys();
  if (allowedGearKeys.length === 0) {
    console.error('Error: could not parse any product keys from js/affiliates.js — aborting so we never ship posts with an empty gear allowlist.');
    process.exit(1);
  }

  const used   = existingSlugs();
  const topics = shuffle(TOPIC_POOL);
  let written  = 0;
  let topicIdx = 0;

  let currentDate = new Date(START_DATE);
  const queueFiles = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}/.test(f));
  if (queueFiles.length > 0) {
    const latestFile = queueFiles.sort().pop();
    const latestDate = new Date(latestFile.slice(0, 10));
    if (latestDate >= currentDate) currentDate = addDays(latestDate, 1);
  }

  // `currentDate` continues from the last queued filename purely to keep
  // filenames unique and chronologically sorted — it has nothing to do with
  // when a post actually goes live. The publisher (generate-blogs.js) renders
  // whatever's pending the moment it fires, not on a drip schedule, so a
  // `published` date any later than today is a lie the day it's written (this
  // is what shipped 46 posts dated up to 2026-10-11 on 2026-09-11 and had to
  // be re-dated after the fact — see commit 9d72eaa). TODAY is captured once,
  // real wall-clock date, and every post's `published`/`dateLabel` is clamped
  // to whichever is earlier: the nominal cadence date or today.
  const TODAY = new Date();

  console.log(`Generating ${TARGET} posts starting from ${isoDate(currentDate)}...`);
  console.log(`Allowed gear keys: ${allowedGearKeys.map(g => g.key).join(', ')}`);

  const MAX_STALLS = 6;
  let stalls   = 0;
  let dayCount = 0; // posts written for the current date — advance date every 2/day

  while (written < TARGET) {
    if (stalls >= MAX_STALLS) {
      console.error(`Stopping early: ${MAX_STALLS} consecutive batches produced no posts. Wrote ${written}/${TARGET}.`);
      break;
    }

    const remaining = TARGET - written;
    const batchSize = Math.min(BATCH_SIZE, remaining, topics.length - topicIdx);
    if (batchSize === 0) break;

    const batch = topics.slice(topicIdx, topicIdx + batchSize);
    topicIdx += batchSize;
    if (topicIdx >= topics.length) topicIdx = 0; // cycle if needed

    // Never quote a `published` date later than today, no matter how far the
    // filename cadence has advanced (see TODAY comment above).
    const publishDate = isoDate(currentDate) <= isoDate(TODAY) ? currentDate : TODAY;

    console.log(`  Batch: ${batch.length} post(s) for ${isoDate(publishDate)} (filename date ${isoDate(currentDate)})...`);

    let posts;
    try {
      posts = await generateBatch(batch, publishDate, used, allowedGearKeys);
    } catch (e) {
      console.error(`  Error in batch: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000));
      try { posts = await generateBatch(batch, publishDate, used, allowedGearKeys); }
      catch (e2) { console.error(`  Retry failed: ${e2.message}`); stalls++; continue; }
    }

    if (!Array.isArray(posts)) {
      console.error('  Batch returned non-array response; skipping.');
      stalls++;
      continue;
    }

    const allowedKeySet = new Set(allowedGearKeys.map(g => g.key));
    let wroteThisBatch = 0;
    for (const post of posts) {
      if (!post || !post.slug || typeof post.slug !== 'string' || !Array.isArray(post.sections)) {
        console.warn('  Skipping post with missing/invalid slug or sections.');
        continue;
      }

      // DROP a collision, never suffix it.
      //
      // This used to auto-suffix: -2, then -3, then -4, forever. That is the
      // treadmill the monorepo cleared by hand on 2026-08-25 (18 duplicates, 7
      // of them already auto-published) and now guards with a dedicated test.
      // Here it was worse than latent: TOPIC_POOL holds 48 topics against 74
      // published posts, and the loop below wraps with `topicIdx = 0 // cycle
      // if needed`, so the pool is guaranteed to come back around to ground it
      // has already covered. Every one of those would have shipped as
      // <slug>-2 — a near-identical second page cannibalising the first, which
      // on an affiliate site means splitting the ranking signal for the exact
      // queries that earn the commission.
      //
      // Dropping is safe: a dropped post contributes nothing to wroteThisBatch,
      // so a batch that is entirely duplicates counts as a stall and MAX_STALLS
      // ends the run instead of grinding out suffixed twins.
      const slug = post.slug;
      if (used.has(slug)) {
        console.warn(`  ✗ dropped "${slug}" — already covered; a -2 twin splits the ranking signal`);
        continue;
      }

      // Validate gearKeys against the live allowlist; never let a post ship
      // with zero valid keys — fall back to the core rig.
      let gearKeys = Array.isArray(post.gearKeys) ? post.gearKeys.filter(k => allowedKeySet.has(k)) : [];
      if (gearKeys.length === 0) gearKeys = ['moza-r9', 'cockpit'];
      post.gearKeys = gearKeys;

      // Force published/dateLabel to the clamped date regardless of what the
      // model echoed back — never trust generated JSON for the one field a
      // stale/creative model response could push into the future.
      post.published = isoDate(publishDate);
      post.dateLabel = dateLabel(publishDate);

      const filename = `${isoDate(currentDate)}-${slug}.json`;
      const filepath = path.join(QUEUE_DIR, filename);
      fs.writeFileSync(filepath, JSON.stringify(post, null, 2) + '\n');
      used.add(slug);
      written++;
      wroteThisBatch++;
      dayCount++;
      console.log(`  + ${filename}`);

      // Advance the publish date every 2 posts (2/day cadence, matching the
      // publish workflow's ~2-4/day pace for a niche affiliate site).
      if (dayCount >= 2) {
        currentDate = addDays(currentDate, 1);
        dayCount = 0;
      }
    }

    stalls = wroteThisBatch === 0 ? stalls + 1 : 0;

    if (written < TARGET) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\nDone. Generated ${written} posts.`);
  console.log(`Queue now has ${fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).length} pending posts.`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
