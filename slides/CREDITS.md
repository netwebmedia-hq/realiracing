# Homepage slide photos — source and licence

The seven hero-slideshow photographs in this directory come from **Pexels** and are used
under the [Pexels licence](https://www.pexels.com/license/): free for commercial use, no
permission needed, attribution appreciated but not required.

They were downloaded and self-hosted on **2026-09-02**. Until then the homepage referenced
them straight from `images.pexels.com` as the second layer of each slide's CSS
`background-image` stack, behind local files that did not exist — so every slide 404'd
locally and then loaded from Pexels. That cost the site two ways: seven console errors, and
two third-party cookies (`__cf_bm`, `_cfuvid`, set by Pexels' Cloudflare) which dropped
Lighthouse Best Practices to 73. Both are fixed by serving the files from this origin.

| File | Pexels photo | Page |
|---|---|---|
| `slide1.jpg` | 35415243 | https://www.pexels.com/photo/35415243/ |
| `slide2.jpg` | 28463838 | https://www.pexels.com/photo/28463838/ |
| `slide3.jpg` | 18956548 | https://www.pexels.com/photo/18956548/ |
| `slide4.jpg` | 9528592  | https://www.pexels.com/photo/9528592/ |
| `slide5.jpg` | 13237630 | https://www.pexels.com/photo/13237630/ |
| `slide6.jpg` | 12801    | https://www.pexels.com/photo/12801/ |
| `slide7.jpg` | 5111316  | https://www.pexels.com/photo/5111316/ |

**Photographer names are not recorded here** because pexels.com sits behind a Cloudflare
challenge that blocks scripted fetches, and inventing a credit is worse than omitting one.
Each page above names its photographer — fill the column in by hand if the site ever starts
displaying credits.

## The `-sm` variants

`slideN-sm.jpg` is a 3:5 centre crop of the same photo, which is exactly the region
`background-size: cover; background-position: center` shows on a portrait phone, at roughly
a third of the bytes. `index.html` picks between them with a media query for slide 1 and
`js/home.js` does the same for slides 2-7 from their `data-bg` / `data-bg-sm` attributes.

## Adding or replacing a slide

1. Put the full-width JPEG here as `slideN.jpg` (max 1600 px wide, quality ~80).
2. Make the phone crop as `slideN-sm.jpg`.
3. Add the row above with its source and licence — a photo with no provenance line does not
   ship.
4. Slide 1 is the page's Largest Contentful Paint element: it is declared in the stylesheet
   and preloaded in `<head>`. Slides 2-7 must stay in `data-bg` so they are not fetched
   before first paint.

## Homepage hero (since 2026-11-23)

`hero-cockpit.jpg` and `hero-cockpit-sm.jpg` are a frame from Carlos Martinez's own iRacing race at the Nürburgring Nordschleife (November 2026), captured on his own rig. They replace the Pexels photo `slide1.jpg` as the hero: an outside review found a stock drift-car photo did not say sim racing. The Pexels slide files stay in this folder, unused.
