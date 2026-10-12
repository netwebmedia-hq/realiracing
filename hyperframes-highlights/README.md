# @realiracing Highlights (HyperFrames)

Highlight-reel generator for @realiracing: 2 s intro, your clips with cut flash,
push-in zoom and a lower-third title, 2.5 s outro. Same three outputs as the old
Remotion project, now built with [HyperFrames](https://hyperframes.heygen.com)
(HTML + GSAP, rendered by headless Chrome + FFmpeg).

| Output | Size | Use |
| --- | --- | --- |
| `renders/highlights-16x9.mp4` | 1920x1080 | YouTube |
| `renders/highlights-9x16.mp4` | 1080x1920 | Reels / TikTok / Shorts |
| `renders/highlights-1x1.mp4` | 1080x1080 | Instagram feed |

This folder is a dev tool, **not part of the website**: `.github/workflows/deploy.yml`
and `_deploy/csp-inline-hashes.js` exclude `hyperframes-highlights` from the live deploy.

## Requirements

Node.js 22+, and `ffmpeg` + `ffprobe` on your PATH. Nothing to `npm install`:
the scripts call the pinned CLI with `npx --yes hyperframes@0.8.149` (it downloads
a headless Chrome on first use).

## Make a reel

1. **Drop your footage into `clips/`** (any `.mp4`; the files are git-ignored).
   The default config expects `clip1.mp4` ... `clip4.mp4`.
2. **Describe the cut in a clips config** (`clips/default.json`, or copy it):

   ```json
   {
     "raceName": "iRacing Highlights",
     "clips": [
       {
         "src": "clips/clip1.mp4",
         "start": "1:23:45",
         "duration": 3,
         "title": "OVERTAKE",
         "subtitle": "Turn 7",
         "titlePosition": "bottom-left",
         "playbackRate": 1
       }
     ]
   }
   ```

   | Field | Meaning |
   | --- | --- |
   | `src` | Video path relative to this folder (put it in `clips/`). Several clips may share one source. |
   | `start` | Where in the source to begin: seconds (`83.5`) or a stream timestamp (`"1:23:45"`, `"23:45.5"`). No more frame maths. |
   | `duration` | Seconds on screen (rounded to whole 30 fps frames). |
   | `title`, `subtitle` | Lower-third text (optional). |
   | `titlePosition` | `bottom-left` (default), `top-left`, `bottom-right`, `center`. |
   | `playbackRate` | `1` normal, `2` double speed, `0.6` slow-mo. |
   | `audio` | Optional `true`/`false`. Leave out: the file is probed and its sound is kept when it has any. |

   Top-level keys besides `clips`: `raceName`, `channelName` (`@realiracing`), `cta`
   (`LIKE · SUBSCRIBE · FOLLOW`), `accentColor` (`#E8FF00`), `introSeconds` (2), `outroSeconds` (2.5).
   The total length follows the clips.

3. **Render:**

   ```bash
   npm run render:16x9     # YouTube
   npm run render:9x16     # Reels / TikTok
   npm run render:1x1      # IG feed
   npm run render:all      # all three, one after the other
   ```

   A 17.5 s reel takes about 30-40 s per ratio on a desktop GPU.

### Other configs, other race name

```bash
# the GT3 @ SPA cut (7 clips from clips/stream_today.mp4; fill in the `start` times first)
HL_CLIPS=clips/gt3-spa.json npm run render:9x16             # bash
$env:HL_CLIPS = "clips/gt3-spa.json"; npm run render:9x16   # PowerShell

# change only the race name for one render (it is a HyperFrames variable)
npm run render:9x16 -- --variables '{"raceName":"Spa 24h"}'
```

`clips/gt3-spa.json` reproduces the old local "GT3 @ SPA" variant. Its `start` values are
still `0` placeholders (the old file had `TODO`s too); each clip has a `note` saying which moment it is.

### Preview and checks

```bash
npm run preview         # HyperFrames Studio on the 16:9 composition (preview:9x16, preview:1x1)
npm run check           # lint + runtime + layout + contrast gate, all three ratios (check:16x9 ...)
```

## How it is built

`scripts/build.mjs` turns a clips config into a HyperFrames project for one aspect
ratio: `index.html` plus one scene file per intro / clip / outro in `compositions/`.
Those two outputs are generated and git-ignored; rebuild with `npm run build:9x16`
(or let any `render:*`, `check*`, `preview*` script do it). Only one ratio exists on
disk at a time, so run the scripts one after another, not in parallel.

Why generated: a HyperFrames root fixes its canvas size and total length at compile time,
and each `<video>` must be in the static HTML so its frames can be pre-extracted. Variables
can swap text, colors and sources but cannot add clips or change the length, so the clip list
is expanded at build time. The race name is a real variable (`raceName`).

| Edit this | To change |
| --- | --- |
| `clips/*.json` | clips, titles, race name, brand text, accent colour, intro/outro length |
| `assets/highlights.css` | look: fonts, sizes, colours, title layout |
| `assets/scenes.js` | motion: every tween of intro / clip / outro |
| `scripts/build.mjs` | per-ratio sizes, markup, validation |

Never edit `index.html` or `compositions/*.html` by hand; Studio edits to them are overwritten
on the next build.

Fonts: Arial Black / Arial are used when installed (as before). Otherwise the bundled SIL OFL
look-alikes (Archivo Black, Arimo Bold in `assets/`) take over, so a render on a machine without
the Microsoft fonts still looks right. See `TRANSLATION_NOTES.md` for what changed from the Remotion version.
