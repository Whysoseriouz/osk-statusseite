'use strict';
// Zeitumrechnung zwischen UTC (gespeichert) und deutscher Ortszeit (Anzeige/Eingabe).

const TZ = process.env.DISPLAY_TZ || 'Europe/Berlin';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dayFmt = new Intl.DateTimeFormat('de-DE', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function parts(t) {
  const o = {};
  for (const p of partsFmt.formatToParts(new Date(t))) o[p.type] = p.value;
  return o;
}

function offset(t) {
  const s = t - (t % 1000);
  const p = parts(s);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - s;
}

// "2026-10-06T22:00" (Ortszeit aus <input type="datetime-local">) -> ISO-UTC
function fromLocalInput(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const o1 = offset(guess);
  let t = guess - o1;
  const o2 = offset(t);
  if (o2 !== o1) t = guess - o2;
  return new Date(t).toISOString();
}

function toLocalInput(iso) {
  if (!iso) return '';
  const p = parts(Date.parse(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function fmt(iso) {
  const p = parts(Date.parse(iso));
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute} Uhr`;
}

function fmtTime(iso) {
  const p = parts(Date.parse(iso));
  return `${p.hour}:${p.minute}`;
}

function fmtDay(iso) {
  return dayFmt.format(new Date(iso));
}

function sameDay(a, b) {
  const pa = parts(Date.parse(a));
  const pb = parts(Date.parse(b));
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

function fmtRange(start, end) {
  if (!start) return '';
  if (!end) return `ab ${fmt(start)}`;
  if (sameDay(start, end)) return `${fmt(start).replace(' Uhr', '')} – ${fmtTime(end)} Uhr`;
  return `${fmt(start)} – ${fmt(end)}`;
}

module.exports = { TZ, fromLocalInput, toLocalInput, fmt, fmtTime, fmtDay, fmtRange };
