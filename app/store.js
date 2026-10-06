'use strict';
// Datenhaltung in einer JSON-Datei (atomar geschrieben). Reicht für eine Statusseite völlig aus.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TYPES, isClosedPhase } = require('./model');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'status.json');

const id = () => crypto.randomBytes(6).toString('hex');
const nowIso = () => new Date().toISOString();

function defaults() {
  return {
    settings: {
      company: 'OSK',
      intro: 'Auf dieser Seite informieren wir Sie über Störungen, geplante Wartungsarbeiten und wichtige Hinweise zu unseren Diensten.',
      supportPhone: '',
      supportEmail: '',
      supportHours: 'Mo–Fr 8:00–17:00 Uhr',
      impressumUrl: '',
      datenschutzUrl: '',
    },
    components: [
      { id: id(), name: 'Anwendung (ASP)', description: 'Zugriff auf die gehostete Anwendung' },
      { id: id(), name: 'Remote-Zugang', description: 'Terminalserver / Remote-Desktop' },
      { id: id(), name: 'Schnittstellen', description: 'Datenaustausch mit Drittsystemen' },
      { id: id(), name: 'Support-Hotline', description: 'Telefonische Erreichbarkeit' },
    ],
    messages: [],
  };
}

let data;

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    data.settings = { ...defaults().settings, ...data.settings };
  } else {
    data = defaults();
    save();
  }
}

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

const get = () => data;
const findMessage = (mid) => data.messages.find((m) => m.id === mid);

function setPhase(m, phase) {
  const wasClosed = isClosedPhase(m.type, m.phase);
  m.phase = phase;
  const closed = isClosedPhase(m.type, phase);
  if (closed && !wasClosed) m.closedAt = nowIso();
  if (!closed) delete m.closedAt;
}

function createMessage({ type, title, impact, components, start, end, phase, text, author }) {
  const at = nowIso();
  const m = {
    id: id(),
    type,
    title,
    impact: type === 'stoerung' ? impact : null,
    components,
    start,
    end,
    phase: TYPES[type].closed === phase ? Object.keys(TYPES[type].phases)[0] : phase,
    createdAt: at,
    updates: [{ id: id(), at, phase, text, author }],
  };
  setPhase(m, phase);
  data.messages.push(m);
  save();
  return m;
}

function addUpdate(mid, { phase, text, author }) {
  const m = findMessage(mid);
  if (!m) return null;
  m.updates.push({ id: id(), at: nowIso(), phase, text, author });
  setPhase(m, phase);
  save();
  return m;
}

function editMessage(mid, fields) {
  const m = findMessage(mid);
  if (!m) return null;
  Object.assign(m, fields);
  if (m.type !== 'stoerung') m.impact = null;
  save();
  return m;
}

function deleteMessage(mid) {
  data.messages = data.messages.filter((m) => m.id !== mid);
  save();
}

function deleteUpdate(mid, uid) {
  const m = findMessage(mid);
  if (!m || m.updates.length < 2) return null;
  m.updates = m.updates.filter((u) => u.id !== uid);
  setPhase(m, m.updates[m.updates.length - 1].phase);
  save();
  return m;
}

function addComponent(name, description) {
  data.components.push({ id: id(), name, description });
  save();
}

function editComponent(cid, name, description) {
  const c = data.components.find((x) => x.id === cid);
  if (!c) return;
  c.name = name;
  c.description = description;
  save();
}

function deleteComponent(cid) {
  data.components = data.components.filter((c) => c.id !== cid);
  for (const m of data.messages) m.components = m.components.filter((x) => x !== cid);
  save();
}

function moveComponent(cid, dir) {
  const i = data.components.findIndex((c) => c.id === cid);
  const j = i + (dir === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= data.components.length) return;
  [data.components[i], data.components[j]] = [data.components[j], data.components[i]];
  save();
}

function saveSettings(settings) {
  data.settings = { ...data.settings, ...settings };
  save();
}

module.exports = {
  DATA_DIR,
  load,
  get,
  findMessage,
  createMessage,
  addUpdate,
  editMessage,
  deleteMessage,
  deleteUpdate,
  addComponent,
  editComponent,
  deleteComponent,
  moveComponent,
  saveSettings,
};
