// node --test _ci/consent.test.mjs
// Runs js/ga4.js against a tiny fake DOM and checks the Consent Mode behaviour:
// analytics granted by default (EEA/UK/CH denied via region), ads denied, banner shown, Accept/Reject write the cookie and update gtag,
// a stored choice skips the banner, and gtag.js is fetched only after trusted, visible input. No network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'ga4.js'), 'utf8');

function run(cookie, lang = 'en', nav = {}) {
  const listeners = {};
  const mk = (tag) => {
    const el = { tag, children: [], attrs: {}, listeners: {}, className: '', textContent: '', style: {},
      appendChild(c) { this.children.push(c); c.parent = this; return c; },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, f) { this.listeners[t] = f; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); },
      closest() { return null; }, offsetHeight: 90 };
    return el;
  };
  const body = mk('body'), head = mk('head');
  const classes = new Set();
  const doc = {
    cookie, readyState: 'complete', body, head,
    documentElement: { lang, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }, style: { setProperty() {} } },
    createElement: mk, createTextNode: (t) => ({ text: t }),
    getElementById: (id) => [...head.children, ...body.children].find((c) => c.id === id) || null,
    addEventListener(t, f) { listeners[t] = f; },
  };
  const wl = {};
  const wapi = { addEventListener(t, f, o) { (wl[t] = wl[t] || []).push({ f, o }); }, removeEventListener(t, f) { wl[t] = (wl[t] || []).filter((x) => x.f !== f); } };
  const navigator = { userAgent: 'Mozilla/5.0 Chrome/130 Safari/537.36', languages: ['en-US'], webdriver: false, ...nav };
  const win = { ...wapi, dataLayer: [], location: { hostname: 'realiracing.com', pathname: '/' } };
  const ctx = vm.createContext({ window: win, document: doc, location: win.location, navigator, Date, encodeURIComponent, decodeURIComponent, Object, setTimeout: (f) => f() });
  vm.runInContext(SRC, ctx);
  const fire = (t, ev) => (wl[t] || []).slice().forEach((x) => x.f(ev));
  const gtagEl = () => head.children.filter((c) => c.tag === 'script' && /googletagmanager\.com\/gtag\/js/.test(c.src || ''));
  return { win, doc, body, head, classes, fire, gtagEl, wl };
}

const find = (n, pred) => (pred(n) ? n : (n.children || []).map((c) => find(c, pred)).find(Boolean));

test('no choice: analytics granted by default, ads denied, EEA/UK/CH denied, Reject turns analytics off', () => {
  const { win, doc, body, classes } = run('');
  const defs = win.dataLayer.filter((a) => a[0] === 'consent' && a[1] === 'default').map((a) => a[2]);
  assert.equal(defs.length, 2);
  assert.equal(defs[0].analytics_storage, 'granted');
  assert.equal(defs[0].region, undefined);
  for (const d of defs) {
    assert.equal(d.ad_storage, 'denied');
    assert.equal(d.ad_user_data, 'denied');
    assert.equal(d.ad_personalization, 'denied');
  }
  assert.equal(defs[1].analytics_storage, 'denied');
  assert.equal(defs[1].wait_for_update, 500);
  for (const c of ['DE', 'FR', 'ES', 'GB', 'CH', 'IS', 'NO']) assert.ok(defs[1].region.includes(c), c);
  assert.ok(win.dataLayer.findIndex((a) => a[0] === 'config') > win.dataLayer.findIndex((a) => a[1] === 'default' && a[2].region));
  const banner = doc.getElementById('consent-banner');
  assert.ok(banner);
  const [no, ok] = find(banner, (n) => n.className === 'consent-actions').children;
  assert.equal(no.textContent, 'Reject');
  assert.equal(ok.textContent, 'Accept');
  no.listeners.click();
  assert.match(doc.cookie, /nwm_consent=essential/);
  assert.equal(win.dataLayer.filter((a) => a[1] === 'update').pop()[2].analytics_storage, 'denied');
  assert.equal(doc.getElementById('consent-banner'), null);
  assert.ok(body);
});

