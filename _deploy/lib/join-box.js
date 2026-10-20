// Blog email-capture box: one source for generate-blogs.js (new posts) and
// backfill-join-box.js (existing posts). Submit logic lives in /js/join.js.
// Copy carries no price (client-facing rule).
const JOIN_BOX_HTML = `<div class="cta-box rir-join-box">
        <h3>Get the next guide by email</h3>
        <p>Setups, FFB settings and new packs, straight from the rig. No spam, unsubscribe anytime.</p>
        <form class="rir-join" method="post" novalidate data-api="https://netwebmedia.com/api/public/forms/submit" data-form="hub-realiracing" data-ok="You're on the list. Thanks!" data-bad="Enter a valid email." data-err="Something went wrong. Please try again.">
          <div class="jr"><input id="rir-join-email" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@email.com" aria-label="Email address"><button class="btn-primary" type="submit">Subscribe</button></div>
          <input class="hp" type="text" name="hp_website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <p class="jm" role="status" aria-live="polite"></p>
          <p class="fine">See the <a href="/privacy.html">privacy notice</a>.</p>
        </form>
      </div>`;
const JOIN_SCRIPT_TAG = '<script src="/js/join.js" defer></script>';
const BLOG_CSS_HREF = 'blog.css?v=20261020';

module.exports = { JOIN_BOX_HTML, JOIN_SCRIPT_TAG, BLOG_CSS_HREF };
