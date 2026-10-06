'use strict';
// Seiten des Admin-Bereichs (serverseitig gerendert, funktioniert auch ohne JavaScript).

const model = require('./model');
const { fmt, fmtRange, toLocalInput } = require('./time');
const { ASSET_V, brand, themeSwitch, esc, paragraphs, layout, componentNames } = require('./views');

const FLASH = {
  created: 'Meldung veröffentlicht.',
  updated: 'Update veröffentlicht.',
  saved: 'Änderungen gespeichert.',
  deleted: 'Meldung gelöscht.',
  udeleted: 'Update entfernt.',
  cadded: 'Dienst angelegt.',
  cdeleted: 'Dienst gelöscht.',
};

const STATE_LABEL = { aktiv: 'Öffentlich sichtbar', geplant: 'Angekündigt', beendet: 'Beendet' };

const csrfField = (sess) => `<input type="hidden" name="_csrf" value="${esc(sess.csrf)}">`;

function adminLayout({ title, sess, active, body, flash, error }) {
  const nav = [
    ['/admin', 'Meldungen', 'messages'],
    ['/admin/components', 'Dienste', 'components'],
    ['/admin/settings', 'Einstellungen', 'settings'],
  ]
    .map(([href, label, key]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');
  return layout({
    title: `${title} – Statusseite Admin`,
    bodyClass: 'admin',
    head: `<script src="/static/admin.js?v=${ASSET_V}" defer></script><meta name="robots" content="noindex">`,
    body: `<header class="site"><div class="wrap wide">
  ${brand('/admin', 'Status-Admin')}
  <nav class="admin-nav">${nav}<a href="/" target="_blank" rel="noopener">Statusseite ansehen ↗</a></nav>
  ${themeSwitch()}
  <form method="post" action="/admin/logout" class="logout">${csrfField(sess)}<span>${esc(sess.user)}</span><button class="btn-link">Abmelden</button></form>
</div></header>
<main class="wrap wide">
  ${flash && FLASH[flash] ? `<p class="flash ok">${FLASH[flash]}</p>` : ''}
  ${error ? `<p class="flash err">${esc(error)}</p>` : ''}
  ${body}
</main>`,
  });
}

function loginPage({ error, name = '' } = {}) {
  return layout({
    title: 'Anmelden – Statusseite Admin',
    bodyClass: 'admin login',
    head: '<meta name="robots" content="noindex">',
    body: `<main class="wrap narrow">
  <form method="post" action="/admin/login" class="card form login-card">
    <div class="login-head">${brand('/', 'Status-Admin')}${themeSwitch()}</div>
    ${error ? `<p class="flash err">${esc(error)}</p>` : ''}
    <label>Benutzername<input name="name" value="${esc(name)}" autocomplete="username" required autofocus></label>
    <label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn primary">Anmelden</button>
  </form>
</main>`,
  });
}

function messageRow(m, data, now) {
  const st = model.state(m, now);
  const lvl = model.levelKey(m);
  const last = model.lastUpdate(m);
  const tag =
    m.type === 'stoerung' ? `Störung · ${(model.IMPACTS[m.impact] || model.IMPACTS.gering).label}` : model.TYPES[m.type].label;
  const when = m.type !== 'stoerung' && m.start ? ` · ${esc(fmtRange(m.start, m.end))}` : '';
  return `<a class="row" href="/admin/m/${m.id}">
  <span class="tag tag-${lvl}">${esc(tag)}</span>
  <span class="row-main"><strong>${esc(m.title)}</strong><span class="meta">${esc(model.effectivePhaseLabel(m, now))} · letztes Update ${fmt(last.at)}${when}</span></span>
  <span class="state state-${st}">${STATE_LABEL[st]}</span>
</a>`;
}

function dashboard({ data, now, sess, flash }) {
  const open = data.messages.filter((m) => model.state(m, now) !== 'beendet');
  const closed = data.messages
    .filter((m) => model.state(m, now) === 'beendet')
    .sort((a, b) => Date.parse(model.endedAt(b)) - Date.parse(model.endedAt(a)))
    .slice(0, 50);
  open.sort((a, b) => model.level(b) - model.level(a) || Date.parse(model.lastUpdate(b).at) - Date.parse(model.lastUpdate(a).at));
  const v = model.compute(data, now);
  const L = model.LEVELS[v.overall];

  const body = `<div class="page-head">
  <h1>Meldungen</h1>
  <div class="actions">
    <a class="btn danger" href="/admin/new?type=stoerung">+ Störung melden</a>
    <a class="btn" href="/admin/new?type=wartung">+ Wartung ankündigen</a>
    <a class="btn" href="/admin/new?type=info">+ Information</a>
  </div>
</div>
<p class="current">Kunden sehen aktuell: <span class="c-status st-${L.key}"><span class="dot"></span>${esc(L.banner)}</span></p>
<section>
  <h2>Offen</h2>
  ${open.length ? `<div class="rows">${open.map((m) => messageRow(m, data, now)).join('')}</div>` : '<p class="empty">Keine offenen Meldungen.</p>'}
</section>
<section>
  <h2>Abgeschlossen</h2>
  ${closed.length ? `<div class="rows">${closed.map((m) => messageRow(m, data, now)).join('')}</div>` : '<p class="empty">Noch keine abgeschlossenen Meldungen.</p>'}
</section>`;
  return adminLayout({ title: 'Meldungen', sess, active: 'messages', body, flash });
}

function phaseSelect(type, selected, name = 'phase') {
  return `<select name="${name}">${Object.entries(model.TYPES[type].phases)
    .map(([k, label]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(label)}</option>`)
    .join('')}</select>`;
}

// Gemeinsame Felder für "neu" und "bearbeiten"
function metaFields(data, val, { typeLocked }) {
  const types = Object.entries(model.TYPES)
    .map(
      ([k, t]) =>
        `<label class="radio"><input type="radio" name="type" value="${k}"${val.type === k ? ' checked' : ''}${typeLocked && val.type !== k ? ' disabled' : ''}> ${esc(t.label)}</label>`
    )
    .join('');
  const impacts = Object.entries(model.IMPACTS)
    .map(([k, i]) => `<option value="${k}"${val.impact === k ? ' selected' : ''}>${esc(i.label)}</option>`)
    .join('');
  const comps = data.components.length
    ? data.components
        .map(
          (c) =>
            `<label class="check"><input type="checkbox" name="components" value="${c.id}"${val.components.includes(c.id) ? ' checked' : ''}> ${esc(c.name)}</label>`
        )
        .join('')
    : '<p class="hint">Noch keine Dienste angelegt.</p>';
  return `<fieldset class="types"${typeLocked ? ' data-locked' : ''}><legend>Art der Meldung</legend>${types}</fieldset>
<label>Titel <span class="hint">(kurz und für Kunden verständlich)</span><input name="title" value="${esc(val.title)}" maxlength="200" required></label>
<label data-for="stoerung">Auswirkung<select name="impact">${impacts}</select></label>
<fieldset><legend>Betroffene Dienste</legend><div class="checks">${comps}</div></fieldset>
<div class="grid2" data-for="wartung info">
  <label><span data-for="wartung">Beginn der Wartung</span><span data-for="info">Anzeigen ab <span class="hint">(optional)</span></span><input type="datetime-local" name="start" value="${esc(toLocalInput(val.start))}"></label>
  <label><span data-for="wartung">Voraussichtliches Ende</span><span data-for="info">Anzeigen bis <span class="hint">(optional)</span></span><input type="datetime-local" name="end" value="${esc(toLocalInput(val.end))}"></label>
</div>`;
}

function newMessagePage({ data, sess, val, error }) {
  const phases = Object.keys(model.TYPES)
    .map((t) => `<label data-for="${t}">Status${phaseSelect(t, val.phase, `phase_${t}`)}</label>`)
    .join('');
  const body = `<div class="page-head"><h1>Neue Meldung</h1></div>
<form method="post" action="/admin/new" class="card form">
  ${csrfField(sess)}
  ${metaFields(data, val, { typeLocked: false })}
  ${phases}
  <label>Text für Kunden<textarea name="text" rows="6" required placeholder="Was ist passiert, was bedeutet es für Kunden, wann gibt es das nächste Update?">${esc(val.text)}</textarea></label>
  <div class="form-actions"><button class="btn primary">Veröffentlichen</button><a href="/admin" class="btn-link">Abbrechen</a></div>
</form>`;
  return adminLayout({ title: 'Neue Meldung', sess, active: 'messages', body, error });
}

function messagePage({ data, m, now, sess, flash, error }) {
  const st = model.state(m, now);
  const lvl = model.levelKey(m);
  const affected = componentNames(m, data);
  const timeline = [...m.updates]
    .reverse()
    .map(
      (u) => `<li>
  <div class="tl-head"><strong>${esc(model.phaseLabel(m.type, u.phase))}</strong><time>${fmt(u.at)}</time>${u.author ? `<span class="hint">von ${esc(u.author)}</span>` : ''}
  ${
    m.updates.length > 1
      ? `<form method="post" action="/admin/m/${m.id}/u/${u.id}/delete" data-confirm="Dieses Update wirklich entfernen?">${csrfField(sess)}<button class="btn-link danger-link">entfernen</button></form>`
      : ''
  }</div>
  <div class="tl-text">${paragraphs(u.text)}</div>
</li>`
    )
    .join('');

  const body = `<p class="back"><a href="/admin" class="btn-link">← Alle Meldungen</a></p>
<div class="page-head">
  <div>
    <div class="msg-tags"><span class="tag tag-${lvl}">${esc(model.TYPES[m.type].label)}${m.type === 'stoerung' ? ` · ${esc((model.IMPACTS[m.impact] || model.IMPACTS.gering).label)}` : ''}</span><span class="state state-${st}">${STATE_LABEL[st]}</span></div>
    <h1>${esc(m.title)}</h1>
    <p class="meta">Status: <strong>${esc(model.effectivePhaseLabel(m, now))}</strong>${affected.length ? ` · Betroffen: ${affected.map(esc).join(', ')}` : ''}${m.start ? ` · ${esc(fmtRange(m.start, m.end))}` : ''}</p>
  </div>
</div>
<div class="cols">
  <div>
    <form method="post" action="/admin/m/${m.id}/update" class="card form">
      ${csrfField(sess)}
      <h2>Update veröffentlichen</h2>
      <label>Neuer Status${phaseSelect(m.type, m.phase)}</label>
      <label>Text für Kunden<textarea name="text" rows="5" required></textarea></label>
      <div class="form-actions"><button class="btn primary">Update veröffentlichen</button></div>
    </form>
    <section><h2>Verlauf</h2><ol class="timeline">${timeline}</ol></section>
  </div>
  <div>
    <details class="card"${error ? ' open' : ''}>
      <summary><h2>Meldung bearbeiten</h2></summary>
      <form method="post" action="/admin/m/${m.id}/edit" class="form">
        ${csrfField(sess)}
        ${metaFields(data, m, { typeLocked: true })}
        <div class="form-actions"><button class="btn primary">Speichern</button></div>
      </form>
    </details>
    <form method="post" action="/admin/m/${m.id}/delete" class="card danger-zone" data-confirm="Meldung inklusive Verlauf endgültig löschen? Kunden sehen sie danach auch nicht mehr in der Historie.">
      ${csrfField(sess)}
      <h2>Löschen</h2>
      <p class="hint">Nur für Fehleinträge. Erledigte Meldungen besser über den Status „${esc(model.phaseLabel(m.type, model.TYPES[m.type].closed))}“ abschließen.</p>
      <button class="btn danger">Meldung löschen</button>
    </form>
  </div>
</div>`;
  return adminLayout({ title: m.title, sess, active: 'messages', body, flash, error });
}

function componentsPage({ data, sess, flash, error }) {
  const rows = data.components
    .map(
      (c, i) => `<div class="card comp">
  <form method="post" action="/admin/components/${c.id}/edit" class="comp-edit">
    ${csrfField(sess)}
    <label>Name<input name="name" value="${esc(c.name)}" maxlength="80" required></label>
    <label>Beschreibung <span class="hint">(optional)</span><input name="description" value="${esc(c.description)}" maxlength="160"></label>
    <button class="btn">Speichern</button>
  </form>
  <div class="comp-tools">
    <form method="post" action="/admin/components/${c.id}/move">${csrfField(sess)}<input type="hidden" name="dir" value="up"><button class="btn small" title="Nach oben"${i === 0 ? ' disabled' : ''}>↑</button></form>
    <form method="post" action="/admin/components/${c.id}/move">${csrfField(sess)}<input type="hidden" name="dir" value="down"><button class="btn small" title="Nach unten"${i === data.components.length - 1 ? ' disabled' : ''}>↓</button></form>
    <form method="post" action="/admin/components/${c.id}/delete" data-confirm="Dienst „${esc(c.name)}“ löschen?">${csrfField(sess)}<button class="btn small danger">Löschen</button></form>
  </div>
</div>`
    )
    .join('');
  const body = `<div class="page-head"><h1>Dienste</h1></div>
<p class="hint">Diese Dienste sehen Kunden mit ihrem aktuellen Zustand. Der Zustand ergibt sich automatisch aus den offenen Meldungen, die den Dienst betreffen.</p>
${rows || '<p class="empty">Noch keine Dienste angelegt.</p>'}
<form method="post" action="/admin/components" class="card form comp-new">
  ${csrfField(sess)}
  <h2>Neuen Dienst anlegen</h2>
  <div class="grid2">
    <label>Name<input name="name" maxlength="80" required></label>
    <label>Beschreibung <span class="hint">(optional)</span><input name="description" maxlength="160"></label>
  </div>
  <div class="form-actions"><button class="btn primary">Anlegen</button></div>
</form>`;
  return adminLayout({ title: 'Dienste', sess, active: 'components', body, flash, error });
}

function settingsPage({ data, sess, flash, error }) {
  const s = data.settings;
  const f = (name, label, hint = '', type = 'text') =>
    `<label>${label}${hint ? ` <span class="hint">${hint}</span>` : ''}<input type="${type}" name="${name}" value="${esc(s[name])}"></label>`;
  const body = `<div class="page-head"><h1>Einstellungen</h1></div>
<form method="post" action="/admin/settings" class="card form">
  ${csrfField(sess)}
  ${f('company', 'Firmenname', '(erscheint im Seitenkopf)')}
  <label>Einleitungstext<textarea name="intro" rows="3">${esc(s.intro)}</textarea></label>
  <h2>Support-Kontakt</h2>
  <div class="grid2">
    ${f('supportPhone', 'Telefon')}
    ${f('supportEmail', 'E-Mail', '', 'email')}
  </div>
  ${f('supportHours', 'Erreichbarkeit')}
  <h2>Rechtliches</h2>
  <div class="grid2">
    ${f('impressumUrl', 'Link zum Impressum', '', 'url')}
    ${f('datenschutzUrl', 'Link zur Datenschutzerklärung', '', 'url')}
  </div>
  <div class="form-actions"><button class="btn primary">Speichern</button></div>
</form>`;
  return adminLayout({ title: 'Einstellungen', sess, active: 'settings', body, flash, error });
}

module.exports = { loginPage, dashboard, newMessagePage, messagePage, componentsPage, settingsPage };
