'use strict';
const https = require('https');
const querystring = require('querystring');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const HOST = 'perdisweb.verkehrs-ag.de';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124';

// ────────────────────────────────────────────────────────────────────────────
// HTTP LAYER
// ────────────────────────────────────────────────────────────────────────────

/** Single raw HTTPS request, no redirect following */
function rawRequest(method, path, extraHeaders, bodyStr) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9',
      'Connection': 'keep-alive',
      ...extraHeaders
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request({ hostname: HOST, path, method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks).toString('latin1')
      }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// COOKIE JAR
// ────────────────────────────────────────────────────────────────────────────

function absorb(jar, setCookieHeader) {
  if (!setCookieHeader) return;
  const lines = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  lines.forEach(line => {
    const kv = line.split(';')[0].trim();
    const eq = kv.indexOf('=');
    if (eq > 0) jar[kv.slice(0, eq).trim()] = kv.slice(eq + 1);
  });
}

function toCookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ────────────────────────────────────────────────────────────────────────────
// SESSION-AWARE GET (follows redirects, accumulates cookies)
// ────────────────────────────────────────────────────────────────────────────

async function sessionGet(path, jar) {
  let current = path;
  for (let hop = 0; hop < 10; hop++) {
    const resp = await rawRequest('GET', current, { 'Cookie': toCookieHeader(jar) });
    absorb(jar, resp.headers['set-cookie']);
    console.log(`[GET ${hop}] ${current} → ${resp.status} | jar: ${Object.keys(jar).join(',') || 'empty'}`);

    const s = resp.status;
    if (s === 301 || s === 302 || s === 303 || s === 307 || s === 308) {
      let loc = resp.headers['location'] || '/';
      if (loc.startsWith('http')) {
        try { loc = new URL(loc).pathname + (new URL(loc).search || ''); } catch {}
      } else if (!loc.startsWith('/')) {
        loc = '/WebComm/' + loc;
      }
      current = loc;
      continue;
    }
    return { resp, path: current };
  }
  throw new Error('Redirect loop');
}

// ────────────────────────────────────────────────────────────────────────────
// HTML HELPERS
// ────────────────────────────────────────────────────────────────────────────

/** Extract all ASP.NET __XXXXX hidden input fields */
function extractHiddenFields(html) {
  const fields = {};
  // Matches: name="__FOO" ... value="BAR"  OR  value="BAR" ... name="__FOO"
  const re = /<input[^>]+>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const nameM  = /name="(__[^"]+)"/i.exec(tag);
    const valueM = /value="([^"]*)"/i.exec(tag);
    if (nameM) fields[nameM[1]] = valueM ? valueM[1] : '';
  }
  return fields;
}

/**
 * Determine whether an HTML page is the PERDIS login page.
 * We look for the presence of the login form fields AND absence of roster content.
 * This works regardless of login success/failure.
 */
function isLoginPage(html) {
  // The login page always has UserName + Password input fields
  const hasLoginForm = /name="UserName"/i.test(html) && /name="Password"/i.test(html);
  // The roster page has content like Dienstplan, roster table, or specific roster identifiers
  // We check for things only present on authenticated pages:
  const hasRosterContent = /roster|dienstplan|Monat|shiprint/i.test(html);
  return hasLoginForm && !hasRosterContent;
}

// ────────────────────────────────────────────────────────────────────────────
// PARSERS
// ────────────────────────────────────────────────────────────────────────────

const MONTH_MAP = {
  'januar':0,'februar':1,'m\u00e4rz':2,'maerz':2,'april':3,'mai':4,
  'juni':5,'juli':6,'august':7,'september':8,'oktober':9,'november':10,'dezember':11
};

/**
 * Parse roster.aspx HTML.
 * The page has <td title="Dienst: 227 \u2022 \u2022 Zeit: 06:30 - 14:28 \u2022 \u2022 Anfangsort: Hauptbahnhof">3</td>
 * Returns: { 'YYYY-MM-DD': [{ dienst, start, end, anfangsort }] }
 */
