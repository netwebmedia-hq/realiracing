// node --test _ci/consent.test.mjs
// Runs js/ga4.js against a tiny fake DOM and checks the Consent Mode behaviour:
// denied by default, banner shown, Accept/Reject write the cookie and update gtag,
// a stored choice skips the banner. No network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'ga4.js'), 'utf8');

function run(cookie, lang = 'en') {
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
  const win = { dataLayer: [], location: { hostname: 'realiracing.com', pathname: '/' } };
  const ctx = vm.createContext({ window: win, document: doc, location: win.location, Date, encodeURIComponent, decodeURIComponent, Object, setTimeout: (f) => f() });
  vm.runInContext(SRC, ctx);
  return { win, doc, body, classes };
}

const find = (n, pred) => (pred(n) ? n : (n.children || []).map((c) => find(c, pred)).find(Boolean));

test('no choice: default denied, banner shown, Reject keeps analytics denied', () => {
  const { win, doc, body, classes } = run('');
  const def = win.dataLayer.find((a) => a[0] === 'consent' && a[1] === 'default');
  assert.equal(def[2].analytics_storage, 'denied');
  assert.equal(def[2].ad_storage, 'denied');
  assert.equal(def[2].wait_for_update, 500);
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
});

test('Spanish page gets Spanish copy', () => {
  const { doc } = run('', 'es');
  const banner = doc.getElementById('consent-banner');
  const labels = find(banner, (n) => n.className === 'consent-actions').children.map((b) => b.textContent);
  assert.deepEqual(labels, ['Rechazar', 'Aceptar']);
});
