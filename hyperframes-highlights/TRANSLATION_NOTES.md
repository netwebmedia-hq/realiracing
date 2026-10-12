# Translation notes: Remotion -> HyperFrames

Source: `remotion-highlights/` (Remotion 4.0.446, React 19, 7 files, ~625 LOC) at `origin/main` a94e9a9.
Target: this folder, HyperFrames 0.8.149 (pinned in `package.json`). Ported with the
`remotion-to-hyperframes` workflow (lint, map, generate, SSIM-validate). The old folder is deleted in the same PR.

## Source lint

`lint_source.py remotion-highlights/src/`: 7 files, 0 blockers, 0 warnings, 0 info. No `useState`,
`useEffect`, `calculateMetadata`, `delayRender` or UI library; the whole project was pure
`useCurrentFrame()` maths, which is why it ports mechanically.

## What maps to what

| Remotion | HyperFrames |
| --- | --- |
| `Root.tsx`: 3 `<Composition>` (30 fps, 525 frames) | `scripts/build.mjs <ratio>` writes one root per ratio: `data-width/height`, `data-fps="30"`, `data-duration="17.5"` (length follows the clip list) |
| `Highlights.tsx`: `<Sequence>` per scene, running offsets | one sub-composition host per scene (`intro`, `clip-N`, `outro`) with `data-start`/`data-duration`; each scene has one paused GSAP timeline in local time |
| hardcoded `CLIPS` array | `clips/*.json`, expanded at build time (see "Clip list" below) |
| prop `raceName` (default "iRacing Highlights") | HyperFrames variable `raceName`, bound with `data-var-text`; default comes from the config, override with `render --variables '{"raceName":"..."}'` |
| `Intro.tsx` | `compositions/intro.html` + `HLScenes.intro` in `assets/scenes.js` |
| `VideoClip.tsx` + `ClipTitle.tsx` | `compositions/clip-N.html` + `HLScenes.clip` |
| `Outro.tsx` | `compositions/outro.html` + `HLScenes.outro` |
| `OffthreadVideo startFrom / playbackRate` | `<video data-media-start="<seconds>" data-playback-rate>` inside the scene; sound kept with `data-has-audio="true"` |
| `interpolate(frame,[a,b],[x,y])` | one `gsap.fromTo` at `a/30` s lasting `(b-a)/30` s, `ease: none` |
| `Easing.out(Easing.cubic)` | `power3.out` |
| `spring({damping:12, stiffness:180, mass:0.8})` | closed-form spring used directly as a GSAP ease function (see below) |
| `min(fadeIn, fadeOut)` title opacity | exact piecewise-linear keyframes (also correct for clips shorter than 33 frames) |
| `useVideoConfig().width/height`, `isVertical = height > width` | per-ratio CSS custom properties written by the build (same rule: 1:1 uses the landscape sizes) |
| `@remotion/cli`, `@remotion/player`, `@remotion/transitions` | dropped. `@remotion/player` and `@remotion/transitions` were listed in `package.json` but never imported |
| `remotion studio` | `npm run preview` (HyperFrames Studio) |
| `remotion render ... out/*.mp4` | `npm run render:*` -> `renders/highlights-*.mp4` |
| `public/videos/` | `clips/` |
| `CLIPS_README.md` | `README.md` |

## Validation

