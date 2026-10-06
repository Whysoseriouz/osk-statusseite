'use strict';
// Benutzer (scrypt-Hashes in users.json), Sitzungen im Speicher, CSRF-Schutz und Login-Bremse.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./store');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_TTL = 12 * 3600e3;
const MAX_FAILS = 10;
const FAIL_WINDOW = 15 * 60e3;

const sessions = new Map();
const fails = new Map();

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeUsers(users) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

const DUMMY = hashPassword('dummy-password');

function verify(name, pw) {
  const stored = readUsers()[name] || DUMMY;
  const [, salt, hash] = stored.split('$');
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual) && stored !== DUMMY;
}

function tooManyFails(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() > f.reset) return false;
  return f.count >= MAX_FAILS;
}

function recordFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() > f.reset) fails.set(ip, { count: 1, reset: Date.now() + FAIL_WINDOW });
  else f.count++;
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const s = { user, csrf: crypto.randomBytes(24).toString('hex'), expires: Date.now() + SESSION_TTL };
  sessions.set(token, s);
  return { token, session: s };
}

function getSession(req) {
  const token = parseCookies(req).sid;
  const s = token && sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) {
    sessions.delete(token);
    return null;
  }
  return { token, ...s };
}

function destroySession(token) {
  sessions.delete(token);
}

function checkCsrf(session, value) {
  const a = Buffer.from(session.csrf);
  const b = Buffer.from(String(value || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cookie(token, secure, maxAge) {
  return `sid=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

module.exports = {
  readUsers,
  writeUsers,
  hashPassword,
  verify,
  tooManyFails,
  recordFail,
  createSession,
  getSession,
  destroySession,
  checkCsrf,
  cookie,
  SESSION_TTL,
};
