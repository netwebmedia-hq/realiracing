/* RealIRacing — blog email capture (form.rir-join).
 *
 * Same {form_id, data} POST the /go/ hub makes (go/hub.js), to the same
 * "hub-realiracing" form, so blog and hub subscribers land on one CRM list.
 * The api-php "hub-" slug rule keeps them out of NWM's agency drip.
 * External file (not inline) so the strict script-src CSP needs no new hash.
 */
(function () {
  var form = document.querySelector('form.rir-join');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var input = form.querySelector('input[type="email"]'), btn = form.querySelector('button'),
        msg = form.querySelector('.jm'), hp = form.querySelector('.hp'),
        email = (input.value || '').trim();
    if (!email || !input.checkValidity()) {
      msg.textContent = form.getAttribute('data-bad'); input.focus(); return;
    }
    btn.disabled = true;
    msg.textContent = '';
    var qs = new URLSearchParams(location.search);
    fetch(form.getAttribute('data-api'), {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_id: form.getAttribute('data-form'), data: {
        email: email, hp_website: hp ? hp.value : '', source: form.getAttribute('data-source') || 'blog-realiracing',
        lang: document.documentElement.lang || '', utm_source: qs.get('utm_source') || 'realiracing',
        utm_medium: qs.get('utm_medium') || 'blog', utm_campaign: qs.get('utm_campaign') || form.getAttribute('data-campaign') || 'blog-join',
        landing_page: location.href.slice(0, 1000), referrer: (document.referrer || '').slice(0, 1000) } })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      form.className = 'rir-join done';
      msg.textContent = form.getAttribute('data-ok');
      var dl = form.getAttribute('data-dl'); // lead magnet: link it in place, no email round-trip
      if (dl) { var a = document.createElement('a'); a.href = dl; a.textContent = ' Open the FFB checklist →'; msg.appendChild(a); }
      if (window.gtag) window.gtag('event', 'sign_up', { method: 'blog_email', page_path: location.pathname });
    }).catch(function () {
      msg.textContent = form.getAttribute('data-err');
    }).then(function () { btn.disabled = false; });
  });
})();
