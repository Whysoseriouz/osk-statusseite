'use strict';
// Öffentliche Statusseite, JSON-Schnittstelle und RSS-Feed.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const model = require('./model');

// Versionskennung für CSS/JS, damit Browser nach einem Update nicht die alte Datei aus dem Cache nehmen
const ASSET_V = crypto
  .createHash('sha1')
  .update(fs.readFileSync(path.join(__dirname, 'public', 'style.css')))
  .update(fs.readFileSync(path.join(__dirname, 'public', 'admin.js')))
  .update(fs.readFileSync(path.join(__dirname, 'public', 'theme.js')))
  .digest('hex')
  .slice(0, 10);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const paragraphs = (s) =>
  esc(s)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

const ICONS = {
  ok: '<path d="M20 6 9 17l-5-5"/>',
  maint: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>',
};
const THEME_ICONS = {
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  dark: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  system: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
};

// Umschalter Hell / Dunkel / System (ohne JavaScript ausgeblendet)
const themeSwitch = () =>
  `<div class="theme-switch" role="group" aria-label="Darstellung" hidden>${[
    ['light', 'Hell'],
    ['dark', 'Dunkel'],
    ['system', 'Wie System'],
  ]
    .map(
      ([mode, label]) =>
        `<button type="button" data-mode="${mode}" title="${label}" aria-label="${label}" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${THEME_ICONS[mode]}</svg></button>`
    )
    .join('')}</div>`;

const brand = (href, sub) =>
  `<a class="brand" href="${href}"><img class="logo logo-light" src="/static/logo.png" alt="OSK" width="280" height="105"><img class="logo logo-dark" src="/static/logo-dark.png" alt="" width="280" height="105"><span class="brand-sub">${sub}</span></a>`;

const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

function layout({ title, body, bodyClass = '', head = '' }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/style.css?v=${ASSET_V}">
<script src="/static/theme.js?v=${ASSET_V}"></script>
${head}
</head>
<body class="${bodyClass}">
${body}
</body>
</html>`;
}

function componentNames(m, data) {
  return m.components.map((cid) => data.components.find((c) => c.id === cid)?.name).filter(Boolean);
}

function timeline(m, { showPhase = true } = {}) {
  const items = [...m.updates]
    .reverse()
    .map(
      (u) => `<li>
  <div class="tl-head">${showPhase ? `<strong>${esc(model.phaseLabel(m.type, u.phase))}</strong>` : ''}</div>
  <div class="tl-text">${paragraphs(u.text)}</div>
</li>`
    )
    .join('');
  return `<ol class="timeline">${items}</ol>`;
}

function messageCard(m, data, now) {
  const lvl = model.levelKey(m);
  const affected = componentNames(m, data);
  const tag =
    m.type === 'stoerung'
      ? `Störung · ${esc((model.IMPACTS[m.impact] || model.IMPACTS.gering).label)}`
      : esc(model.TYPES[m.type].label);
  return `<article class="msg lvl-${lvl}">
  <header>
    <div class="msg-tags"><span class="tag tag-${lvl}">${tag}</span><span class="phase">${esc(model.effectivePhaseLabel(m, now))}</span></div>
    <h3>${esc(m.title)}</h3>
    ${affected.length ? `<p class="meta">Betroffen: ${affected.map(esc).join(', ')}</p>` : ''}
  </header>
  ${timeline(m)}
</article>`;
}

function publicPage(data, now) {
  const s = data.settings;
  const v = model.compute(data, now);
  const L = model.LEVELS[v.overall];
  const bannerIcon = v.overall === 0 ? 'ok' : v.overall === 1 ? 'maint' : 'alert';

  const notices = v.notices
    .map(
      (m) => `<aside class="notice">
  ${icon('info')}
  <div><h3>${esc(m.title)}</h3>${paragraphs(model.lastUpdate(m).text)}</div>
</aside>`
    )
    .join('');

  const active = v.active.length
    ? `<section><h2>Aktuelle Meldungen</h2>${v.active.map((m) => messageCard(m, data, now)).join('')}</section>`
    : '';

  const components = v.components.length
    ? `<section><h2>Dienste</h2><ul class="components">${v.components
        .map((c) => {
          const cl = model.LEVELS[c.level];
          return `<li><div><span class="c-name">${esc(c.name)}</span>${c.description ? `<span class="c-desc">${esc(c.description)}</span>` : ''}</div><span class="c-status st-${cl.key}"><span class="dot"></span>${esc(cl.label)}</span></li>`;
        })
        .join('')}</ul></section>`
    : '';

  const upcoming = v.upcoming.length
    ? `<section><h2>Geplante Wartungen</h2>${v.upcoming
        .map((m) => {
          const affected = componentNames(m, data);
          return `<article class="msg lvl-maint planned">
  <header>
    <div class="msg-tags"><span class="tag tag-maint">Wartung</span><span class="phase">Angekündigt</span></div>
    <h3>${esc(m.title)}</h3>
    ${affected.length ? `<p class="meta">Betroffen: ${affected.map(esc).join(', ')}</p>` : ''}
  </header>
  <div class="tl-text">${paragraphs(model.lastUpdate(m).text)}</div>
</article>`;
        })
        .join('')}</section>`
    : '';

  let history = '';
  if (v.history.length) {
    const rows = v.history
      .map((m) => {
        const lvl = model.levelKey(m);
        return `<details class="past">
  <summary><span class="tag tag-${lvl}">${esc(model.TYPES[m.type].label)}</span><span class="past-title">${esc(m.title)}</span><span class="phase">${esc(model.effectivePhaseLabel(m, now))}</span></summary>
  ${timeline(m)}
</details>`;
      })
      .join('');
    history = `<section><h2>Vergangene Meldungen</h2>${rows}</section>`;
  } else {
    history = `<section><h2>Vergangene Meldungen</h2><p class="empty">Zurzeit liegen keine vergangenen Meldungen vor.</p></section>`;
  }

  const contactBits = [
    s.supportPhone && `<a href="tel:${esc(s.supportPhone.replace(/[^\d+]/g, ''))}">${esc(s.supportPhone)}</a>`,
    s.supportEmail && `<a href="mailto:${esc(s.supportEmail)}">${esc(s.supportEmail)}</a>`,
    s.supportHours && `<span>${esc(s.supportHours)}</span>`,
  ].filter(Boolean);
  const contact = contactBits.length
    ? `<section class="contact"><h2>Support</h2><p>${contactBits.join('<span class="sep">·</span>')}</p></section>`
    : '';

  const legal = [
    s.impressumUrl && `<a href="${esc(s.impressumUrl)}">Impressum</a>`,
    s.datenschutzUrl && `<a href="${esc(s.datenschutzUrl)}">Datenschutz</a>`,
    '<a href="/feed.xml">RSS-Feed</a>',
  ]
    .filter(Boolean)
    .join('');

  const body = `<header class="site"><div class="wrap">
  ${brand('/', 'Status')}
  ${themeSwitch()}
</div></header>
<main class="wrap">
  ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ''}
  <section class="banner lvl-${L.key}" role="status">
    ${icon(bannerIcon)}
    <div><h1>${esc(L.banner)}</h1><p>Die Seite aktualisiert sich automatisch.</p></div>
  </section>
  ${notices}
  ${active}
  ${components}
  ${upcoming}
  ${history}
  ${contact}
