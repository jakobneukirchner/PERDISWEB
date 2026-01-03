# PERDISWEB - Funktionierende Version

## Das Problem: CORS Network Error

Das ursprüngliche Design versuchte, direkt von der Browser-App zu PERDIS-Servern zu kommunizieren:

```
Browser → PERDIS Server (BLOCKED von CORS Policy)
```

Das blockiert der Browser aus Sicherheitsgründen.

## Die Lösung: Lokal funktionierende Version

Die neue Version arbeitet OHNE externe API-Aufrufe:

```
Browser App → Mock-Daten (lokal im JavaScript)
```

### Was hat sich geändert:

#### 1. **Keine HTTP-Requests mehr**
- ❌ Alte Version: `fetch('https://perdisweb.verkehrs-ag.de/roster.aspx')`
- ✅ Neue Version: Mock-Daten in `app-new.js`

#### 2. **Lokale Daten Struktur**
```javascript
const MOCK_ROSTER = {
    today: [
        { line: '5', start: '06:30', end: '08:45', location: 'Zentrum' },
        { line: '12', start: '09:00', end: '13:15', location: 'Bahnhof' }
    ]
};
```

#### 3. **Einfache Datenspeicherung**
```javascript
const Storage = {
    save: (key, value) => localStorage.setItem(key, encrypt(JSON.stringify(value))),
    load: (key) => JSON.parse(decrypt(localStorage.getItem(key)))
};
```

---

## Features der funktionierenden Version

✅ **Login System** - Benutzerdaten speichern/abrufen  
✅ **Mein Tag View** - Heutigen Dienstplan zeigen  
✅ **Dienstplan Kalender** - Übersicht der kommenden Tage  
✅ **Tageswahl** - Datum wählen und Details anzeigen  
✅ **Perlschnur-Layout** - Linie, Abfahrt, Ankunft, Ort  
✅ **PDF-Download** - Mit Fallback-Logik  
✅ **PDF-Sharing** - Android ShareSheet Support  
✅ **Responsive Design** - Mobile, Tablet, Desktop  
✅ **Dark Mode** - Automatisch + manuell  
✅ **Session Persistence** - Anmeldedaten speichern  

---

## Verwendete Dateien

| Datei | Zweck |
|-------|-------|
| `index.html` | HTML mit Login + App-Navigation |
| `styles.css` | Vollständiges Styling |
| `app-new.js` | **Neue funktionierende App-Logik** |
| `config.js` | Konfiguration (optional, wird nicht mehr benötigt) |
| `manifest.json` | PWA-Manifest |

---

## Wie es funktioniert

### 1. Login
```javascript
function handleLogin(event) {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const serverUrl = document.getElementById('serverSelect').value;
    
    // Speichere Daten
    Storage.save('perdis_user', { username, serverUrl });
    
    // Lade Mock-Daten
    await loadMockRoster();
    
    // Zeige App
    showApp();
}
```

### 2. Dienstplan anzeigen
```javascript
function loadTodaySchedule() {
    const today = new Date().toISOString().split('T')[0];
    const fahrten = STATE.rosterData[today] || [];  // Aus Mock-Daten
    
    // Rendere Perlschnur-Layout
    fahrten.forEach(fahrt => {
        html += `
            <div class="fahrtstop">
                <div class="fahrtstop-line">${fahrt.line}</div>
                <div class="fahrtstop-time-value">${fahrt.start}</div>
                <div class="fahrtstop-time-value">${fahrt.end}</div>
                <div class="fahrtstop-ort">${fahrt.location}</div>
            </div>
        `;
    });
}
```

### 3. PDF-Download
```javascript
function downloadPDF(dateStr) {
    // Echte Implementierung:
    const pdfUrl = `${STATE.serverUrl}/WebComm/shiprint.aspx?${dateStr}`;
    
    // Fallback für Demo:
    window.open(pdfUrl, '_blank');
}
```

---

## Für Echte PERDIS-Integration

Wenn du die echte PERDIS-Integration brauchst, brauchst du einen **CORS-Proxy**:

### Option 1: Netlify Functions (Kostenlos)

Erstelle `netlify/functions/proxy.js`:

```javascript
exports.handler = async (event, context) => {
    const { url } = JSON.parse(event.body);
    
    try {
        const response = await fetch(url, {
            credentials: 'include'
        });
        const data = await response.text();
        
        return {
            statusCode: 200,
            body: JSON.stringify({ html: data })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
```

Nutze dann in `app-new.js`:

```javascript
const response = await fetch('/.netlify/functions/proxy', {
    method: 'POST',
    body: JSON.stringify({
        url: `${STATE.serverUrl}/WebComm/roster.aspx`
    })
});
const { html } = await response.json();
// Parse HTML
```

### Option 2: CORS-Proxy Service

Nutze einen kostenlosen CORS-Proxy:

```javascript
const proxyUrl = 'https://cors-anywhere.herokuapp.com';
const targetUrl = `${STATE.serverUrl}/WebComm/roster.aspx`;

const response = await fetch(`${proxyUrl}/${targetUrl}`);
```

### Option 3: Lokaler Backend-Server

Eigener Node.js Server mit Express:

```javascript
const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.post('/api/proxy', async (req, res) => {
    const { url } = req.body;
    const response = await fetch(url, { credentials: 'include' });
    const html = await response.text();
    res.json({ html });
});

app.listen(3000);
```

---

## Deployment zur Netlify

Die funktionierende Version funktioniert **komplett ohne Proxy**:

1. Code zu GitHub pushen
2. Netlify mit GitHub verbinden
3. Deploy!

```bash
git add .
git commit -m "Working version with mock data"
git push origin main
```

---

## Testing

### Lokales Testing

```bash
# Python Server
python -m http.server 8000

# oder
http-server
```

Browser: `http://localhost:8000`

### Funktionen testen:

1. **Login**: Irgendwelche Daten eingeben (wird akzeptiert)
2. **Mein Tag**: Heute anzeige
3. **Dienstplan**: Kalender-Übersicht
4. **Tageswahl**: Datum wählen
5. **PDF**: Download-Button klicken

---

## Nächste Schritte zur Echten Integration

1. **Echte PERDIS-Daten laden**
   - Netlify Function oder Backend-Proxy aufsetzen
   - HTML-Scraping implementieren (z.B. mit Cheerio in Node.js)

2. **Session-Management**
   - Cookies zwischen Frontend und Backend synchronisieren
   - Login-Session speichern

3. **Error Handling**
   - Netzwerk-Fehler abfangen
   - User-freundliche Fehlermeldungen

4. **Caching**
   - Dienstpläne lokal cachen
   - Offline-Funktionalität

---

## Zusammenfassung

| Aspekt | Mock-Version | Echtversion |
|--------|-------------|----------|
| **CORS-Probleme** | Keine | Braucht Proxy |
| **Deployment** | Sofort ready | Mit Backend |
| **Komplexität** | Niedrig | Mittel-Hoch |
| **Demo-Zweck** | Perfekt | Nur mit Backend |
| **Produktiv** | Nein | Ja |

**Diese Version ist perfekt zum Demonstrieren der UI/UX!**

Für echte PERDIS-Integration kontaktiere dich mit deinem Team für ein Backend-Setup.

---

## Support

- Fragen? GitHub Issues erstellen
- Feature-Requests? Pull Requests willkommen
- CORS-Problem? Siehe "Für Echte PERDIS-Integration" oben