function parseRoster(html) {
  const roster = {};

  // Detect month+year from heading
  let year  = new Date().getFullYear();
  let month = new Date().getMonth();
  const headM = html.match(/(Januar|Februar|M[\u00e4a]rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
  if (headM) {
    const key = headM[1].toLowerCase().replace('\u00e4','\u00e4');
    month = MONTH_MAP[key] ?? month;
    year  = parseInt(headM[2], 10);
  }

  // Strategy 1: <td title="Dienst: ...">DAY_NUMBER</td>
  const re = /<td([^>]+)>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs    = m[1];
    const inner    = m[2].replace(/<[^>]+>/g, '').trim();
    const titleM   = /title="([^"]+)"/i.exec(attrs);
    if (!titleM) continue;
    const title = titleM[1];
    if (!/Dienst:/i.test(title)) continue;

    const dayNum = parseInt(inner, 10);
    if (!dayNum || dayNum < 1 || dayNum > 31) continue;

    const dienstM = /Dienst:\s*(\S+)/.exec(title);
    const zeitM   = /Zeit:\s*(\d{1,2}:\d{2})\s*[-\u2013]\s*(\d{1,2}:\d{2})/.exec(title);
    const anfangM = /Anfangsort:\s*([^\u2022\n,]+)/.exec(title);
    if (!dienstM) continue;

    const ds = `${year}-${String(month + 1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
    if (!roster[ds]) roster[ds] = [];
    roster[ds].push({
      dienst:     dienstM[1].trim(),
      start:      zeitM ? zeitM[1].padStart(5, '0') : null,
      end:        zeitM ? zeitM[2].padStart(5, '0') : null,
      anfangsort: anfangM ? anfangM[1].trim() : ''
    });
  }

  // Strategy 2 fallback: scan table rows for [1-2 digit day][3-digit service]
  if (Object.keys(roster).length === 0) {
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(html)) !== null) {
      const cells = [];
      const tdRe  = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let td;
      while ((td = tdRe.exec(tr[1])) !== null)
        cells.push(td[1].replace(/<[^>]+>/g, '').trim());
      for (let i = 0; i + 1 < cells.length; i++) {
        if (/^\d{1,2}$/.test(cells[i]) && /^\d{3}$/.test(cells[i + 1])) {
          const ds = `${year}-${String(month+1).padStart(2,'0')}-${cells[i].padStart(2,'0')}`;
          if (!roster[ds]) roster[ds] = [];
          if (!roster[ds].find(x => x.dienst === cells[i+1]))
            roster[ds].push({ dienst: cells[i+1], start: null, end: null, anfangsort: '' });
        }
      }
    }
  }

  return roster;
}

/**
 * Parse shift.aspx (Tagesplan) HTML.
 * Table columns: Dienst | Von-Zeit | Von-Ort | Richtung | Bis-Zeit | Bis-Ort | Abw | Linie | ...
 * Returns: [{ dienst, start, end, vonOrt, bisOrt, richtung, linie }]
 */
function parseShift(html) {
  const rows  = [];
  const trRe  = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html)) !== null) {
    const cells = [];
    const tdRe  = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(tr[1])) !== null)
      cells.push(td[1].replace(/<[^>]+>/g, '').trim());
    if (cells.length < 5) continue;
    const [dienst, vonZeit, vonOrt, richtung, bisZeit, bisOrt = '', , linie = ''] = cells;
    if (!/^\d{1,2}:\d{2}$/.test(vonZeit) || !/^\d{1,2}:\d{2}$/.test(bisZeit)) continue;
    rows.push({
      dienst,
      start:    vonZeit.padStart(5, '0'),
      end:      bisZeit.padStart(5, '0'),
      vonOrt:   vonOrt.trim(),
      bisOrt:   bisOrt.trim(),
      richtung: richtung.trim(),
      linie:    linie.trim()
    });
  }
  return rows;
}

// ────────────────────────────────────────────────────────────────────────────
// ACTIONS
// ────────────────────────────────────────────────────────────────────────────

async function actionLogin(username, password) {
  const jar = {};

  // 1. Load login page → get ViewState + session cookie
  const { resp: loginPageResp } = await sessionGet('/WebComm/default.aspx', jar);
  if (loginPageResp.status !== 200)
    throw new Error(`Login-Seite nicht erreichbar (HTTP ${loginPageResp.status})`);

  const hidden = extractHiddenFields(loginPageResp.body);
  console.log('[LOGIN] Hidden fields:', Object.keys(hidden).join(', '));
  console.log('[LOGIN] Jar after GET:', Object.keys(jar).join(', '));

  if (Object.keys(hidden).length === 0)
    throw new Error('Keine ViewState-Felder gefunden – Login-Seite nicht erkannt');

  // 2. POST login form
  const formBody = querystring.stringify({
    ...hidden,
    UserName: username,
    Password: password,
    Logon: 'Logon'
  });

  const postResp = await rawRequest('POST', '/WebComm/default.aspx', {
    'Content-Type':  'application/x-www-form-urlencoded',
    'Cookie':        toCookieHeader(jar),
    'Referer':       `https://${HOST}/WebComm/default.aspx`,
    'Origin':        `https://${HOST}`
  }, formBody);
  absorb(jar, postResp.headers['set-cookie']);

  console.log('[LOGIN] POST status:', postResp.status);
  console.log('[LOGIN] POST location:', postResp.headers['location'] || '(none)');
  console.log('[LOGIN] POST body[0..400]:', postResp.body.slice(0, 400).replace(/\s+/g, ' '));

  // 3. If POST returned 200 and still shows login form → wrong credentials
  //    ASP.NET shows the form again on bad login, no redirect
  if (postResp.status === 200 && isLoginPage(postResp.body)) {
    return { success: false, error: 'Benutzername oder Passwort falsch' };
  }

  // 4. Follow redirect chain after successful login (302 → homepage / start page)
  if (postResp.status >= 300 && postResp.status < 400) {
    let loc = postResp.headers['location'] || '/WebComm/';
    if (loc.startsWith('http')) {
      try { loc = new URL(loc).pathname + (new URL(loc).search || ''); } catch {}
    } else if (!loc.startsWith('/')) {
      loc = '/WebComm/' + loc;
    }
    console.log('[LOGIN] Following redirect to:', loc);
    await sessionGet(loc, jar); // just collect cookies, ignore body
  }

  console.log('[LOGIN] Jar after redirect chain:', Object.keys(jar).join(', '));

  // 5. Fetch roster.aspx
  const { resp: rosterResp } = await sessionGet('/WebComm/roster.aspx', jar);
  console.log('[LOGIN] roster.aspx status:', rosterResp.status, '| body length:', rosterResp.body.length);
  console.log('[LOGIN] roster.aspx body[0..400]:', rosterResp.body.slice(0, 400).replace(/\s+/g, ' '));

  // 6. If roster page is actually the login page → session didn’t stick
  if (isLoginPage(rosterResp.body)) {
    return { success: false, error: 'Anmeldung fehlgeschlagen – Session konnte nicht aufgebaut werden' };
  }

  const roster = parseRoster(rosterResp.body);
  console.log('[LOGIN] Roster days found:', Object.keys(roster).length);

  return {
    success:  true,
    username: username,
    session:  toCookieHeader(jar),
    roster:   roster
  };
}