</main>
<footer class="site"><div class="wrap">${legal}</div></footer>`;

  return layout({
    title: `${s.company} – Status`,
    body,
    bodyClass: 'public',
    head: `<meta http-equiv="refresh" content="60">
<meta name="description" content="${esc(s.intro)}">
<link rel="alternate" type="application/rss+xml" title="${esc(s.company)} Status" href="/feed.xml">`,
  });
}

function publicJson(data, now) {
  const v = model.compute(data, now);
  const msg = (m) => ({
    id: m.id,
    type: m.type,
    title: m.title,
    impact: m.impact,
    phase: model.effectivePhaseLabel(m, now),
    components: componentNames(m, data),
    updates: m.updates.map((u) => ({ phase: model.phaseLabel(m.type, u.phase), text: u.text })),
  });
  return {
    status: { level: v.overall, key: model.LEVELS[v.overall].key, text: model.LEVELS[v.overall].banner },
    components: v.components.map((c) => ({ name: c.name, status: model.LEVELS[c.level].key, text: model.LEVELS[c.level].label })),
    active: v.active.map(msg),
    notices: v.notices.map(msg),
    upcoming: v.upcoming.map(msg),
  };
}

function rss(data, now, baseUrl) {
  const s = data.settings;
  const items = [];
  for (const m of data.messages) {
    if (m.type === 'info' && model.state(m, now) === 'geplant') continue;
    for (const u of m.updates) items.push({ m, u });
  }
  items.sort((a, b) => Date.parse(b.u.at) - Date.parse(a.u.at));
  const xml = items
    .slice(0, 50)
    .map(
      ({ m, u }) => `<item>
  <title>${esc(`${model.TYPES[m.type].label}: ${m.title} – ${model.phaseLabel(m.type, u.phase)}`)}</title>
  <link>${esc(baseUrl)}/</link>
  <guid isPermaLink="false">${m.id}-${u.id}</guid>
  <description>${esc(u.text)}</description>
</item>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${esc(s.company)} – Status</title>
<link>${esc(baseUrl)}/</link>
<description>Störungen, Wartungen und Hinweise</description>
<language>de-de</language>
${xml}
</channel>
</rss>`;
}

function notFound() {
  return layout({
    title: 'Seite nicht gefunden',
    bodyClass: 'public',
    body: `<main class="wrap narrow"><h1>Seite nicht gefunden</h1><p><a href="/">Zur Statusseite</a></p></main>`,
  });
}

module.exports = { ASSET_V, brand, themeSwitch, esc, paragraphs, layout, timeline, componentNames, publicPage, publicJson, rss, notFound };
