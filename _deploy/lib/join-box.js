// Blog email-capture box: one source for generate-blogs.js (new posts) and
// backfill-join-box.js (existing posts). Submit logic lives in /js/join.js.
// Copy carries no price (client-facing rule).
// Offer = the free FFB checklist (/ffb-checklist.html, revealed by join.js on
// success). Own form slug "hub-realiracing-ffb" so these signups are counted
// apart from the /go/ hub's "hub-realiracing"; the "hub-" prefix still keeps
// them out of NWM's agency drip (api-php routes/public.php).
const JOIN_BOX_HTML = `<div class="cta-box rir-join-box">
        <h3>Free FFB tuning checklist</h3>
        <p>The order I tune force feedback in, from rig to wheelbase software to iRacing, plus the clipping check. Enter your email and the checklist opens right here. No spam, unsubscribe anytime.</p>
        <form class="rir-join" method="post" novalidate data-api="https://netwebmedia.com/api/public/forms/submit" data-form="hub-realiracing-ffb" data-source="blog-ffb-checklist" data-campaign="ffb-checklist" data-dl="/ffb-checklist.html" data-ok="You're in. Here's your checklist:" data-bad="Enter a valid email." data-err="Something went wrong. Please try again.">
          <div class="jr"><input id="rir-join-email" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@email.com" aria-label="Email address"><button class="btn-primary" type="submit">Send me the checklist</button></div>
          <input class="hp" type="text" name="hp_website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <p class="jm" role="status" aria-live="polite"></p>
          <p class="fine">See the <a href="/privacy.html">privacy notice</a>.</p>
        </form>
      </div>`;
const JOIN_SCRIPT_TAG = '<script src="/js/join.js" defer></script>';
const BLOG_CSS_HREF = 'blog.css?v=20261020';

module.exports = { JOIN_BOX_HTML, JOIN_SCRIPT_TAG, BLOG_CSS_HREF };
