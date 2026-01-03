# PERDISWEB - PERDIS Dienstplan WebApp

Eine moderne WebApp zum Abrufen und Verwalten von PERDIS-Dienstplänen mit Unterstützung für PDF-Download und mobiles Sharing.

## Features

- **Unsichtbarer WebView-Login** - Automatische Authentifizierung im Hintergrund
- **Mein Tag** - Schnellzugriff auf den heutigen Dienstplan
- **Dienstplan-Kalender** - Übersicht der kommenden Tage
- **Tageswahl** - Kalender-Widget zur flexiblen Datumsauswahl
- **Perlschnur-Layout** - Übersichtliche Darstellung wie in PERDIS (Linie, Abfahrt, Ankunft, Ort)
- **PDF-Viewer** - In-App PDF-Anzeige
- **PDF-Download & Versand** - Kostenlose Dienstpläne herunterladen oder über Android ShareSheet versenden
- **Automatisches Re-Login** - Neu anmelden alle 30 Tage
- **Responsive Design** - Funktioniert auf Desktop, Tablet und Smartphone
- **Dark Mode** - Unterstüzung für dunkles Design
- **PWA-Support** - Installierbar als App auf dem Startbildschirm
- **Datenschutz** - Verschlüsselte lokale Speicherung von Anmeldedaten

## Installation

### Voraussetzungen
- Git
- Node.js (für lokale Entwicklung)
- Netlify Account (für Deployment)

### Lokale Entwicklung

```bash
# Repository klonen
git clone https://github.com/yourusername/PERDISWEB.git
cd PERDISWEB

# Lokalen Server starten (z.B. mit Python)
python -m http.server 8000

# Browser öffnen
open http://localhost:8000
```

### Deployment auf Netlify

1. Repository auf GitHub pushen
2. [Netlify](https://netlify.com) öffnen und anmelden
3. "New site from Git" klicken
4. GitHub-Repository auswählen
5. Build settings:
   - Build command: `echo 'Static site'`
   - Publish directory: `.`
6. Deploy!

Oder mit Netlify CLI:

```bash
npm install -g netlify-cli
netlify login
netlify deploy
```

## Nutzung

### Erste Anmeldung

1. PERDIS-URL aus dem Dropdown wählen
2. Benutzername eingeben
3. Passwort eingeben
4. "Anmelden" klicken

### Dienstplan abrufen

**Mein Tag:**
- Zeigt automatisch den heutigen Dienstplan
- Wird beim App-Start geladen

**Dienstplan:**
- Klicken Sie auf einen Tag im Kalender
- Zeigt alle Fahrten des ausgewählten Tages

**Tageswahl:**
- Wählen Sie ein Datum mit dem Kalender-Widget
- "Anzeigen" klicken
- Sehen Sie den Dienstplan in der Perlschnur-Darstellung

### PDF-Funktionen

**Ansehen:**
- Button "PDF ansehen" klicken
- PDF öffnet sich im In-App-Viewer

**Herunterladen:**
- PDF öffnet sich im Modal
- Button "Download" klicken
- PDF wird im Download-Ordner gespeichert

**Versenden:**
- PDF öffnet sich im Modal
- Button "Teilen" klicken
- Android ShareSheet öffnet sich
- Wählen Sie die Sharing-App Ihrer Wahl

### Abmelden

- Button "Abmelden" in der oberen rechten Ecke klicken
- Alle lokalen Daten werden gelöscht
- Sie werden zur Anmeldeseite weitergeleitet

## Unterstützte PERDIS-Server

- Verkehrs-AG: `https://perdisweb.verkehrs-ag.de`
- RegioBus: `https://perdis.regiobus.de`
- Stadtwerke Bielefeld: `https://anwendungen.stadtwerke-bielefeld.de`
- ICB Frankfurt: `https://perdis-info.icb-ffm.de`

*Weitere Server können in `config.js` hinzugefügt werden.*

## Architektur

```
PERDISWEB/
├── index.html           # HTML-Struktur
├── styles.css           # Styling mit Material Design 3
├── config.js            # Konfiguration & Utilities
├── auth.js              # Authentifizierung
├── scraper.js           # Dienstplan-Scraping & PDF
├── ui.js                # UI-Rendering & Event-Handler
├── app.js               # Hauptanwendung
├── manifest.json        # PWA-Manifest
├── netlify.toml         # Netlify-Konfiguration
├── README.md            # Diese Datei
└── .gitignore           # Git-Ignore Regeln
```

## Technologie-Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Session-Management:** Secure LocalStorage
- **HTML-Parsing:** DOM Parser API
- **PDF:** Native PERDIS PDF-API
- **Hosting:** Netlify (Static Site)
- **PWA:** Web App Manifest

## Sicherheit

- Passwörter werden gehashed lokal gespeichert
- Session wird verschlüsselt in LocalStorage gespeichert
- Auto-Logout nach 30 Tagen
- Browser-Cookies für Session-Management
- HTTPS nur auf Netlify-Domain

## Datenschutz

Diese App speichert lokal:
- Benutzername (verschlüsselt)
- Passwort-Hash (lokale Verifikation)
- Session-Token
- Gecachte Dienstpläne (1 Stunde)

**Nicht speichern:**
- Passwort im Klartext
- Sensible Daten auf Servern
- Cookies außerhalb der Session

## Browserkompatibilität

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile Browsers (iOS Safari, Chrome Android)

## Troubleshooting

### Login schlägt fehl

1. Benutzername und Passwort überprüfen
2. Richtige PERDIS-URL auswählen
3. Internetverbindung kontrollieren
4. Browser-Cookies aktiviert?
5. Browser-Cache leeren (Strg+Shift+Del)

### Dienstplan wird nicht angezeigt

1. Browser-Konsole öffnen (F12)
2. Auf Fehlermeldungen prüfen
3. Internet-Verbindung kontrollieren
4. PERDIS-Server erreichbar?
5. App neu laden (F5)

### PDF kann nicht heruntergeladen werden

1. Pop-ups aktiviert?
2. Download-Ordner beschreibbar?
3. Ausreichend Speicherplatz?
4. PDF-Dateiformat unterstützt?

## Lizenz

MIT License

## Support

Bei Fragen oder Problemen:

1. GitHub Issues erstellen
2. Fehlerlog aus Browser-Konsole kopieren
3. PERDIS-Server angeben
4. Schritte zum Reproduzieren beschreiben

## Changelog

### v1.0.0
- Initial Release
- Login-System
- Dienstplan-Scraping
- PDF-Viewer & Download
- Mobile-optimiert
- PWA-Support

## Credits

Entwickelt als inoffizieller Dienstplan-Manager für PERDIS-Nutzer.

---

**Hinweis:** Dies ist eine inoffizielle App. PERDIS ist eine registrierte Marke von INIT GmbH.