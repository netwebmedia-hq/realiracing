#!/usr/bin/env node
/**
 * Generates the HyperFrames composition (index.html + compositions/*.html)
 * for one aspect ratio from a clips config.
 *
 *   node scripts/build.mjs <16x9|9x16|1x1> [--clips clips/gt3-spa.json]
 *
 * The clips config defaults to $HL_CLIPS, then clips/default.json.
 *
 * Why a build step: a HyperFrames root fixes its canvas size and total
 * duration at compile time, and each <video> must exist in the static HTML so
 * the renderer can pre-extract its frames. Variables cannot add clips or change
 * the length, so the clip list is expanded here instead. The race name IS a
 * real HyperFrames variable (override with `render --variables`).
 *
 * index.html and compositions/ are generated and gitignored. Edit clips/*.json,
 * assets/highlights.css or assets/scenes.js, never the generated files.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS = 30;

const RATIOS = {
  "16x9": { width: 1920, height: 1080, label: "YouTube 16:9" },
  "9x16": { width: 1080, height: 1920, label: "Reels / TikTok 9:16" },
  "1x1": { width: 1080, height: 1080, label: "Instagram feed 1:1" },
};
const POSITIONS = ["top-left", "bottom-left", "bottom-right", "center"];

const fail = (msg) => {
  console.error(`build: ${msg}`);
  process.exit(1);
};

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const ratioId = args.find((a) => !a.startsWith("--") && RATIOS[a]);
if (!ratioId) fail(`first argument must be one of: ${Object.keys(RATIOS).join(", ")}`);
const clipsFlag = args.indexOf("--clips");
const clipsPath = resolve(
  ROOT,
  clipsFlag >= 0 ? args[clipsFlag + 1] : process.env.HL_CLIPS || "clips/default.json"
);
if (!existsSync(clipsPath)) fail(`clips config not found: ${clipsPath}`);

const ratio = RATIOS[ratioId];
const vertical = ratio.height > ratio.width; // same rule the Remotion components used

// ---------------------------------------------------------------- helpers
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** frames -> seconds string, floored to 1e-6 so a clip never starts after its first frame */
const sec = (frames) => String(Math.floor((frames / FPS) * 1e6) / 1e6);

/** 12.5 | "12.5" | "1:23:45" | "23:45.5" -> seconds */
function parseTime(v, where) {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string" && /^\d+(\.\d+)?(:\d+(\.\d+)?){0,2}$/.test(v.trim())) {
    return v
      .trim()
      .split(":")
      .reduce((acc, part) => acc * 60 + Number(part), 0);
  }
  return fail(`${where}: start must be seconds or a "h:mm:ss" timestamp, got ${JSON.stringify(v)}`);
}

function probe(path) {
  const run = (extra) =>
    spawnSync("ffprobe", ["-v", "error", ...extra, "-of", "csv=p=0", path], { encoding: "utf8" });
  const a = run(["-select_streams", "a:0", "-show_entries", "stream=codec_type"]);
  if (a.error || a.status !== 0) return null; // ffprobe missing or unreadable file
  const d = run(["-show_entries", "format=duration"]);
  return { hasAudio: a.stdout.trim() === "audio", duration: parseFloat(d.stdout) || null };
}

// ---------------------------------------------------------------- config
let cfg;
try {
  cfg = JSON.parse(readFileSync(clipsPath, "utf8"));
} catch (e) {
  fail(`${clipsPath} is not valid JSON: ${e.message}`);
}
if (!Array.isArray(cfg.clips) || cfg.clips.length === 0) fail('config needs a non-empty "clips" array');

