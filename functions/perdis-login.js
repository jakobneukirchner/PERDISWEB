const https = require('https');
const querystring = require('querystring');

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ── Low-level HTTPS helper ──────────────────────────────────────────────────
function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('latin1') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Cookie helpers ──────────────────────────────────────────────────────────
function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return {};
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const jar = {};
  arr.forEach(line => {
    const part = line.split(';')[0].trim();
    const eq = part.indexOf('=');
    if (eq > 0) jar[part.slice(0, eq)] = part.slice(eq + 1);
  });
  return jar;
}

function cookieString(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── ASP.NET ViewState extractor ─────────────────────────────────────────────
function extractViewState(html) {
  const fields = {};
  const re = /name="(__[A-Z]+)"[^>]*value="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) fields[m[1]] = m[2];
  return fields;
}

// ── Parse roster.aspx ───────────────────────────────────────────────────────
// The page contains a calendar table. Each day-cell has a title attribute
// like: "Dienst: 227 • • Zeit: 11:15 - 19:58 ..."
// Day-number cells contain just the day number as text, and the service cell
// sits next to it (or uses title on the <td>).
function parseRoster(html) {
  const roster = {};

  // Find year+month from page heading  e.g. "Januar 2026" or from any date hint
  const monthMap = { 'januar':0,'februar':1,'märz':2,'maerz':2,'april':3,'mai':4,'juni':5,'juli':6,'august':7,'september':8,'oktober':9,'november':10,'dezember':11 };
  let year = new Date().getFullYear();
  let month = new Date().getMonth();
  const headMatch = html.match(/(?:Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
  if (headMatch) {
    const mname = headMatch[0].split(/\s+/)[0].toLowerCase();
    month = monthMap[mname] ?? month;
    year = parseInt(headMatch[1]);
  }

  // Strategy: scan all <td> elements for title attributes containing "Dienst:"
  // title example: "Dienst: 227 • • Gültig ab: 24.11.2025 • • Zeit: 11:15 - 19:58 ..."
  const tdRe = /<td[^>]+title="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = tdRe.exec(html)) !== null) {
    const title = m[1];
    const cellContent = m[2].replace(/<[^>]+>/g, '').trim();

    if (!/Dienst:/.test(title)) continue;

    // Extract service number from title
    const dienst = title.match(/Dienst:\s*(\S+)/);
    const zeit = title.match(/Zeit:\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    const anfang = title.match(/Anfangsort:\s*([^•]+)/);

    if (!dienst) continue;

    // The day number: look at cellContent (should be just the number)
    const dayNum = parseInt(cellContent.replace(/\D/g, ''), 10);
    if (!dayNum || dayNum < 1 || dayNum > 31) continue;

    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;

    if (!roster[dateStr]) roster[dateStr] = [];
    roster[dateStr].push({
      dienst: dienst[1].trim(),
      start: zeit ? zeit[1] : null,
      end:   zeit ? zeit[2] : null,
      anfangsort: anfang ? anfang[1].trim().replace(/,.*/, '') : ''
    });
  }

  // Fallback: also try to detect "FF", "F", "WF" (free days) — skip those
  // Also try plain number cells next to service cells for robustness
  if (Object.keys(roster).length === 0) {
    // Alternative: look for cells whose text is a 3-digit number (service number)
    // surrounded by a day-number cell
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(html)) !== null) {
      const row = rowMatch[1];
      const cells = [];
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cm;
      while ((cm = cellRe.exec(row)) !== null) {
        cells.push(cm[1].replace(/<[^>]+>/g, '').trim());
      }
      // Look for pattern: day-number, service-number
      for (let i = 0; i < cells.length - 1; i++) {
        if (/^\d{1,2}$/.test(cells[i]) && /^\d{3}$/.test(cells[i+1])) {
          const dayNum2 = parseInt(cells[i]);
          const svcNum = cells[i+1];
          const dateStr2 = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum2).padStart(2,'0')}`;
          if (!roster[dateStr2]) roster[dateStr2] = [];
          if (!roster[dateStr2].find(x => x.dienst === svcNum)) {
            roster[dateStr2].push({ dienst: svcNum, start: null, end: null, anfangsort: '' });
          }
        }
      }
    }
  }

  return roster;
}

// ── Parse shift.aspx (Tagesplan) ─────────────────────────────────────────────
// The page shows a table with columns:
// Dienst | Von (Zeit) | Ort | Richtung | Bis (Zeit) | Ort | Abw. | Linie | Kurs | Umlauf | Beschreibung
// Rows with bold/header: service summary line
// We want: Dienst-Nr., Startzeit, Endzeit, Startort, Linie
function parseShift(html, dateStr) {
  const rows = [];

  // Extract the data table rows
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRe.exec(html)) !== null) {
    const rowHtml = trMatch[1];
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(rowHtml)) !== null) {
      cells.push(td[1].replace(/<[^>]+>/g, '').trim());
    }

    if (cells.length < 8) continue;

    const [dienst, vonZeit, vonOrt, richtung, bisZeit, bisOrt, abw, linie] = cells;

    // Valid time rows: Von and Bis are HH:MM
    if (!/^\d{2}:\d{2}$/.test(vonZeit) || !/^\d{2}:\d{2}$/.test(bisZeit)) continue;
    // Skip pause/break entries
    if (/pause|wegezeit|arbeitszeit/i.test(richtung) || /pause|wegezeit|arbeitszeit/i.test(bisOrt)) continue;

    rows.push({
      dienst: dienst || '',
      start: vonZeit,
      end: bisZeit,
      vonOrt: vonOrt || '',
      bisOrt: bisOrt || '',
      linie: linie || '',
      richtung: richtung || ''
    });
  }

  return rows;
}

// ── Main handler ────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, username, password, session: sessionIn, date } = body;

  // ── ACTION: login ──────────────────────────────────────────────────────────
  if (!action || action === 'login') {
    if (!username || !password) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Benutzername und Passwort erforderlich' }) };
    }

    try {
      // Step 1: GET login page to retrieve ViewState + cookies
      const getResp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: '/WebComm/default.aspx',
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });

      const jar = parseCookies(getResp.headers['set-cookie']);
      const viewState = extractViewState(getResp.body);
      console.log('[PERDIS] ViewState fields:', Object.keys(viewState).join(', '));

      // Step 2: POST credentials with ViewState
      const formData = querystring.stringify({
        ...viewState,
        UserName: username,
        Password: password,
        Logon: 'Logon'
      });

      const postResp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: '/WebComm/default.aspx',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formData),
          'Cookie': cookieString(jar),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://perdisweb.verkehrs-ag.de/WebComm/default.aspx'
        }
      }, formData);

      // Merge new cookies
      const newCookies = parseCookies(postResp.headers['set-cookie']);
      Object.assign(jar, newCookies);
      const session = cookieString(jar);

      console.log('[PERDIS] Login status:', postResp.status, 'Location:', postResp.headers.location || 'none');
      console.log('[PERDIS] Cookies:', Object.keys(jar).join(', '));

      // Success check: either redirect to roster page, or body doesn't contain login form
      const loginFailed = /Benutzername|Passwort|ungültig|incorrect|invalid/i.test(postResp.body) &&
                          postResp.body.includes('UserName');
      if (loginFailed) {
        return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Benutzername oder Passwort falsch' }) };
      }

      // Step 3: Follow redirect if needed, then fetch roster
      let rosterPath = '/WebComm/roster.aspx';
      if (postResp.status === 302 || postResp.status === 301) {
        rosterPath = postResp.headers.location || rosterPath;
        if (!rosterPath.startsWith('/')) rosterPath = '/WebComm/' + rosterPath;
      }

      const rosterResp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: rosterPath,
        method: 'GET',
        headers: { 'Cookie': session, 'User-Agent': 'Mozilla/5.0' }
      });

      // Merge any new session cookies
      const rc = parseCookies(rosterResp.headers['set-cookie']);
      Object.assign(jar, rc);
      const finalSession = cookieString(jar);

      const roster = parseRoster(rosterResp.body);
      console.log('[PERDIS] Roster days:', Object.keys(roster).length);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: true, username, session: finalSession, roster })
      };

    } catch (err) {
      console.error('[PERDIS] Login error:', err);
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: err.message }) };
    }
  }

  // ── ACTION: roster (refresh) ───────────────────────────────────────────────
  if (action === 'roster') {
    try {
      const rosterResp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: '/WebComm/roster.aspx',
        method: 'GET',
        headers: { 'Cookie': sessionIn, 'User-Agent': 'Mozilla/5.0' }
      });
      const roster = parseRoster(rosterResp.body);
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, roster }) };
    } catch (err) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: err.message }) };
    }
  }

  // ── ACTION: shift ──────────────────────────────────────────────────────────
  if (action === 'shift') {
    if (!date) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'date fehlt' }) };
    try {
      const shiftResp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: `/WebComm/shift.aspx?${date}`,
        method: 'GET',
        headers: { 'Cookie': sessionIn, 'User-Agent': 'Mozilla/5.0' }
      });
      const rows = parseShift(shiftResp.body, date);
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, date, rows }) };
    } catch (err) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: err.message }) };
    }
  }

  return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Unbekannte action' }) };
};