async function actionRoster(session) {
  const resp = await rawRequest('GET', '/WebComm/roster.aspx', {
    'Cookie': session
  });
  if (isLoginPage(resp.body))
    return { success: false, error: 'Session abgelaufen – bitte neu anmelden' };
  return { success: true, roster: parseRoster(resp.body) };
}

async function actionShift(session, date) {
  const resp = await rawRequest('GET', `/WebComm/shift.aspx?${date}`, {
    'Cookie': session
  });
  if (isLoginPage(resp.body))
    return { success: false, error: 'Session abgelaufen – bitte neu anmelden' };
  return { success: true, date, rows: parseShift(resp.body) };
}

// ────────────────────────────────────────────────────────────────────────────
// NETLIFY HANDLER
// ────────────────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS')
    return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action = 'login', username, password, session, date } = payload;

  try {
    let result;
    if (action === 'login') {
      if (!username || !password)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ success: false, error: 'Benutzername und Passwort erforderlich' }) };
      result = await actionLogin(username, password);
      return {
        statusCode: result.success ? 200 : 401,
        headers: CORS,
        body: JSON.stringify(result)
      };
    }

    if (action === 'roster') {
      if (!session)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ success: false, error: 'Keine Session' }) };
      result = await actionRoster(session);
      return { statusCode: result.success ? 200 : 401, headers: CORS, body: JSON.stringify(result) };
    }

    if (action === 'shift') {
      if (!session || !date)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ success: false, error: 'session und date erforderlich' }) };
      result = await actionShift(session, date);
      return { statusCode: result.success ? 200 : 401, headers: CORS, body: JSON.stringify(result) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ success: false, error: `Unbekannte action: ${action}` }) };

  } catch (err) {
    console.error('[HANDLER] Uncaught error:', err.message);
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ success: false, error: `Serverfehler: ${err.message}` })
    };
  }
};
