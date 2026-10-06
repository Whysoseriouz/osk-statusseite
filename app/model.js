'use strict';
// Fachlogik: Meldungstypen, Phasen, Auswirkungen und die Berechnung des Gesamtstatus.

const TYPES = {
  stoerung: {
    label: 'Störung',
    phases: {
      untersuchung: 'Wird untersucht',
      identifiziert: 'Ursache identifiziert',
      beobachtung: 'Behoben – wird beobachtet',
      behoben: 'Behoben',
    },
    closed: 'behoben',
  },
  wartung: {
    label: 'Wartung',
    phases: { geplant: 'Geplant', laufend: 'In Arbeit', abgeschlossen: 'Abgeschlossen' },
    closed: 'abgeschlossen',
  },
  info: {
    label: 'Information',
    phases: { aktiv: 'Veröffentlicht', archiviert: 'Archiviert' },
    closed: 'archiviert',
  },
};

const IMPACTS = {
  gering: { label: 'Eingeschränkt', level: 2 },
  teilausfall: { label: 'Teilausfall', level: 3 },
  ausfall: { label: 'Ausfall', level: 4 },
};

const LEVELS = [
  { key: 'ok', label: 'Betriebsbereit', banner: 'Alle Systeme sind betriebsbereit' },
  { key: 'maint', label: 'Wartung', banner: 'Es finden Wartungsarbeiten statt' },
  { key: 'minor', label: 'Eingeschränkt', banner: 'Einzelne Dienste sind eingeschränkt' },
  { key: 'major', label: 'Teilausfall', banner: 'Teilweiser Ausfall' },
  { key: 'critical', label: 'Ausfall', banner: 'Größere Störung' },
];

const HISTORY_DAYS = 30;

const ts = (iso) => (iso ? Date.parse(iso) : null);
const lastUpdate = (m) => m.updates[m.updates.length - 1];
const lastAt = (m) => ts(lastUpdate(m).at);

function isClosedPhase(type, phase) {
  return TYPES[type].closed === phase;
}

// Öffentlicher Zustand einer Meldung: 'aktiv' | 'geplant' | 'beendet'
function state(m, now) {
  if (isClosedPhase(m.type, m.phase)) return 'beendet';
  const start = ts(m.start);
  const end = ts(m.end);
  if (m.type === 'stoerung') return 'aktiv';
  if (m.type === 'wartung') {
    if (m.phase === 'laufend') return 'aktiv'; // läuft, bis sie manuell abgeschlossen wird
    if (start === null || now < start) return 'geplant';
    if (end !== null && now >= end) return 'beendet';
    return 'aktiv';
  }
  if (start !== null && now < start) return 'geplant';
  if (end !== null && now >= end) return 'beendet';
  return 'aktiv';
}

function phaseLabel(type, phase) {
  return TYPES[type].phases[phase] || phase;
}

// Phase, wie sie Kunden sehen (geplante Wartung im Zeitfenster gilt als "In Arbeit")
function effectivePhaseLabel(m, now) {
  const st = state(m, now);
  if (m.type === 'wartung' && m.phase === 'geplant' && st === 'aktiv') return phaseLabel('wartung', 'laufend');
  if (st === 'beendet') return phaseLabel(m.type, TYPES[m.type].closed);
  return phaseLabel(m.type, m.phase);
}

function level(m) {
  if (m.type === 'stoerung') return (IMPACTS[m.impact] || IMPACTS.gering).level;
  if (m.type === 'wartung') return 1;
  return 0;
}

// CSS-Schlüssel für Farbe einer Meldung
function levelKey(m) {
  return m.type === 'info' ? 'info' : LEVELS[level(m)].key;
}

function endedAt(m) {
  return m.closedAt || m.end || lastUpdate(m).at;
}

function compute(data, now) {
  const withState = data.messages.map((m) => ({ m, st: state(m, now) }));
  const pick = (fn) => withState.filter(fn).map((x) => x.m);

  const active = pick((x) => x.st === 'aktiv' && x.m.type !== 'info').sort(
    (a, b) => level(b) - level(a) || lastAt(b) - lastAt(a)
  );
  const notices = pick((x) => x.st === 'aktiv' && x.m.type === 'info').sort((a, b) => lastAt(b) - lastAt(a));
  const upcoming = pick((x) => x.st === 'geplant' && x.m.type === 'wartung').sort(
    (a, b) => (ts(a.start) ?? Infinity) - (ts(b.start) ?? Infinity)
  );
  const cutoff = now - HISTORY_DAYS * 864e5;
  const history = pick((x) => x.st === 'beendet' && x.m.type !== 'info' && ts(endedAt(x.m)) >= cutoff).sort(
    (a, b) => ts(endedAt(b)) - ts(endedAt(a))
  );

  const components = data.components.map((c) => ({
    ...c,
    level: Math.max(0, ...active.filter((m) => m.components.includes(c.id)).map(level)),
  }));
  const overall = Math.max(0, ...components.map((c) => c.level), ...active.map(level));

  return { active, notices, upcoming, history, components, overall };
}

module.exports = {
  TYPES,
  IMPACTS,
  LEVELS,
  HISTORY_DAYS,
  state,
  phaseLabel,
  effectivePhaseLabel,
  level,
  levelKey,
  endedAt,
  lastUpdate,
  isClosedPhase,
  compute,
};
