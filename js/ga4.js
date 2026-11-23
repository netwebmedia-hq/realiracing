/* RealIRacing — Google Analytics 4 loader (G-2DX10F6KVP)
 *
 * THE ONLY PLACE THE GA4 ID LIVES. Loaded from <head> on every indexable page.
 * Kept as its own file rather than folded into affiliates.js because three
 * pages (the homepage, /blog/ and the slide tool) do not load affiliates.js —
 * tagging via that file would have silently missed the homepage.
 *
 * No inline script anywhere, so a CSP can stay strict if one is ever added:
 * it would only need googletagmanager in script-src plus the collect beacon
 * in connect-src.
 */
(function () {
  var ID = 'G-2DX10F6KVP';
  if (!/(^|\.)realiracing\.com$/i.test(location.hostname)) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  // ── Consent ─────────────────────────────────────────────────────────────
  // Same banner as netwebmedia.com (js/main.js "Cookie Consent Banner"): GA4 Consent Mode
  // v2, choice kept 365 days in the first-party
  // cookie nwm_consent = all | essential. No inline script or style: the banner is built with
  // the DOM API and styled by /consent.css, so the strict CSP stays untouched. Since 2026-11-23
  // analytics_storage is granted by default (a stored Reject turns it off); EEA, UK and
  // Switzerland stay denied until Accept. Advertising signals stay denied until Accept.
  var CK = 'nwm_consent';
  function readConsent() {
    var m = document.cookie.match(/(?:^|;\s*)nwm_consent=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeConsent(v) {
    var d = new Date();
    d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
    document.cookie = CK + '=' + encodeURIComponent(v) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }
  function signals(v) {
    var g = v === 'all' ? 'granted' : 'denied';
    return { ad_storage: g, ad_user_data: g, ad_personalization: g, analytics_storage: g };
  }
  var isEs = /^es/i.test(document.documentElement.lang || '');
  var TXT = isEs ? {
    t: 'Cookies de analítica',
    b: 'Medimos visitas con Google Analytics. Rechazar desactiva las cookies de analítica; en la UE, el Reino Unido y Suiza siguen desactivadas hasta que aceptes.',
    s: 'Usamos cookies de analítica.',
    more: 'Política de privacidad',
    ok: 'Aceptar', no: 'Rechazar', url: '/privacy.html#analytics'
  } : {
    t: 'Analytics cookies',
    b: 'We measure visits with Google Analytics. Reject turns analytics cookies off; in the EU, UK and Switzerland they stay off until you Accept.',
    s: 'We use analytics cookies.',
    more: 'Privacy policy',
    ok: 'Accept', no: 'Reject', url: '/privacy.html#analytics'
  };
  function mountBanner() {
    if (document.getElementById('consent-banner') || !document.body) return;
    if (!document.getElementById('consent-css')) {
      var css = document.createElement('link');
      css.id = 'consent-css'; css.rel = 'stylesheet'; css.href = '/consent.css?v=3';
      document.head.appendChild(css);
    }
    var box = document.createElement('div');
    box.id = 'consent-banner';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', TXT.t);
    var p = document.createElement('p');
    p.className = 'consent-text';
    // Two spans: the full sentence, and a short one shown instead on phones (consent.css).
    var long = document.createElement('span');
    long.className = 'consent-long'; long.textContent = TXT.b + ' ';
    var short = document.createElement('span');
    short.className = 'consent-short'; short.textContent = TXT.s + ' ';
    p.appendChild(long); p.appendChild(short);
    var a = document.createElement('a');
    a.href = TXT.url; a.textContent = TXT.more;
    p.appendChild(a);
    var row = document.createElement('div');
    row.className = 'consent-actions';
    function btn(label, value) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'consent-btn'; b.textContent = label;
      b.addEventListener('click', function () {
        writeConsent(value);
        gtag('consent', 'update', signals(value));
        box.remove();
      });
      return b;
    }
    row.appendChild(btn(TXT.no, 'essential'));
    row.appendChild(btn(TXT.ok, 'all'));
    box.appendChild(p); box.appendChild(row);
    document.body.appendChild(box);
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-consent-open]') : null;
    if (t) { e.preventDefault(); mountBanner(); }
  });
  var saved = readConsent();
  var defaults = signals(saved);
  defaults.analytics_storage = saved === 'essential' ? 'denied' : 'granted';
  gtag('consent', 'default', defaults);
  if (!saved) {
    // Where the law asks for consent first (EEA, UK, Switzerland) analytics stays denied until Accept.
    gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500,
      region: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'] });
    // Like netwebmedia.com: mount 1.5 s after DOMContentLoaded, so it never competes with first paint.
    var later = function () { setTimeout(mountBanner, 1500); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later);
    else later();
  }

  gtag('js', new Date());
  gtag('config', ID, { anonymize_ip: true });

  // Affiliate clicks are the revenue event. Logged by name so they can be marked
  // a key event in GA4, instead of hunting for them among generic outbound clicks.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !/amazon\.|amzn\.to/i.test(a.href)) return;
    gtag('event', 'affiliate_click', {
      link_url: a.href,
      link_text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      page_path: location.pathname
    });
  }, true);

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);
})();
