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
    t: 'Cookies de analítica y anuncios',
    b: 'Medimos visitas con Google Analytics y, si aceptas, usamos el píxel de Meta para mostrarte anuncios de RealiRacing en Facebook e Instagram. Rechazar desactiva ambos; en la UE, el Reino Unido y Suiza siguen desactivados hasta que aceptes.',
    s: 'Cookies de analítica y de anuncios (Meta).',
    more: 'Política de privacidad',
    ok: 'Aceptar', no: 'Rechazar', url: '/privacy.html#analytics'
  } : {
    t: 'Analytics and ad cookies',
    b: 'We measure visits with Google Analytics and, if you accept, use the Meta pixel to show you RealiRacing ads on Facebook and Instagram. Reject turns both off; in the EU, UK and Switzerland they stay off until you Accept.',
    s: 'Analytics and ad (Meta) cookies.',
    more: 'Privacy policy',
    ok: 'Accept', no: 'Reject', url: '/privacy.html#analytics'
  };
  function mountBanner() {
    if (document.getElementById('consent-banner') || !document.body) return;
    if (!document.getElementById('consent-css')) {
      var css = document.createElement('link');
      css.id = 'consent-css'; css.rel = 'stylesheet'; css.href = '/consent.css?v=4';
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
      b.addEventListener('click', function (e) {
        // Accept on this banner (it names Meta) is the only thing that allows the pixel.
        document.cookie = 'nwm_ads=1;path=/;SameSite=Lax;max-age=' + (value === 'all' ? 31536000 : 0);
        writeConsent(value);
        gtag('consent', 'update', signals(value));
        box.remove();
        // Accept starts GA4 (the click is trusted input); Reject keeps gtag.js unloaded.
        if (value === 'all') { if (trusted(e)) { load(); loadPixel(); } } else armed = false;
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

  // Back from the double opt-in confirmation page (api-php brand_welcome): ONE key event, then clean the URL.
  if (/[?&]subscribed=1/.test(location.search)) {
    gtag('event', 'generate_lead', { method: 'double_opt_in', brand: 'realiracing' });
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }

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

  // 2026-11-23: data-center browsers (Singapore, Ashburn, Council Bluffs; Chrome 1920x1080, homepage only,
  // 0 s engaged) were a large share of GA4 users. Same rule as netwebmedia.com js/nwm-ga4-loader.js: only
  // trusted, visible input starts GA4. Visitors who leave without touching the page are not counted.
  var EV = ['pointerdown', 'keydown', 'wheel', 'touchstart'], armed = false, loaded = false;
  function trusted(e) {
    return !!e && e.isTrusted === true && (typeof document.visibilityState !== 'string' || document.visibilityState === 'visible');
  }
  // Meta pixel for retargeting (2026-11-24). Loads only for a visitor who pressed Accept on the
  // banner that names Meta (cookie nwm_ads=1). An Accept stored before that date covered
  // analytics only, so it never loads the pixel. Never for bots (armed stays false for them).
  var PIXEL = '932250764227701', pixelLoaded = false;
  function loadPixel() {
    if (!armed || pixelLoaded) return;
    if (readConsent() !== 'all' || !/(?:^|;\s*)nwm_ads=1/.test(document.cookie)) return;
    pixelLoaded = true;
    var q = window.fbq = function () { q.callMethod ? q.callMethod.apply(q, arguments) : q.queue.push(arguments); };
    q.push = q; q.loaded = true; q.version = '2.0'; q.queue = [];
    var px = document.createElement('script');
    px.async = true;
    px.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(px);
    q('init', PIXEL);
    q('track', 'PageView');
  }
  function load() {
    loadPixel();
    if (!armed || loaded) return;
    loaded = true;
    for (var i = 0; i < EV.length; i++) window.removeEventListener(EV[i], onInput, { capture: true });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(s);
  }
  function onInput(e) {
    if (!trusted(e)) return;
    if (e.target && e.target.closest && e.target.closest('#consent-banner')) return; // banner buttons decide
    load();
  }
  var bot = !!navigator.webdriver ||
    /headless|bot|crawl|spider|lighthouse|python|curl|wget|phantom|selenium|puppeteer|playwright/i.test(String(navigator.userAgent)) ||
    (!!navigator.languages && navigator.languages.length === 0);
  try {
    var brands = navigator.userAgentData && navigator.userAgentData.brands;
    for (var b = 0; brands && b < brands.length; b++) if (/headless/i.test(brands[b].brand)) bot = true;
  } catch (_) {}
  if (!bot) {
    armed = true;
    for (var j = 0; j < EV.length; j++) window.addEventListener(EV[j], onInput, { capture: true, passive: true });
  }
})();
