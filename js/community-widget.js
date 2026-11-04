/* NetWebMedia Community widget — the one canonical copy.
 *
 * Mounts threaded Q&A on any page that carries
 *   <div class="nwm-community" data-community-property="golferos"
 *        data-community-post="my-slug" data-community-lang="es"></div>
 * (post mode) or the same div with data-community-mode="index" and no post
 * (index mode, used by each property's /community/ page).
 *
 * data-community-lang is the language the page was BUILT in. A bilingual page
 * (golferos) adds data-community-follow="html": the widget then reads
 * <html lang> instead and re-mounts on the page's `gec:lang` event, so an
 * English visitor gets English chrome and a language toggle updates it live.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS COPIED VERBATIM to five satellite properties by
 * _deploy/sync-community-widget.py. EDIT THIS FILE, then run:
 *     python _deploy/sync-community-widget.py
 * `--check` exits 1 when any copy is stale; CI-adjacent gates rely on it.
 * ---------------------------------------------------------------------------
 *
 * CSP is the reason this is an external file and not an inline script.
 * golf-chile, entrepoker, emergencia and dongaston all ship
 * `script-src 'self'` with no 'unsafe-inline' (golferos additionally hash-gates
 * every inline body in deploy-golferos.yml and FAILS THE BUILD on an unlisted
 * one). So the widget is served from each property's own origin, attaches every
 * handler with addEventListener (never an on* attribute), never uses a real
 * <form action> (a plain fetch, because dongaston sets form-action 'none'), and
 * talks to https://netwebmedia.com/api/community/ — the one cross-origin that
 * every property's connect-src already allows.
 *
 * Styling is inline style ATTRIBUTES via Object.assign(el.style, …). Verified
 * 2026-09-06: all six properties ship `style-src … 'unsafe-inline'`, so there
 * is no stylesheet to sync and no <style> element to get blocked. The palette
 * is neutral and inherits the page's fonts, exactly like the generated
 * "Related reading" block it sits next to.
 *
 * ES5-compatible on purpose (no arrow functions, no template literals, no
 * const/let): these pages have no build step and no transpiler.
 */
