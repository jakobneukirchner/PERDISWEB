# PERDISWEB Deployment zu Netlify

## Automatisches Deployment mit GitHub

### 1. Vorbereitung

Du brauchst:
- [GitHub Account](https://github.com/signup)
- [Netlify Account](https://app.netlify.com/signup) (kostenlos)
- PERDISWEB Repository (Fork oder dein eigenes)

### 2. GitHub Repository

```bash
# Option A: Offizielles Repository forken
# Gehe zu: https://github.com/jakobneukirchner/PERDISWEB
# Klicke auf "Fork"

# Option B: Eigenes Repository erstellen
git clone https://github.com/DEIN-USERNAME/PERDISWEB.git
cd PERDISWEB
git push origin main
```

### 3. Netlify Setup

**Methode 1: Web UI (einfachste)**

1. Gehe zu: https://app.netlify.com
2. Klicke: "Add new site" > "Import an existing project"
3. GitHub auswählen und authorisieren
4. Dein PERDISWEB-Repository auswählen
5. Build settings:
   - Build command: (leer)
   - Publish directory: `.`
   - Deploy!

**Methode 2: Netlify CLI (advanced)**

```bash
# Netlify CLI installieren
npm install -g netlify-cli

# Anmelden
netlify login

# Repository zum Deployment vorbereiten
cd /path/to/PERDISWEB
netlify deploy --prod
```

### 4. Custom Domain

1. Netlify Site Settings öffnen
2. Domain Management
3. "Add domain" klicken
4. Deine Domain eingeben
5. DNS-Records konfigurieren (Anweisungen von Netlify)

---

## Automatische Deploys bei Git Push

Nach dem initialen Setup deployt Netlify automatisch bei jedem `git push`:

```bash
# Änderungen machen
echo "# Update" >> README.md

# Committen
git add .
git commit -m "Update documentation"

# Pushen
git push origin main

# Netlify startet automatisch das Deployment!
```

### Deploy-Status prüfen

1. https://app.netlify.com anmelden
2. Deine Site auswählen
3. "Deploys" Tab
4. Status ansehen

---

## Umgebungsvariablen

### Produktive Secrets

Wenn du sensible Daten speichern musst:

1. Netlify Site Settings > Build & deploy > Environment
2. "Edit variables" klicken
3. Variablen hinzufügen:

```
PERDIS_PROXY_URL=https://dein-proxy-server.com
API_KEY=dein-geheimer-key
```

In JavaScript abrufen:

```javascript
const proxyUrl = process.env.PERDIS_PROXY_URL;
```

---

## Build & Deploy Logs

### Logs ansehen

1. Netlify Site > Deploys
2. Auf Deploy klicken
3. "Deploy log" anschauen

### Debug-Infos

```
[Browser Console (F12)]
Network tab > XHR requests prüfen
Console > Fehler-Messages
```

---

## Performance Optimization

### Caching

In `netlify.toml`:

```toml
[[headers]]
  for = "/styles.css"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/"
  [headers.values]
    Cache-Control = "public, max-age=3600"
```

### Minification

1. JavaScript minifizieren (optional):
   - Tools: https://www.minifyjs.com/
   - oder npm: `npm install -g terser`

2. CSS minifizieren:
   - Tools: https://www.minifycss.com/
   - oder npm: `npm install -g csso-cli`

---

## Monitoring & Analytics

### Netlify Analytics

1. Site Settings > Analytics
2. "Enable Netlify Analytics" (kostenpflichtig)

### Google Analytics

In `index.html` vor `</head>`:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_ID');
</script>
```

---

## Rollback zu vorheriger Version

1. Netlify Site > Deploys
2. Auf älteres Deployment klicken
3. "Restore" klicken

Oder über Git:

```bash
git log  # Commits ansehen
git revert HEAD  # Letzten Commit rückgängig machen
git push origin main  # Netlify deployt automatisch
```

---

## SSL/HTTPS

Netlify aktiviert automatisch Let's Encrypt SSL:
- Genießen Sie kostenlose HTTPS
- Auto-Renewal
- Kein Manual-Setup nötig

---

## Edge Functions (Advanced)

Netzweit unterstützt serverless Functions:

```javascript
// netlify/functions/pdf-proxy.js
export default async (request, context) => {
  const { date } = request.url.split('?')[1].split('=');
  
  const response = await fetch(
    `https://perdis-server.de/shiprint.aspx?${date}`
  );
  
  return response;
};
```

---

## Troubleshooting

### "Deploy failed"

1. Build log prüfen
2. `netlify.toml` Syntax prüfen
3. Publish directory existiert?

### "Site not loading"

1. DNS-Records prüfen (wenn custom domain)
2. Browser-Cache leeren
3. Netlify DNS vs. Custom DNS
4. TLS/SSL zertifikat aktuell?

### "Slow performance"

1. Caching aktivieren
2. JavaScript minifizieren
3. CSS minifizieren
4. Bilder optimieren
5. Netlify Analytics nutzen

---

## Backup & Recovery

### GitHub ist dein Backup

```bash
# Komplette Geschichte in Git
git log --oneline

# Auf beliebigen Commit zurückgehen
git checkout [COMMIT_HASH]

# Zu main zurück
git checkout main
```

### Lokale Kopie

```bash
# Full backup
git clone https://github.com/DEIN-USERNAME/PERDISWEB.git backup/
```

---

## Skalierung

Für viele Nutzer:

1. Netlify Pro upgraden ($19/Monat)
   - Größere Bandwidth
   - Mehr Build-Minuten
   - Erweiterte Analytics

2. CDN ist bereits enthalten
3. DDoS-Schutz aktiviert
4. Auto-Scaling

---

## Support

- Netlify Docs: https://docs.netlify.com
- GitHub Issues: https://github.com/PERDISWEB/issues
- Community: https://github.com/discussions

---

## Checkliste für Go-Live

- [ ] GitHub Repository erstellt
- [ ] Netlify Account angelegt
- [ ] Site connected
- [ ] Build erfolgreich
- [ ] App funktioniert (manuell testen)
- [ ] HTTPS aktiviert
- [ ] Custom domain (optional) konfiguriert
- [ ] Analytics konfiguriert
- [ ] Backup plötze aktiviert
- [ ] Team hinzugefügt (optional)

---

**Glückwunsch! PERDISWEB läuft live!**