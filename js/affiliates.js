/* ============================================================
 * RealIRacing — affiliate config (single source of truth)
 * ============================================================
 * All affiliate product data lives HERE and only here.
 *
 * The Associates tag is LIVE (realiracing-20) and affUrl() appends it
 * to every link below. Setting amazonTag back to 'PENDING-20' sends
 * links out untagged; they still work, they just stop earning.
 *
 * LINKING POLICY (set 2026-08-24 after an audit found every link was a
 * bare Amazon search, which ranks third-party adapters and mounting
 * brackets above the actual product):
 *
 *   1. One unambiguous product  → link the ASIN:  /dp/<ASIN>
 *   2. A brand with many live   → keyword search + the brand facet,
 *      variants (MOZA)            /s?k=...&rh=p_89%3AMOZA — verified
 *                                 2026-08-24 to return MOZA-only results
 *   3. A genuine category       → plain keyword search (GPU, monitor,
 *      (no single product)        cockpit). Correct as a search.
 *
 * Do NOT "upgrade" a rule-3 entry to an ASIN — the posts recommend a
 * class of part there, not one SKU. Do re-check rule-1 ASINs when a
 * vendor revises its line; MOZA and Fanatec both revise often.
 *
 * Usage in a page:
 *   <div id="rir-gear"></div>
 *   ...
 *   <script src="/js/affiliates.js"></script>
 *   <script>renderGearBox('rir-gear', ['moza-r9','moza-cs-v2'], 'Optional box title');</script>
 *
 * Or hydrate static anchors:  <a data-aff="moza-r9">MOZA R9</a>
 *   <script>RIR_AFF.hydrateLinks();</script>
 * ============================================================ */