test('Accept grants all four signals, like netwebmedia.com', () => {
  const { win, doc } = run('');
  const banner = doc.getElementById('consent-banner');
  find(banner, (n) => n.className === 'consent-actions').children[1].listeners.click();
  const upd = win.dataLayer.filter((a) => a[1] === 'update').pop()[2];
  assert.deepEqual({ ...upd }, { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
});

test('stored choice: no banner, default follows the cookie', () => {
  const { win, doc } = run('nwm_consent=all');
  assert.equal(doc.getElementById('consent-banner'), null);
  assert.equal(win.dataLayer.find((a) => a[1] === 'default')[2].analytics_storage, 'granted');
  assert.equal(win.dataLayer.filter((a) => a[1] === 'default').length, 1);
});

test('stored Reject: analytics and ads stay denied, no banner', () => {
  const { win, doc } = run('nwm_consent=essential');
  assert.equal(doc.getElementById('consent-banner'), null);
  const def = win.dataLayer.find((a) => a[1] === 'default')[2];
  assert.equal(def.analytics_storage, 'denied');
  assert.equal(def.ad_storage, 'denied');
});

test('Spanish page gets Spanish copy', () => {
  const { doc } = run('', 'es');
  const banner = doc.getElementById('consent-banner');
  const labels = find(banner, (n) => n.className === 'consent-actions').children.map((b) => b.textContent);
  assert.deepEqual(labels, ['Rechazar', 'Aceptar']);
});

const ev = (o = {}) => ({ isTrusted: true, target: { closest: () => null }, ...o });
const banner = (r) => find(r.doc.getElementById('consent-banner'), (n) => n.className === 'consent-actions').children;

test('gate: no gtag.js on load or after timers, but gtag js/config/event still queue', () => {
  const r = run('');
  assert.equal(r.gtagEl().length, 0);
  assert.ok(r.win.dataLayer.some((a) => a[0] === 'js'));
  assert.ok(r.win.dataLayer.some((a) => a[0] === 'config'));
  for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) assert.equal(r.wl[t].length, 1, t);
  assert.equal(r.wl.scroll, undefined);
  assert.ok(r.wl.pointerdown[0].o.capture && r.wl.pointerdown[0].o.passive);
  const stored = run('nwm_consent=all');
  assert.equal(stored.gtagEl().length, 0);
});

test('gate: trusted pointerdown loads gtag.js once', () => {
  const r = run('');
  r.fire('pointerdown', ev());
  r.fire('keydown', ev());
  assert.equal(r.gtagEl().length, 1);
  assert.match(r.gtagEl()[0].src, /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-/);
  assert.equal(r.wl.pointerdown.length, 0);
});

test('gate: untrusted, hidden-tab and banner-internal input do not load', () => {
  const r = run('');
  r.fire('pointerdown', ev({ isTrusted: false }));
  r.fire('wheel', ev({ isTrusted: undefined }));
  r.doc.visibilityState = 'hidden';
  r.fire('keydown', ev());
  r.doc.visibilityState = 'visible';
  r.fire('pointerdown', ev({ target: { closest: (q) => (q === '#consent-banner' ? {} : null) } }));
  assert.equal(r.gtagEl().length, 0);
  r.fire('touchstart', ev());
  assert.equal(r.gtagEl().length, 1);
});

test('gate: bots never arm or load', () => {
  const cases = [{ webdriver: true }, { userAgent: 'HeadlessChrome/130' }, { userAgent: 'Googlebot/2.1' }, { userAgent: 'python-requests' },
    { languages: [] }, { userAgentData: { brands: [{ brand: 'HeadlessChrome' }] } }];
  for (const nav of cases) {
    const r = run('', 'en', nav);
    assert.equal(Object.values(r.wl).flat().length, 0, JSON.stringify(nav));
    r.fire('pointerdown', ev());
    banner(r)[1].listeners.click(ev());
    assert.equal(r.gtagEl().length, 0, JSON.stringify(nav));
  }
});

test('gate: Reject on the banner does not load gtag.js, later input neither', () => {
  const r = run('');
  banner(r)[0].listeners.click(ev());
  r.fire('pointerdown', ev());
  assert.equal(r.gtagEl().length, 0);
  assert.equal(r.win.dataLayer.filter((a) => a[1] === 'update').pop()[2].analytics_storage, 'denied');
});

test('gate: Accept on the banner loads gtag.js once (trusted click only)', () => {
  const r = run('');
  const ok = banner(r)[1];
  ok.listeners.click(ev({ isTrusted: false }));
  assert.equal(r.gtagEl().length, 0);
  ok.listeners.click(ev());
  r.fire('pointerdown', ev());
  assert.equal(r.gtagEl().length, 1);
  assert.equal(r.win.dataLayer.filter((a) => a[1] === 'update').pop()[2].analytics_storage, 'granted');
});

test('Meta pixel loads only after Accept on the banner that names Meta (nwm_ads=1)', () => {
  const pixel = (r) => r.head.children.some((c) => /connect\.facebook\.net/.test(c.src || ''));
  const go = (cookie, nav) => { const r = run(cookie, 'en', nav); r.fire('pointerdown', { isTrusted: true, target: {} }); return r; };
  const yes = go('nwm_consent=all; nwm_ads=1');
  assert.ok(pixel(yes));
  assert.deepEqual(Array.from(yes.win.fbq.queue[0]), ['init', '932250764227701']);
  assert.equal(pixel(go('nwm_consent=all')), false, 'older analytics-only Accept');
  assert.equal(pixel(go('')), false, 'no choice');
  assert.equal(pixel(go('nwm_consent=essential; nwm_ads=1')), false, 'Reject');
  assert.equal(pixel(go('nwm_consent=all; nwm_ads=1', { webdriver: true })), false, 'bot');
});
