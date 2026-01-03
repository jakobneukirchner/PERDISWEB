# PERDISWEB - Quick Start Guide

## In 5 Minuten auf Netlify deployen

### Schritt 1: GitHub Fork erstellen

1. Gehe zu: https://github.com/jakobneukirchner/PERDISWEB
2. Klicke auf "Fork" (oben rechts)
3. "Create fork" klicken

### Schritt 2: Netlify verbinden

1. Gehe zu: https://netlify.com
2. Mit GitHub anmelden (oder neuen Account erstellen)
3. "Add new site" > "Import an existing project" klicken
4. GitHub wählen
5. Dein PERDISWEB-Repository auswählen

### Schritt 3: Deploy Settings

**Build command:** (leer lassen oder `echo 'Static site'`)

**Publish directory:** `.` (der Root-Ordner)

**Deploy!** Button klicken

### Schritt 4: Fertig!

Nachdem Netlify das Deployment abgeschlossen hat:

- Deine App ist online unter: `https://[random-name].netlify.app`
- Custom Domain hinzufügen unter: Settings > Domain Management

---

## Lokale Entwicklung

### Python Server (einfachste Möglichkeit)

```bash
# Repository klonen
git clone https://github.com/dein-username/PERDISWEB.git
cd PERDISWEB

# Python Server starten
python -m http.server 8000

# Browser: http://localhost:8000
```

### Node.js (mit Live-Reload)

```bash
npm install -g http-server
http-server
```

### VS Code Live Server Extension

1. VS Code Extension "Live Server" installieren
2. `index.html` rechtsklick > "Open with Live Server"

---

## Erste Nutzung

1. App öffnen
2. PERDIS-Server auswählen (z.B. Verkehrs-AG)
3. Benutzername + Passwort eingeben
4. "Anmelden" klicken
5. Dienstplan wird automatisch geladen!

---

## Tabel: Unterstützte PERDIS-Server

| Server | URL |
|--------|-----|
| Verkehrs-AG | https://perdisweb.verkehrs-ag.de |
| RegioBus | https://perdis.regiobus.de |
| Stadtwerke Bielefeld | https://anwendungen.stadtwerke-bielefeld.de |
| ICB Frankfurt | https://perdis-info.icb-ffm.de |

---

## Anpassungen für deine Organisation

### Server hinzufügen

In `config.js`:

```javascript
CONFIG.PERDIS_SERVERS = {
    'https://perdisweb.verkehrs-ag.de': 'Verkehrs-AG',
    'https://dein-perdis-server.de': 'Deine Organisation'
};
```

### Farben anpassen

In `styles.css`:

```css
:root {
    --primary: #1f563b;  /* Hauptfarbe ändern */
    --primary-light: #2e7d56;
    --primary-dark: #0d3a26;
}
```

### Logo/Branding

`index.html` ändern:

```html
<h1 class="logo">DEIN-NAME</h1>
```

---

## Tipps & Tricks

### Dark Mode testen

Browser-DevTools (F12) > drei Punkte > More tools > Rendering > Emulate CSS media feature > prefers-color-scheme: dark

### Mobile testen

Browser-DevTools (F12) > Responsive Design Mode (Ctrl+Shift+M)

### Bugs melden

Browser-Konsole öffnen (F12)

1. Aktion ausführen die Fehler verursacht
2. Fehler in der Console prüfen
3. GitHub Issue erstellen mit: Screenshot + Fehler-Message + Browser/OS

---

## FAQ

### Kann ich die App auf meinem Home Screen installieren?

Ja! Safari/Chrome > Menu > "Add to Home Screen" / "In App installieren"

### Funktioniert es offline?

Noch nicht. Service Worker wird in v2 implementiert.

### Sind meine Daten sicher?

Ja! Passwort wird gehashed und Daten werden verschlüsselt lokal gespeichert.

### Kann ich mehrere Servers nutzen?

Ja! Einfach beim Login einen anderen Server auswählen.

---

## Troubleshooting

### "CORS Error" beim Login

Das ist normal. PERDIS hat CORS-Restrictions. Nutze die Proxy-Functions (siehe README).

### PDF wird nicht angezeigt

Some PERDIS instances blocken PDF-Downloads. Try mit einem anderen Server.

### Dienstplan ist leer

Check ob der ausgewählte Tag Schichten hat oder ob du keine Dienste hast.

---

## Nächste Schritte

1. [README.md](README.md) lesen - komplette Dokumentation
2. [Sourcecode](.) erkunden - alle JavaScript-Dateien kommentiert
3. Anpassungen vornehmen - Fork, ändern, push, redeploy!

Viel Spaß mit PERDISWEB!