(function (global) {
  'use strict';

  var RIR_AFF = {
    amazonTag: 'realiracing-20',

    products: {

      /* ── The actual rig (what Carlos races on) ────────────── */
      'moza-r9': {
        name: 'MOZA R9 Direct Drive Wheelbase',
        amazonUrl: 'https://www.amazon.com/s?k=MOZA+R9+wheel+base&rh=p_89%3AMOZA',
        note: '9 N·m direct drive — the base bolted to my rig right now'
      },
      'moza-cs-v2': {
        name: 'MOZA CS V2 Steering Wheel',
        amazonUrl: 'https://www.amazon.com/s?k=MOZA+CS+V2+steering+wheel&rh=p_89%3AMOZA',
        note: 'the round rim my whole FFB profile is tuned around'
      },
      'moza-sr-p': {
        name: 'MOZA SR-P Load Cell Pedals',
        amazonUrl: 'https://www.amazon.com/s?k=MOZA+SR-P+pedals&rh=p_89%3AMOZA',
        note: 'the pedals on my rig, managed in the same Pit House software as the R9'
      },
      /* Category, not a product — many AIB partners build the same GPU,
         so a search is the honest link. Same for the monitor and cockpit. */
      'gpu-rtx-5060-ti': {
        name: 'NVIDIA GeForce RTX 5060 Ti (8 GB)',
        amazonUrl: 'https://www.amazon.com/s?k=RTX+5060+Ti+8GB+graphics+card',
        note: 'renders iRacing and NVENC-encodes the stream on the same chip'
      },
      /* 2026-10-12: /dp/B0CQ4HPJYV (the AMD-listed 5700) had no new offer on
         amazon.com — only a used one — so the link led to "Buy Used". Stock for
         this CPU moves between third-party sellers, so it is now a keyword
         search with the AMD brand facet (rule 2), which always lands on the
         live 5700 listings. */
      'cpu-ryzen-7-5700': {
        name: 'AMD Ryzen 7 5700',
        amazonUrl: 'https://www.amazon.com/s?k=AMD+Ryzen+7+5700+processor&rh=p_89%3AAMD',
        note: '8 cores — plenty for iRacing plus OBS on one PC'
      },
      'monitor-1440p-120': {
        name: '1440p 120 Hz+ G-SYNC Compatible Gaming Monitor',
        amazonUrl: 'https://www.amazon.com/s?k=1440p+144hz+g-sync+compatible+gaming+monitor',
        note: 'my single-screen setup — high refresh matters more than size'
      },
      /* WHOOP 4.0 was discontinued in May 2025 (replaced by 5.0 / MG), so
         the old link pointed at a product nobody can buy. 5.0 is the
         current band; WHOOP sells by membership, hence a search not an ASIN. */
      'whoop': {
        name: 'WHOOP 5.0 Band',
        amazonUrl: 'https://www.amazon.com/s?k=WHOOP+5.0+band',
        note: 'a WHOOP drives the live heart-rate overlay on my streams — mine is a 4.0, but 5.0 is what you can buy now'
      },

      /* ── The buying ladder (recommended, tier by tier) ────── */
      'logitech-g923': {
        name: 'Logitech G923 Racing Wheel',
        amazonUrl: 'https://www.amazon.com/dp/B07PGGDJSG',
        note: 'belt-driven, the easiest on-ramp into iRacing'
      },
      'thrustmaster-t300': {
        name: 'Thrustmaster T300 RS GT',
        amazonUrl: 'https://www.amazon.com/dp/B01M1L2NRL',
        note: 'long-standing budget pick'
      },
      'moza-r5': {
        name: 'MOZA R5 Bundle',
        amazonUrl: 'https://www.amazon.com/s?k=MOZA+R5+bundle&rh=p_89%3AMOZA',
        note: 'entry direct drive — the first real fidelity jump'
      },
      'fanatec-csl-dd': {
        name: 'Fanatec CSL DD',
        amazonUrl: 'https://www.amazon.com/dp/B0FBGZHFN3',
        note: 'entry direct drive with Fanatec’s ecosystem'
      },
      'moza-r12': {
        name: 'MOZA R12 Direct Drive Wheelbase',
        amazonUrl: 'https://www.amazon.com/s?k=MOZA+R12+wheel+base&rh=p_89%3AMOZA',
        note: 'high-end direct drive, maximum headroom'
      },
      /* No Amazon listing for the ClubSport DD+ base itself — a search for it
         returns third-party mounting brackets. Left as a search deliberately;
         revisit if Fanatec lists the base directly. */
      'fanatec-clubsport-dd': {
        name: 'Fanatec ClubSport DD+',
        amazonUrl: 'https://www.amazon.com/s?k=Fanatec+ClubSport+DD%2B',
        note: 'high-end, deep licensed-rim catalog'
      },
      /* 2026-10-12: /dp/B0DDWH41HB (the 512 GB Batman bundle) had no buy box on
         amazon.com ("See All Buying Options" only). Quest 3 ships in rotating
         retailer bundles, which is exactly how that ASIN died, so this is a
         keyword search + the Meta brand facet (rule 2): the 512 GB headset
         that Amazon itself ships is the first result. */
      'meta-quest-3': {
        name: 'Meta Quest 3',
        amazonUrl: 'https://www.amazon.com/s?k=Meta+Quest+3+512GB+VR+headset&rh=p_89%3AMeta',
        note: 'the most common way into PCVR sim racing'
      },
      /* 2026-10-12: /dp/B083MNB4D8 renders as a variation page titled "T-3PM"
         with "Choose from options" and no buyable offer; the other T-LCM
         listings (B07YFDL1JW, and B092QP4H2W renewed) show no price either.
         So the T-LCM cannot be bought new on amazon.com today. The
         link is now a Thrustmaster-facet search for load-cell pedals, which
         opens the Raceline Pedals III line that IS in stock. The name and note
         say so rather than pretending the T-LCM is on sale. Revisit when the
         posts that recommend the T-LCM by name are rewritten. */
      'thrustmaster-t-lcm': {
        name: 'Thrustmaster Load Cell Pedals (T-LCM / Raceline III LC)',
        amazonUrl: 'https://www.amazon.com/s?k=Thrustmaster+load+cell+pedals&rh=p_89%3AThrustmaster',
        note: 'budget load-cell brake over USB — the T-LCM itself is out of stock new on Amazon right now, so this opens Thrustmaster’s current Raceline pedals'
      },
      'moza-crp2': {
        name: 'MOZA CRP2 Load Cell Pedals',
        amazonUrl: 'https://www.amazon.com/s?k=MOZA+CRP2+pedals&rh=p_89%3AMOZA',
        note: 'load-cell brake, managed in the same Pit House software'
      },
      /* The pedals-plus-kit combo this recommends does not map to one
         listing; Fanatec now sells the CSL Elite Pedals V2 with the load
         cell built in. Kept as a search until the copy is rewritten. */
      'fanatec-csl-pedals-lc': {
        name: 'Fanatec CSL Pedals + Load Cell Kit',
        amazonUrl: 'https://www.amazon.com/s?k=Fanatec+CSL+pedals+load+cell+kit',
        note: 'modular upgrade path inside the Fanatec ecosystem'
      },
      'cockpit': {
        name: 'Sim Racing Cockpit / Wheel Stand',
        amazonUrl: 'https://www.amazon.com/s?k=sim+racing+cockpit+stand',
        note: 'a rigid mount matters more than the brand — flex kills FFB detail'
      }
    }
  };

  /* The first sentence is the statement Amazon's Associates Operating Agreement
   * requires on any page that carries Amazon links. Do not paraphrase it. */
  var DISCLOSURE = 'As an Amazon Associate I earn from qualifying purchases. Some links are affiliate links — I may earn a commission at no cost to you.';

  /* Build the outbound URL for a product key.
   * Appends ?tag= ONLY once a real Associates tag is configured. */
  function affUrl(key) {
    var p = RIR_AFF.products[key];
    if (!p) return '#';
    var url = p.amazonUrl;
    if (RIR_AFF.amazonTag && RIR_AFF.amazonTag !== 'PENDING-20') {
      url += (url.indexOf('?') === -1 ? '?' : '&') + 'tag=' + encodeURIComponent(RIR_AFF.amazonTag);
    }
    return url;
  }

  /* Render a styled "gear used / recommended" box into #containerId.
   * keys  — array of product keys from RIR_AFF.products
   * title — optional box label (default: 'Gear used & recommended') */
  function renderGearBox(containerId, keys, title) {
    var el = document.getElementById(containerId);
    if (!el) return;

    /* Posts are rendered with the gear box already in the HTML (build-time,
     * see _deploy/generate-blogs.js) so the affiliate links are crawlable and
     * work without JS. If the container is already populated, leave it — this
     * call is then a no-op kept for older pages that still ship an empty div. */
    if (el.querySelector('.gear-box')) {
      hydrateLinks(el);
      return;
    }

    var box = document.createElement('div');
    box.className = 'gear-box';

    var label = document.createElement('span');
    label.className = 'box-label';
    label.textContent = title || 'Gear used & recommended';
    box.appendChild(label);

    var ul = document.createElement('ul');
    (keys || []).forEach(function (key) {
      var p = RIR_AFF.products[key];
      if (!p) return;
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = affUrl(key);
      a.target = '_blank';
      a.rel = 'sponsored noopener';
      a.textContent = p.name;
      li.appendChild(a);
      if (p.note) li.appendChild(document.createTextNode(' — ' + p.note));
      ul.appendChild(li);
    });
    box.appendChild(ul);

    /* FTC affiliate disclosure — always rendered with the box */
    var note = document.createElement('p');
    note.className = 'aff-note';
    note.textContent = DISCLOSURE;
    box.appendChild(note);

    el.innerHTML = '';
    el.appendChild(box);
  }

  /* Hydrate static anchors carrying data-aff="key" — sets href,
   * target and rel from the central config (used on /gear.html). */
  function hydrateLinks(root) {
    var nodes = (root || document).querySelectorAll('[data-aff]');
    Array.prototype.forEach.call(nodes, function (a) {
      var key = a.getAttribute('data-aff');
      if (!RIR_AFF.products[key]) return;
      a.href = affUrl(key);
      a.target = '_blank';
      a.rel = 'sponsored noopener';
    });
  }

  RIR_AFF.affUrl = affUrl;
  RIR_AFF.renderGearBox = renderGearBox;
  RIR_AFF.hydrateLinks = hydrateLinks;
  RIR_AFF.disclosure = DISCLOSURE;

  global.RIR_AFF = RIR_AFF;
  global.affUrl = affUrl;
  global.renderGearBox = renderGearBox;
})(window);
