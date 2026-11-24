/* RealIRacing — blog email capture (form.rir-join), double opt-in.
 *
 * Email + one UNTICKED consent box (added here, so the 300 posts need no edit)
 * POST to api-php /api/public/brand/subscribe (lib/brand_welcome.php), which sends
 * ONE confirmation email; only the click on it starts the 3-email welcome series.
 * The /go/ hub form (go/hub.js) is a separate list and is unchanged.
 * External file (not inline) so the strict script-src CSP needs no new hash.
 */
(function () {
  var form = document.querySelector('form.rir-join');
  if (!form) return;
  var API = 'https://netwebmedia.com/api/public/brand/subscribe';
  var consent = document.createElement('label');
  consent.className = 'rir-consent';
  consent.innerHTML = '<input type="checkbox" name="consent" value="1"> <span class="rir-consent-text">I want RealiRacing guides and tips by email (a short welcome series about iRacing and sim-racing gear). I can unsubscribe at any time.</span> <a href="/privacy.html">Privacy notice</a>';
  form.insertBefore(consent, form.querySelector('.jm'));
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var input = form.querySelector('input[type="email"]'), btn = form.querySelector('button'),
        msg = form.querySelector('.jm'), hp = form.querySelector('.hp'),
        email = (input.value || '').trim();
    if (!email || !input.checkValidity()) {
      msg.textContent = form.getAttribute('data-bad'); input.focus(); return;
    }
    if (!consent.querySelector('input').checked) {
      msg.textContent = 'Tick the box to confirm you want the emails.'; return;
    }
    btn.disabled = true;
    msg.textContent = '';
    fetch(API, {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: 'realiracing', email: email, consent: true,
        consent_text: consent.querySelector('.rir-consent-text').textContent.slice(0, 400),
        source_page: location.pathname + ' [' + (form.getAttribute('data-source') || 'blog-realiracing') + ']',
        hp_website: hp ? hp.value : '' })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      form.className = 'rir-join done';
      msg.textContent = 'Check your email: we sent you a link to confirm your subscription.';
      var dl = form.getAttribute('data-dl'); // lead magnet: link it in place, no email round-trip
      if (dl) { var a = document.createElement('a'); a.href = dl; a.textContent = ' Open the FFB checklist →'; msg.appendChild(a); }
      if (window.gtag) window.gtag('event', 'subscribe_request', { method: 'blog_email', page_path: location.pathname }); // the key event (generate_lead) fires on confirmation, see ga4.js
    }).catch(function () {
      msg.textContent = form.getAttribute('data-err');
    }).then(function () { btn.disabled = false; });
  });
})();
