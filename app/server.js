'use strict';
// HTTP-Server ohne externe Abhängigkeiten. Läuft hinter Caddy (HTTPS).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const auth = require('./auth');
const model = require('./model');
const views = require('./views');
const admin = require('./admin-views');
const { fromLocalInput } = require('./time');

const PORT = Number(process.env.PORT) || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const MAX_BODY = 200 * 1024;

const STATIC = {};
for (const [route, file, type] of [
  ['/static/style.css', 'style.css', 'text/css; charset=utf-8'],
  ['/static/admin.js', 'admin.js', 'text/javascript; charset=utf-8'],
  ['/static/theme.js', 'theme.js', 'text/javascript; charset=utf-8'],
  ['/static/logo.png', 'logo.png', 'image/png'],
  ['/static/logo-dark.png', 'logo-dark.png', 'image/png'],
  ['/favicon.svg', 'favicon.svg', 'image/svg+xml'],
]) {
  const body = fs.readFileSync(path.join(__dirname, 'public', file));
  STATIC[route] = { body, type, etag: '"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 16) + '"' };
}

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...SECURITY_HEADERS, ...headers });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

function redirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, ...SECURITY_HEADERS, ...headers });
  res.end();
}

const clientIp = (req) =>
  (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
const isHttps = (req) => (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https') || !!req.socket.encrypted;
const baseUrl = (req) => PUBLIC_URL || `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;

function readForm(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Anfrage zu groß'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

const clean = (s, max) =>
  String(s || '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
const safeUrl = (s) => (/^https?:\/\/\S+$/i.test(clean(s, 500)) ? clean(s, 500) : '');

// Liest und prüft die Felder einer Meldung (neu oder bearbeiten)
function parseMessageForm(form, type) {
  const data = store.get();
  const val = {
    type,
    title: clean(form.get('title'), 200),
    impact: model.IMPACTS[form.get('impact')] ? form.get('impact') : 'gering',
    components: form.getAll('components').filter((cid) => data.components.some((c) => c.id === cid)),
    start: type === 'stoerung' ? null : fromLocalInput(form.get('start')),
    end: type === 'stoerung' ? null : fromLocalInput(form.get('end')),
  };
  let error = null;
  if (!val.title) error = 'Bitte einen Titel angeben.';
  else if (type === 'wartung' && !val.start) error = 'Bitte den Beginn der Wartung angeben.';
  else if (val.start && val.end && Date.parse(val.end) <= Date.parse(val.start))
    error = 'Das Ende muss nach dem Beginn liegen.';
  return { val, error };
}

async function handleAdmin(req, res, p, url) {
  const flash = url.searchParams.get('ok');

  if (p === '/admin/login') {
    if (req.method === 'GET') return send(res, 200, admin.loginPage());
    if (req.method !== 'POST') return send(res, 405, 'Methode nicht erlaubt', 'text/plain; charset=utf-8');
    const ip = clientIp(req);
    const form = await readForm(req);
    const name = clean(form.get('name'), 40);
    if (auth.tooManyFails(ip))
      return send(res, 429, admin.loginPage({ error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.', name }));
    if (!auth.verify(name, form.get('password') || '')) {
      auth.recordFail(ip);
      return send(res, 401, admin.loginPage({ error: 'Benutzername oder Passwort falsch.', name }));
    }
    const { token } = auth.createSession(name);
    return redirect(res, '/admin', { 'Set-Cookie': auth.cookie(token, isHttps(req), auth.SESSION_TTL / 1000) });
  }

  const sess = auth.getSession(req);
  if (!sess) return redirect(res, '/admin/login');

  const data = store.get();
  const now = Date.now();
  let m;

  if (req.method === 'GET') {
    if (p === '/admin') return send(res, 200, admin.dashboard({ data, now, sess, flash }));
    if (p === '/admin/new') {
      const type = model.TYPES[url.searchParams.get('type')] ? url.searchParams.get('type') : 'stoerung';
      const val = { type, title: '', impact: 'gering', components: [], start: null, end: null, phase: '', text: '' };
      return send(res, 200, admin.newMessagePage({ data, sess, val }));
    }
    if ((m = /^\/admin\/m\/([a-f0-9]+)$/.exec(p))) {
      const msg = store.findMessage(m[1]);
      if (!msg) return redirect(res, '/admin');
      return send(res, 200, admin.messagePage({ data, m: msg, now, sess, flash }));
    }
    if (p === '/admin/components') return send(res, 200, admin.componentsPage({ data, sess, flash }));
    if (p === '/admin/settings') return send(res, 200, admin.settingsPage({ data, sess, flash }));
    return send(res, 404, views.notFound());
  }

  if (req.method !== 'POST') return send(res, 405, 'Methode nicht erlaubt', 'text/plain; charset=utf-8');
  const form = await readForm(req);
  if (!auth.checkCsrf(sess, form.get('_csrf')))
    return send(res, 403, 'Sitzung abgelaufen. Bitte Seite neu laden.', 'text/plain; charset=utf-8');

  if (p === '/admin/logout') {
    auth.destroySession(sess.token);
    return redirect(res, '/admin/login', { 'Set-Cookie': auth.cookie('', isHttps(req), 0) });
  }

  if (p === '/admin/new') {
    const type = model.TYPES[form.get('type')] ? form.get('type') : 'stoerung';
    const { val, error } = parseMessageForm(form, type);
    const phases = Object.keys(model.TYPES[type].phases);
    val.phase = phases.includes(form.get(`phase_${type}`)) ? form.get(`phase_${type}`) : phases[0];
    val.text = clean(form.get('text'), 10000);
    const err = error || (!val.text ? 'Bitte einen Text für die Kunden angeben.' : null);
    if (err) return send(res, 400, admin.newMessagePage({ data, sess, val, error: err }));
    const created = store.createMessage({ ...val, author: sess.user });
    return redirect(res, `/admin/m/${created.id}?ok=created`);
  }

  if ((m = /^\/admin\/m\/([a-f0-9]+)\/(update|edit|delete)$/.exec(p))) {
    const msg = store.findMessage(m[1]);
    if (!msg) return redirect(res, '/admin');
    const action = m[2];
    if (action === 'delete') {
      store.deleteMessage(msg.id);
      return redirect(res, '/admin?ok=deleted');
    }
    if (action === 'update') {
      const phase = model.TYPES[msg.type].phases[form.get('phase')] ? form.get('phase') : msg.phase;
      const text = clean(form.get('text'), 10000);
      if (!text) return send(res, 400, admin.messagePage({ data, m: msg, now, sess, error: 'Bitte einen Text angeben.' }));
      store.addUpdate(msg.id, { phase, text, author: sess.user });
      return redirect(res, `/admin/m/${msg.id}?ok=updated`);
    }
    const { val, error } = parseMessageForm(form, msg.type);
    if (error) return send(res, 400, admin.messagePage({ data, m: msg, now, sess, error }));
    delete val.type;
    store.editMessage(msg.id, val);
    return redirect(res, `/admin/m/${msg.id}?ok=saved`);
  }

  if ((m = /^\/admin\/m\/([a-f0-9]+)\/u\/([a-f0-9]+)\/delete$/.exec(p))) {
    store.deleteUpdate(m[1], m[2]);
    return redirect(res, `/admin/m/${m[1]}?ok=udeleted`);
  }

  if (p === '/admin/components') {
    const name = clean(form.get('name'), 80);
    if (!name) return send(res, 400, admin.componentsPage({ data, sess, error: 'Bitte einen Namen angeben.' }));
    store.addComponent(name, clean(form.get('description'), 160));
    return redirect(res, '/admin/components?ok=cadded');
  }
  if ((m = /^\/admin\/components\/([a-f0-9]+)\/(edit|delete|move)$/.exec(p))) {
    if (m[2] === 'delete') {
      store.deleteComponent(m[1]);
      return redirect(res, '/admin/components?ok=cdeleted');
    }
    if (m[2] === 'move') {
      store.moveComponent(m[1], form.get('dir'));
      return redirect(res, '/admin/components');
    }
    const name = clean(form.get('name'), 80);
    if (!name) return send(res, 400, admin.componentsPage({ data, sess, error: 'Der Name darf nicht leer sein.' }));
    store.editComponent(m[1], name, clean(form.get('description'), 160));
    return redirect(res, '/admin/components?ok=saved');
  }

  if (p === '/admin/settings') {
    store.saveSettings({
      company: clean(form.get('company'), 80) || 'Status',
      intro: clean(form.get('intro'), 1000),
      supportPhone: clean(form.get('supportPhone'), 40),
      supportEmail: clean(form.get('supportEmail'), 120),
      supportHours: clean(form.get('supportHours'), 120),
      impressumUrl: safeUrl(form.get('impressumUrl')),
      datenschutzUrl: safeUrl(form.get('datenschutzUrl')),
    });
    return redirect(res, '/admin/settings?ok=saved');
  }

  return send(res, 404, views.notFound());
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const now = Date.now();

  if (req.method === 'GET' || req.method === 'HEAD') {
    const st = STATIC[p];
    if (st) {
      if (req.headers['if-none-match'] === st.etag) {
        res.writeHead(304, { ETag: st.etag });
        return res.end();
      }
      return send(res, 200, st.body, st.type, { ETag: st.etag, 'Cache-Control': 'public, max-age=300' });
    }
    if (p === '/') return send(res, 200, views.publicPage(store.get(), now), undefined, { 'Cache-Control': 'no-cache' });
    if (p === '/api/status.json')
      return send(res, 200, JSON.stringify(views.publicJson(store.get(), now), null, 2), 'application/json; charset=utf-8', {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
    if (p === '/feed.xml')
      return send(res, 200, views.rss(store.get(), now, baseUrl(req)), 'application/rss+xml; charset=utf-8');
    if (p === '/healthz') return send(res, 200, 'ok', 'text/plain');
    if (p === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /admin\n', 'text/plain');
  }

  if (p === '/admin' || p.startsWith('/admin/')) return handleAdmin(req, res, p, url);
  return send(res, 404, views.notFound());
}

store.load();

http
  .createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, err.status || 500, 'Interner Fehler', 'text/plain; charset=utf-8');
    });
  })
  .listen(PORT, () => {
    console.log(`Statusseite läuft auf Port ${PORT}`);
    if (!Object.keys(auth.readUsers()).length)
      console.log('Hinweis: Noch kein Admin-Benutzer. Anlegen mit: node cli.js user add <name>');
  });