Baseline: scratch copy of the ORIGINAL `remotion-highlights/` (`npm ci`, Remotion 4.0.446), with
`Config.setVideoImageFormat("png")` + `Config.setColorSpace("bt709")` (per the skill's `eval.md`; the
repo's own config uses jpeg and is NOT changed by this PR since the folder is gone). Same four test
clips under both projects. HyperFrames rendered with the default `npm run render:*` (quality `looks`).
SSIM from `render_diff.sh`, threshold 0.95 (T2 tier: multi-scene + spring + audio + media; skill's measured T2 mean 0.985).

| Ratio | Frames | Mean SSIM | p05 | Min | Threshold | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 9x16 (1080x1920) | 525 | **0.9901** | 0.9849 | 0.9728 | 0.95 | pass |
| 16x9 (1920x1080) | 525 | **0.9916** | 0.9856 | 0.9729 | 0.95 | pass |
| 1x1 (1080x1080) | 525 | **0.9883** | 0.9806 | 0.9681 | 0.95 | pass |

Per scene (9x16): intro 0.995, outro 0.998, clips 0.987-0.989. The lowest frames are the first
~5 frames of each clip (flash fade + title slide-in over live video), still above 0.97.
Output format matches Remotion's: h264, yuv420p, bt709, 30 fps, 525 frames, AAC audio.

Render time (this PC, RTX 5060 Ti, 16 cores, 4 test clips of 1280x720):

| Ratio | HyperFrames `render` | Remotion `render` (wall, incl. bundling) |
| --- | --- | --- |
| 9x16 | 37-43 s | 76 s |
| 16x9 | 36-38 s | 54 s |
| 1x1 | 28-41 s | 37 s |

`npm run render:all` end to end: 2 min 25 s. `npm run check` (lint, runtime, layout, contrast,
all three ratios): 0 findings each.

The test footage is not the real `stream_today.mp4` (not on disk anywhere under the variant folder):
four 6 s clips cut from `SCHD3832.MOV`, a 19 min 1280x720 stream capture in the same folder, at 120/330/640/930 s.

## Approximations and deliberate differences

- **Fonts.** The original used the system Arial Black / Arial. The CSS now declares `HL Black` / `HL Bold`
  with `src: local("Arial Black"), ...` first, so machines that have the Microsoft fonts render
  exactly as before (this PC does; the SSIM above is with them). Machines without them get bundled
  SIL OFL look-alikes (Archivo Black, Arimo Bold, ~30 KB). On such a machine glyph shapes differ
  slightly from the old output; that path was not SSIM-tested.
- **Spring.** Not `back.out(N)`: the Intro spring is evaluated from its exact closed-form solution
  (overshoot 1.163 at ~0.24 s), sampled at the same frame times Remotion uses. No approximation here.
- **`vw` units.** `maxWidth: 80vw / 50vw` on the clip title became fixed px per ratio (864 / 960 / 540)
  so Studio preview and render agree. Same pixels as the old render.
- **Grid colour.** `rgba(232,255,0,0.05)` became `color-mix(in srgb, var(--accent) 5%, transparent)`
  so `accentColor` in the config recolours it too. Identical for the default accent.
- **Speed lines / underline** animate `width` (not `scaleX`), exactly as the old inline styles did.
- **Clip timing in the config** is seconds (or a `"h:mm:ss"` stream timestamp) instead of frames;
  durations are rounded to whole 30 fps frames, so scene boundaries land on the same frames as before.
- **Source `src` path.** Old: `public/videos/clipN.mp4`. New: `clips/clipN.mp4`.
- **Audio.** Remotion `OffthreadVideo` mixed the clips' own sound; HyperFrames keeps it too
  (`data-has-audio`, probed with ffprobe at build time; override with `"audio": false`). SSIM does not
  measure audio. Checked: clip windows carry sound, intro/outro are silent. Slow-motion clips
  (`playbackRate: 0.6`) were render-tested; the audio treatment under a non-1 rate was not compared
  with Remotion's.
- **Zoom** 1.00 -> 1.04 overflows the frame by design; the zoom wrapper carries
  `data-layout-allow-overflow` (it only contains the video), the scene root clips it.
- **Unified `render:all`** runs the three renders one after another, as the old script did.

## Clip list: why a build step

HyperFrames locks canvas size and total duration at compile time, and each `<video>` has to be in the
static HTML for frame pre-extraction. Variables (`data-var-src`, `data-var-text`, `--variables`) can swap a
source or a text but cannot add or remove clips or change the length, and a `data-var-src` video keeps
its authored fallback for audio extraction. So the clip list is expanded by `scripts/build.mjs` into
`index.html` + `compositions/*.html` (generated, git-ignored), while the race name stays a real variable.

Gotchas found while porting (kept here because they cost time):

- The runtime strips the `id` of a sub-composition's root when it mounts it, so linked-CSS rules and
  scripts must never start from `#intro` / `#outro`; only the template's own `<style>` may target the root id.
- A sub-composition that declares its own `data-composition-variables` ignores `--variables`; one that
  declares none inherits the root's variable and honours the override. The scene files declare none.
- `lint` sees scene-local `data-start="0"` videos as overlapping unless each has its own `data-track-index`.

## Not carried over

- `@remotion/lambda` / `@remotion/cloudrun`: not used in the source; nothing to drop. HyperFrames renders on
  one machine (it also has `lambda`/`cloudrun`/`cloud` commands if ever needed).
- The old per-clip `playbackRate`, `titlePosition` options all survive; `startFrom` is now `start`.
- The old `CLIPS_README.md` frame-math table is gone: durations and starts are seconds/timestamps.

## Site-safety follow-up in this PR

`hyperframes-highlights` replaces `remotion-highlights` in the deploy excludes (`.github/workflows/deploy.yml`
rsync + FTP lists) and in the `_deploy/csp-inline-hashes.js` and `_deploy/backfill-privacy-link.js` directory
skip lists, so none of this folder ships to realiracing.com.
