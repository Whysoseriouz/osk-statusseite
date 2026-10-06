# Statusseite – status.kis-asp.de

Eigene, schlanke Statusseite, auf der wir Kunden über Störungen, geplante Wartungen und allgemeine Hinweise informieren.

- **Öffentlich:** `https://status.kis-asp.de` (aktualisiert sich alle 60 Sekunden automatisch)
- **Admin:** `https://status.kis-asp.de/admin`
- **Maschinenlesbar:** `/api/status.json` (z. B. für einen Hinweis-Banner in der Anwendung), `/feed.xml` (RSS zum Abonnieren)

Technik: Node.js ohne externe Pakete, Daten in einer JSON-Datei, Caddy davor für automatisches HTTPS (Let's Encrypt). Es werden keine externen Schriften, CDNs oder Tracker geladen.

---

## 1. DNS

| Name | Typ | Wert | TTL |
|---|---|---|---|
| `status.kis-asp.de` | A | `2.29.61.95` | 300 |

Falls der Server IPv6 hat, zusätzlich einen `AAAA`-Eintrag anlegen.

Prüfen, ob der Eintrag schon greift:

```bash
nslookup status.kis-asp.de
```

## 2. Server vorbereiten (einmalig)

Voraussetzungen: Linux mit Docker und Docker Compose. Die Ports **80 und 443** müssen aus dem Internet erreichbar sein (Let's Encrypt prüft über Port 80).

```bash
# Ordner auf den Server kopieren, z. B. nach /opt/statusseite
scp -r kundeninfoseite root@2.29.61.95:/opt/statusseite
ssh root@2.29.61.95
cd /opt/statusseite

cp .env.example .env
nano .env        # DOMAIN und ACME_EMAIL prüfen

docker compose up -d --build
```

## 3. Admin-Benutzer anlegen

```bash
docker compose exec app node cli.js user add dominik
```

Das Passwort wird zweimal abgefragt (mindestens 10 Zeichen). Weitere Befehle:

```bash
docker compose exec app node cli.js user list
docker compose exec app node cli.js user del <name>
```

Danach unter `https://status.kis-asp.de/admin` anmelden und unter **Einstellungen** Support-Kontakt sowie die Links zu Impressum und Datenschutz eintragen. Impressum und Datenschutz sind für eine öffentliche Seite in Deutschland Pflicht. Unter **Dienste** die Beispieldienste an die echten Dienste anpassen.

## Bedienung

| Meldungsart | Wofür | Ablauf |
|---|---|---|
| **Störung** | ungeplante Probleme | Auswirkung wählen (Eingeschränkt / Teilausfall / Ausfall), dann Updates mit Status *Wird untersucht → Ursache identifiziert → Behoben – wird beobachtet → Behoben* |
| **Wartung** | geplante Arbeiten | Beginn und Ende angeben. Bis zum Beginn erscheint sie unter „Geplante Wartungen“, im Zeitfenster automatisch als laufend und danach in der Historie. Läuft eine Wartung länger, den Status auf *In Arbeit* setzen. Sie bleibt dann sichtbar, bis sie auf *Abgeschlossen* gesetzt wird. |
| **Information** | allgemeine Hinweise | Wird als Hinweisbox oben angezeigt, optional mit Zeitraum (anzeigen ab/bis) |

- Die Kundenseite zeigt **keine Datums- oder Uhrzeitangaben** an, auch nicht den Zeitraum einer Wartung. Beginn und Ende steuern nur intern, wann die Wartung als laufend bzw. beendet gilt. Soll der Kunde den Termin sehen, schreibt man ihn in den Text.
- Der Zustand der **Dienste** (grün/blau/gelb/orange/rot) und das **Banner** oben ergeben sich automatisch aus den offenen Meldungen.
- Kunden sehen abgeschlossene Störungen und Wartungen noch **30 Tage** in der Historie.
- **Löschen** ist nur für Fehleinträge gedacht. Normale Meldungen werden über den Status abgeschlossen.
- Intern wird festgehalten, wer welches Update geschrieben hat. Kunden sehen das nicht.

### Textvorlage Störung

> Seit ca. HH:MM Uhr kommt es bei [Dienst] zu [Symptom]. Wir arbeiten mit Hochdruck an der Behebung. Das nächste Update folgt spätestens um HH:MM Uhr.

## Betrieb

```bash
docker compose logs -f              # Logs ansehen
docker compose pull && docker compose up -d --build   # Update
```

**Backup:** Alle Inhalte liegen im Docker-Volume `statusdata` (`status.json` = Meldungen, `users.json` = Benutzer).

```bash
docker compose exec app cat /data/status.json > backup-status-$(date +%F).json
```

**Wichtig:** Die Statusseite sollte **nicht** auf derselben Infrastruktur laufen wie die ASP-Umgebung, sonst ist sie bei einem Ausfall ebenfalls weg.

## Lokal testen (ohne Docker)

```bash
cd app
echo "EinTestPasswort1" | node cli.js user add test
node server.js      # http://localhost:3000
```

Die Daten landen dann in `./data`.