(function () {
  'use strict';

  var API = 'https://netwebmedia.com/api/community';

  // Unsent form text, kept across a language re-mount so a toggle never eats a draft.
  var DRAFTS = {};

  /* ---------------------------------------------------------- pure helpers */
  /* Exported at the bottom for tests/js/community-widget.test.js. Keep them
     free of DOM and network access so `node --test` can call them directly. */

  /** Escape for the rare place a string reaches an attribute. Every visible
      string goes through textContent instead — this is belt and braces. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** "3 days ago" / "hace 3 días". nowMs is injectable so the test is stable. */
  function relTime(iso, lang, nowMs) {
    if (!iso) return '';
    // MySQL DATETIME ("2026-09-06 12:00:00") is not an ISO string in Safari.
    var norm = String(iso).replace(' ', 'T');
    if (!/[Zz]|[+-]\d\d:?\d\d$/.test(norm)) norm += 'Z';
    var t = Date.parse(norm);
    if (isNaN(t)) return '';
    var secs = Math.max(0, Math.floor(((nowMs == null ? Date.now() : nowMs) - t) / 1000));
    var es = lang === 'es';
    var units = [
      [31536000, es ? ['año', 'años'] : ['year', 'years']],
      [2592000,  es ? ['mes', 'meses'] : ['month', 'months']],
      [604800,   es ? ['semana', 'semanas'] : ['week', 'weeks']],
      [86400,    es ? ['día', 'días'] : ['day', 'days']],
      [3600,     es ? ['hora', 'horas'] : ['hour', 'hours']],
      [60,       es ? ['minuto', 'minutos'] : ['minute', 'minutes']]
    ];
    if (secs < 60) return es ? 'hace un momento' : 'just now';
    for (var i = 0; i < units.length; i++) {
      if (secs >= units[i][0]) {
        var n = Math.floor(secs / units[i][0]);
        var word = units[i][1][n === 1 ? 0 : 1];
        return es ? ('hace ' + n + ' ' + word) : (n + ' ' + word + ' ago');
      }
    }
    return es ? 'hace un momento' : 'just now';
  }

  /** Absolute URL of the blog post a thread belongs to. Each property files its
      blog somewhere different; entrepoker additionally splits by language. */
  function postHref(property, slug, lang) {
    if (!slug) return '';
    var base = {
      nwm: 'https://netwebmedia.com/blog/',
      fracmo: 'https://fracmo.ai/blog/',
      golferos: 'https://golferos.com/blog/',
      marpolis: 'https://marpolis.com/blog/',
      entrepoker: 'https://entrepoker.com/' + (lang === 'en' ? 'en' : 'es') + '/blog/'
    }[property];
    if (!base) return '';
    return base + slug + '.html';
  }

  /** Everything the widget says, in both languages. */
  var STR = {
    en: {
      heading: 'Discussion', indexHeading: 'Community',
      empty: 'No questions yet. Ask the first one.',
      start: 'Start a discussion', ask: 'Ask a question',
      name: 'Your name', email: 'Email (optional, never shown)',
      title: 'Question', body: 'Your message', submit: 'Post',
      sending: 'Sending…',
      pending: 'Thanks — your post is awaiting review.',
      failed: 'Could not send that. Please try again in a moment.',
      reply: 'Reply', replies: 'replies', reply1: 'reply',
      starter: 'starter question',
      loading: 'Loading the conversation…',
      loadFailed: 'The conversation could not be loaded right now.',
      more: 'Show more', on: 'on', emailNote: 'Never published. Only used so we recognise you next time.',
      required: 'Please fill in your name, a title and a message.'
    },
    es: {
      heading: 'Conversación', indexHeading: 'Comunidad',
      empty: 'Todavía no hay preguntas. Haz la primera.',
      start: 'Inicia una conversación', ask: 'Haz una pregunta',
      name: 'Tu nombre', email: 'Email (opcional, nunca se muestra)',
      title: 'Pregunta', body: 'Tu mensaje', submit: 'Publicar',
      sending: 'Enviando…',
      pending: 'Gracias — tu mensaje está en revisión.',
      failed: 'No se pudo enviar. Inténtalo de nuevo en un momento.',
      reply: 'Responder', replies: 'respuestas', reply1: 'respuesta',
      starter: 'pregunta inicial',
      loading: 'Cargando la conversación…',
      loadFailed: 'No se pudo cargar la conversación en este momento.',
      more: 'Ver más', on: 'en', emailNote: 'Nunca se publica. Solo sirve para reconocerte la próxima vez.',
      required: 'Completa tu nombre, un título y un mensaje.'
    }
  };
  function t(lang) { return STR[lang === 'es' ? 'es' : 'en']; }

  /* ------------------------------------------------------------- DOM utils */

  var S = {
    box: { margin: '44px 0 8px', padding: '22px 24px', border: '1px solid rgba(128,128,128,.28)',
           borderRadius: '14px', background: 'rgba(128,128,128,.06)' },
    h2: { margin: '0 0 6px', fontSize: '1.12rem', lineHeight: '1.3' },
    sub: { margin: '0 0 16px', fontSize: '.88em', opacity: '.72' },
    thread: { margin: '0 0 14px', padding: '14px 16px', border: '1px solid rgba(128,128,128,.22)',
              borderRadius: '10px', background: 'rgba(255,255,255,.04)' },
    tTitle: { margin: '0 0 6px', fontSize: '1em', fontWeight: '600', lineHeight: '1.35' },
    meta: { fontSize: '.82em', opacity: '.7', margin: '0 0 8px' },
    body: { margin: '0 0 8px', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
    tag: { display: 'inline-block', fontSize: '.72em', letterSpacing: '.04em', textTransform: 'uppercase',
           border: '1px solid rgba(128,128,128,.4)', borderRadius: '999px', padding: '1px 8px',
           marginLeft: '8px', opacity: '.75', verticalAlign: 'middle' },
    replyWrap: { margin: '10px 0 0 0', paddingLeft: '14px', borderLeft: '2px solid rgba(128,128,128,.25)' },
    replyItem: { margin: '0 0 10px' },
    btn: { font: 'inherit', fontSize: '.88em', padding: '7px 14px', borderRadius: '8px',
           border: '1px solid rgba(128,128,128,.45)', background: 'transparent', color: 'inherit',
           cursor: 'pointer' },
    link: { textDecoration: 'underline', textUnderlineOffset: '2px', color: 'inherit' },
    form: { margin: '16px 0 0', display: 'block' },
    field: { display: 'block', width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: '.95em',
             padding: '9px 11px', margin: '0 0 9px', borderRadius: '8px',
             border: '1px solid rgba(128,128,128,.4)', background: 'rgba(255,255,255,.06)',
             color: 'inherit' },
    note: { fontSize: '.8em', opacity: '.65', margin: '0 0 10px' },
    status: { fontSize: '.9em', margin: '10px 0 0' },
    hp: { position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' },
    pager: { display: 'flex', gap: '10px', marginTop: '12px' }
  };

  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) { try { Object.assign(n.style, style); } catch (e) {} }
    if (text != null) n.textContent = String(text);
    return n;
  }

  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function api(path, opts) {
    return fetch(API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  /** JSON posted as text/plain so the browser skips the CORS preflight —
      the same trick /go/'s beacon uses against this API. */
  function post(path, payload) {
    return api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });
  }

  /* --------------------------------------------------------------- widgets */

  function buildForm(ctx, opts) {
    var L = t(ctx.lang);
    var wrap = el('div', S.form);
    var t0 = Date.now();

    var name = el('input', S.field);
    name.type = 'text'; name.placeholder = L.name; name.maxLength = 60;
    name.setAttribute('autocomplete', 'name');

    var email = el('input', S.field);
    email.type = 'email'; email.placeholder = L.email; email.maxLength = 200;

    var title = null;
    if (opts.withTitle) {
      title = el('input', S.field);
      title.type = 'text'; title.placeholder = L.title; title.maxLength = 120;
    }

    var body = el('textarea', S.field);
    body.placeholder = L.body; body.rows = opts.withTitle ? 5 : 3; body.maxLength = 3000;

    var dkey = ctx.property + '|' + ctx.post + '|' + (opts.withTitle ? 'new' : opts.threadId);
    var fields = { name: name, email: email, title: title, body: body };
    var draft = DRAFTS[dkey] || {};
    for (var fk in fields) if (fields[fk] && draft[fk]) fields[fk].value = draft[fk];
    wrap.addEventListener('input', function () {
      var cur = {};
      for (var k in fields) if (fields[k]) cur[k] = fields[k].value;
      DRAFTS[dkey] = cur;
    });

    // Honeypot: off-screen, no label, autocomplete off. A human never fills it.
    var hp = el('div', S.hp);
    var hpIn = el('input');
    hpIn.type = 'text'; hpIn.name = 'website'; hpIn.tabIndex = -1;
    hpIn.setAttribute('autocomplete', 'off'); hpIn.setAttribute('aria-hidden', 'true');
    hp.appendChild(hpIn);

    var btn = el('button', S.btn, L.submit);
    btn.type = 'button';

    var status = el('p', S.status);

    // Turnstile only renders where the page declares a site key — true on some
    // netwebmedia.com pages, false on every satellite (their CSP does not allow
    // challenges.cloudflare.com). The server verifies a token when one arrives
    // and never requires one, so both states are valid.
    var tsHolder = null;
    if (window.NWM_TURNSTILE_SITE_KEY && window.NWM_TURNSTILE && window.NWM_TURNSTILE.isActive()) {
      tsHolder = el('div', { margin: '0 0 10px' });
      tsHolder.id = 'nwm-turnstile';
    }

    wrap.appendChild(name);
    wrap.appendChild(email);
    wrap.appendChild(el('p', S.note, L.emailNote));
    if (title) wrap.appendChild(title);
    wrap.appendChild(body);
    wrap.appendChild(hp);
    if (tsHolder) wrap.appendChild(tsHolder);
    wrap.appendChild(btn);
    wrap.appendChild(status);

    btn.addEventListener('click', function () {
      if (!name.value.trim() || !body.value.trim() || (title && !title.value.trim())) {
        status.textContent = L.required;
        return;
      }
      btn.disabled = true;
      status.textContent = L.sending;

      var payload = {
        author: name.value.trim(),
        email: email.value.trim(),
        body: body.value.trim(),
        t0: t0,
        website: hpIn.value
      };
      if (opts.withTitle) {
        payload.property = ctx.property;
        payload.post = ctx.post || null;
        payload.lang = ctx.lang;
        payload.title = title.value.trim();
      } else {
        payload.thread_id = opts.threadId;
      }
      if (window.NWM_TURNSTILE && window.NWM_TURNSTILE.isActive()) {
        payload.cf_turnstile_token = window.NWM_TURNSTILE.getToken();
      }

      post(opts.withTitle ? '/thread' : '/reply', payload).then(function () {
        delete DRAFTS[dkey];
        clear(wrap);
        wrap.appendChild(el('p', S.status, L.pending));
      }).catch(function (e) {
        btn.disabled = false;
        status.textContent = (e && e.message) ? e.message : L.failed;
      });
    });

    if (tsHolder && window.__nwmTurnstileReady) {
      try { window.__nwmTurnstileReady(); } catch (e) {}
    }
    return wrap;
  }

  function renderThreadCard(ctx, th, mode) {
    var L = t(ctx.lang);
    var card = el('article', S.thread);

    var h = el('h3', S.tTitle);
    if (mode === 'index' && th.post) {
      var a = el('a', S.link, th.title);
      a.href = postHref(ctx.property, th.post, th.lang || ctx.lang);
      h.appendChild(a);
    } else {
      h.appendChild(document.createTextNode(th.title));
    }
    if (th.is_seed) h.appendChild(el('span', S.tag, L.starter));
    card.appendChild(h);

    var n = th.replies_count || 0;
    var metaText = th.author + ' · ' + relTime(th.last_activity_at || th.created_at, ctx.lang) +
                   ' · ' + n + ' ' + (n === 1 ? L.reply1 : L.replies);
    card.appendChild(el('p', S.meta, metaText));

    card.appendChild(el('p', S.body, th.body || th.excerpt || ''));

    if (mode === 'post') {
      var actions = el('div');
      var toggle = el('button', S.btn, L.reply);
      toggle.type = 'button';
      actions.appendChild(toggle);
      card.appendChild(actions);

      var panel = el('div', S.replyWrap);
      panel.style.display = 'none';
      card.appendChild(panel);

      var loaded = false;
      toggle.addEventListener('click', function () {
        if (panel.style.display === 'none') {
          panel.style.display = 'block';
          if (!loaded) {
            loaded = true;
            panel.appendChild(el('p', S.note, L.loading));
            api('/thread/' + encodeURIComponent(th.id), { method: 'GET' })
              .then(function (data) {
                clear(panel);
                (data.replies || []).forEach(function (r) {
                  var item = el('div', S.replyItem);
                  var who = r.author + ' · ' + relTime(r.created_at, ctx.lang);
                  item.appendChild(el('p', S.meta, who));
                  item.appendChild(el('p', S.body, r.body));
                  panel.appendChild(item);
                });
                panel.appendChild(buildForm(ctx, { withTitle: false, threadId: th.id }));
              })
              .catch(function () {
                clear(panel);
                panel.appendChild(el('p', S.note, L.loadFailed));
              });
          }
        } else {
          panel.style.display = 'none';
        }
      });
    }
    return card;
  }

  function mount(node) {
    var ctx = {
      property: node.getAttribute('data-community-property') || '',
      post: node.getAttribute('data-community-post') || '',
      lang: node.getAttribute('data-community-follow') === 'html'
        ? (/^en/i.test(document.documentElement.lang || '') ? 'en' : 'es')
        : ((node.getAttribute('data-community-lang') === 'es') ? 'es' : 'en')
    };
    var mode = node.getAttribute('data-community-mode') === 'index' || !ctx.post ? 'index' : 'post';
    if (!ctx.property) return;

    var L = t(ctx.lang);
    var box = el('section', S.box);
    box.setAttribute('aria-label', mode === 'post' ? L.heading : L.indexHeading);
    var head = el('h2', S.h2, mode === 'post' ? L.heading : L.indexHeading);
    box.appendChild(head);
    var list = el('div');
    box.appendChild(list);
    list.appendChild(el('p', S.note, L.loading));
    clear(node);
    node.appendChild(box);

    // The root blog carries a legacy flat comments box. Two comment boxes on one
    // page is worse than either alone — hide it the moment this one mounts.
    var legacy = document.querySelector('#comments.article-comments, .article-comments#comments');
    if (legacy) legacy.style.display = 'none';

    var page = 1;

    function load(append) {
      var q = '/threads?property=' + encodeURIComponent(ctx.property) + '&page=' + page;
      if (mode === 'post') q += '&post=' + encodeURIComponent(ctx.post);
      return api(q, { method: 'GET' }).then(function (data) {
        if (!append) clear(list);
        var threads = data.threads || [];
        if (!threads.length && !append) {
          list.appendChild(el('p', S.note, L.empty));
        }
        threads.forEach(function (th) {
          list.appendChild(renderThreadCard(ctx, th, mode));
        });
        var oldPager = box.querySelector('[data-community-pager]');
        if (oldPager) oldPager.parentNode.removeChild(oldPager);
        if (data.has_more) {
          var pager = el('div', S.pager);
          pager.setAttribute('data-community-pager', '1');
          var more = el('button', S.btn, L.more);
          more.type = 'button';
          more.addEventListener('click', function () { page += 1; load(true); });
          pager.appendChild(more);
          // Directly after the list, so it stays above the "ask a question"
          // form no matter how many pages have been appended.
          list.parentNode.insertBefore(pager, list.nextSibling);
        }
      }).catch(function () {
        if (!append) { clear(list); list.appendChild(el('p', S.note, L.loadFailed)); }
      });
    }

    load(false).then(function () {
      var cta = el('div');
      cta.appendChild(el('h3', S.tTitle, mode === 'post' ? L.start : L.ask));
      cta.appendChild(buildForm(ctx, { withTitle: true }));
      box.appendChild(cta);
    });
  }

  function init() {
    var nodes = document.querySelectorAll('.nwm-community');
    var follows = false;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-community-mounted')) continue;
      nodes[i].setAttribute('data-community-mounted', '1');
      if (nodes[i].getAttribute('data-community-follow') === 'html') follows = true;
      try { mount(nodes[i]); } catch (e) { /* never break the host page */ }
    }
    // golferos' js/main.js fires gec:lang once the page has been re-translated.
    if (follows) {
      document.addEventListener('gec:lang', function () {
        var live = document.querySelectorAll('.nwm-community[data-community-follow="html"]');
        for (var j = 0; j < live.length; j++) {
          try { mount(live[j]); } catch (e) { /* never break the host page */ }
        }
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Node-only export for tests/js/community-widget.test.js. The browser IIFE is
  // unaffected: `module` is undefined there, so this whole block is skipped.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { esc: esc, relTime: relTime, postHref: postHref, STR: STR, t: t };
  }
})();