const raceName = String(cfg.raceName ?? "iRacing Highlights");
const channelName = String(cfg.channelName ?? "@realiracing");
const cta = String(cfg.cta ?? "LIKE · SUBSCRIBE · FOLLOW");
const accent = String(cfg.accentColor ?? "#E8FF00");
if (!/^#[0-9a-f]{3,8}$/i.test(accent)) fail(`accentColor must be a hex colour, got ${accent}`);
const introFrames = Math.round(Number(cfg.introSeconds ?? 2) * FPS);
const outroFrames = Math.round(Number(cfg.outroSeconds ?? 2.5) * FPS);
if (!(introFrames > 0 && outroFrames > 0)) fail("introSeconds and outroSeconds must be > 0");

const missing = [];
let cursor = introFrames;
const clips = cfg.clips.map((c, i) => {
  const where = `clips[${i}]`;
  if (!c.src || typeof c.src !== "string") fail(`${where}: "src" is required`);
  if (!(Number(c.duration) > 0)) fail(`${where}: "duration" (seconds) must be > 0`);
  const position = c.titlePosition ?? "bottom-left";
  if (!POSITIONS.includes(position)) fail(`${where}: titlePosition must be one of ${POSITIONS.join(", ")}`);
  const rate = c.playbackRate ?? 1;
  if (!(rate > 0)) fail(`${where}: playbackRate must be > 0`);

  const frames = Math.max(1, Math.round(Number(c.duration) * FPS));
  const start = parseTime(c.start ?? 0, where);
  const file = resolve(ROOT, c.src);
  let info = null;
  if (!existsSync(file)) missing.push(c.src);
  else {
    info = probe(file);
    if (!info) console.warn(`build: could not ffprobe ${c.src}; treating it as silent`);
    else if (info.duration && start + (frames / FPS) * rate > info.duration + 0.05)
      console.warn(
        `build: ${where} wants source seconds ${start}-${(start + (frames / FPS) * rate).toFixed(2)} but ${c.src} is only ${info.duration.toFixed(2)}s long`
      );
  }
  const hasAudio = typeof c.audio === "boolean" ? c.audio : Boolean(info?.hasAudio);

  const clip = {
    n: i + 1,
    src: c.src.replace(/\\/g, "/"),
    start,
    rate,
    hasAudio,
    startFrame: cursor,
    frames,
    title: c.title ? String(c.title) : "",
    subtitle: c.subtitle ? String(c.subtitle) : "",
    position,
  };
  cursor += frames;
  return clip;
});
if (missing.length) {
  fail(
    `missing footage:\n  ${[...new Set(missing)].join("\n  ")}\nDrop the files into clips/ (or edit ${clipsPath}).`
  );
}
const outroStart = cursor;
const totalFrames = outroStart + outroFrames;

// ---------------------------------------------------------------- markup
const compId = `highlights-${ratioId}`;
const dims = `data-width="${ratio.width}" data-height="${ratio.height}"`;
const underline = vertical ? 300 : 500;

const ratioVars = [
  ["--intro-title", vertical ? "64px" : "80px"],
  ["--intro-sub", vertical ? "32px" : "40px"],
  ["--outro-logo", vertical ? "80px" : "96px"],
  ["--outro-cta", vertical ? "24px" : "28px"],
  ["--clip-pad", vertical ? "32px" : "40px"],
  ["--clip-title", vertical ? "36px" : "42px"],
  ["--clip-sub", vertical ? "20px" : "24px"],
  // was 80vw / 50vw in Remotion; px so the preview matches the render
  ["--clip-title-max", `${Math.round(ratio.width * (vertical ? 0.8 : 0.5))}px`],
  ["--accent", accent],
]
  .map(([k, v]) => `${k}:${v}`)
  .join(";");

const sceneRoot = (id, bg, extra = "") =>
  `#${id}{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;${bg ? `background:${bg};` : ""}${extra}}`;

/** wraps a scene body as a sub-composition file (style + markup + registration inside the template) */
const subComposition = ({ id, seconds, style, body, register }) => `<!doctype html>
<!-- GENERATED by scripts/build.mjs. Do not edit or commit. -->
<html>
<body>
<template id="${id}-template">
  <style>${style}</style>
  <div id="${id}" data-composition-id="${id}" ${dims} data-duration="${seconds}">
${body}
  </div>
  <script>window.__timelines["${id}"] = ${register};</script>
</template>
</body>
</html>
`;

const videoTag = (c) =>
  `<video id="video-${c.n}" src="../${esc(c.src)}" playsinline ${c.hasAudio ? 'data-has-audio="true"' : "muted"} data-start="0" data-duration="${sec(c.frames)}" data-media-start="${Number(c.start.toFixed(3))}"${
    c.rate !== 1 ? ` data-playback-rate="${c.rate}"` : ""
  } data-track-index="${c.n + 1}"></video>`;

const titleBox = (c) =>
  c.title
    ? `    <div id="title-${c.n}" class="title-box pos-${c.position}">
      <div class="title-bar"></div>
      <div class="title-text">${esc(c.title)}</div>${
        c.subtitle ? `\n      <div class="subtitle-text">${esc(c.subtitle)}</div>` : ""
      }
    </div>`
    : "";

const scenes = []; // { id, start (frames), frames, file, content }

scenes.push({
  id: "intro",
  start: 0,
  frames: introFrames,
  content: subComposition({
    id: "intro",
    seconds: sec(introFrames),
    style: sceneRoot(
      "intro",
      "#0a0a0a",
      "display:flex;flex-direction:column;align-items:center;justify-content:center;"
    ),
    body: `    <div class="grid"></div>
    <div id="intro-bar" class="bar"></div>
    <div id="intro-channel" class="channel">${esc(channelName)}</div>
    <div id="intro-race" class="race" data-var-text="raceName">${esc(raceName)}</div>
    <div id="intro-flash" class="flash"></div>`,
    register: `HLScenes.intro({ width: ${ratio.width}, frames: ${introFrames} })`,
  }),
});

for (const c of clips) {
  const id = `clip-${c.n}`;
  scenes.push({
    id,
    start: c.startFrame,
    frames: c.frames,
    content: subComposition({
      id,
      seconds: sec(c.frames),
      style: sceneRoot(id, "#000"),
      body: `    <div id="zoom-${c.n}" class="zoom" data-layout-allow-overflow="true">
      ${videoTag(c)}
    </div>
    <div id="flash-${c.n}" class="flash"></div>
${titleBox(c)}`,
      register: `HLScenes.clip({ n: ${c.n}, frames: ${c.frames}, hasTitle: ${Boolean(c.title)}, centered: ${c.position === "center"} })`,
    }),
  });
}

const speedLines = [-3, -2, -1, 0, 1, 2, 3]
  .map((i) => `      <div class="speed-line" style="--i:${i};--abs:${Math.abs(i)}"></div>`)
  .join("\n");
scenes.push({
  id: "outro",
  start: outroStart,
  frames: outroFrames,
  content: subComposition({
    id: "outro",
    seconds: sec(outroFrames),
    style: sceneRoot("outro", ""),
    body: `    <div id="outro-inner" class="outro-inner">
${speedLines}
      <div id="outro-logo" class="logo">${esc(channelName)}</div>
      <div id="outro-underline" class="underline"></div>
      <div id="outro-cta" class="cta">${esc(cta)}</div>
    </div>`,
    register: `HLScenes.outro({ width: ${ratio.width}, underline: ${underline} })`,
  }),
});

// ---------------------------------------------------------------- write
const compDir = resolve(ROOT, "compositions");
mkdirSync(compDir, { recursive: true });
for (const f of readdirSync(compDir)) {
  if (/^(intro|outro|clip-\d+)\.html$/.test(f)) rmSync(resolve(compDir, f)); // stale scenes from a longer config
}
for (const s of scenes) writeFileSync(resolve(compDir, `${s.id}.html`), s.content);

const variables = [
  { id: "raceName", type: "string", label: "Race name", default: raceName, maxLength: 60 },
];
const configRel = relative(ROOT, clipsPath).split(sep).join("/");

const hosts = scenes
  .map(
    (s) =>
      `    <div id="slot-${s.id}" class="clip" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${sec(s.start)}" data-duration="${sec(s.frames)}" data-track-index="1" ${dims}></div>`
  )
  .join("\n");

const html = `<!doctype html>
<!-- GENERATED by scripts/build.mjs (${ratioId} from ${configRel}). Do not edit or commit. -->
<html lang="en" data-composition-variables="${esc(JSON.stringify(variables))}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${ratio.width}, height=${ratio.height}" />
  <title>@realiracing Highlights ${ratioId}</title>
  <link rel="stylesheet" href="assets/highlights.css" />
  <style id="ratio-vars">#root{${ratioVars}}</style>
  <script src="assets/gsap.min.js"></script>
  <script src="assets/scenes.js"></script>
</head>
<body>
  <div id="root" data-composition-id="${compId}" data-start="0" ${dims} data-fps="${FPS}" data-duration="${sec(totalFrames)}">
${hosts}
  </div>
  <script>window.__timelines["${compId}"] = gsap.timeline({ paused: true });</script>
</body>
</html>
`;

writeFileSync(resolve(ROOT, "index.html"), html);
console.log(
  `build: ${ratioId} (${ratio.width}x${ratio.height}) ${clips.length} clip(s), ${(totalFrames / FPS).toFixed(2)}s -> index.html + ${scenes.length} scenes`
);
