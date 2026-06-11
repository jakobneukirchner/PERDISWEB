const https = require('https');
const querystring = require('querystring');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ─── raw HTTPS request (no redirect following) ──────────────────────────────
function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('latin1')
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── cookie jar helpers ──────────────────────────────────────────────────────
function mergeCookies(jar, setCookieHeader) {
  if (!setCookieHeader) return jar;
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  arr.forEach(line => {
    const part = line.split(';')[0].trim();
    const eq = part.indexOf('=');
    if (eq > 0) jar[part.slice(0, eq)] = part.slice(eq + 1);
  });
  return jar;
}

function cookieStr(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ─── follow up to N redirects, accumulating cookies ─────────────────────────
async function get(path, jar) {
  let currentPath = path;
  for (let i = 0; i < 5; i++) {
    const resp = await request({
      hostname: 'perdisweb.verkehrs-ag.de',
      path: currentPath,
      method: 'GET',
      headers: {
        'Cookie': cookieStr(jar),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    mergeCookies(jar, resp.headers['set-cookie']);
    console.log(`[GET] ${currentPath} → ${resp.status}`);

    if (resp.status === 301 || resp.status === 302 || resp.status === 303) {
      let loc = resp.headers.location || '/';
      if (!loc.startsWith('/')) loc = '/WebComm/' + loc;
      currentPath = loc;
      continue;
    }
    return resp;
  }
  throw new Error('Too many redirects');
}

// ─── extract ASP.NET hidden fields ──────────────────────────────────────────
function extractViewState(html) {
  const fields = {};
  // Match both value="..." and value='...'
  const re = /name="(__[A-Z_]+)"[^>]*value="([^"]*)"|name='(__[A-Z_]+)'[^>]*value='([^']*)'/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) fields[m[1]] = m[2];
    else if (m[3]) fields[m[3]] = m[4];
  }
  return fields;
}

// ─── parse roster.aspx ───────────────────────────────────────────────────────
// Each scheduled day has a <td title="Dienst: 227 • • Zeit: 06:30 - 14:28 • • Anfangsort: Hauptbahnhof ...">DD</td>
function parseRoster(html) {
  const roster = {};

  // Detect month/year from heading
  const monthMap = {
    'januar':0,'februar':1,'märz':2,'maerz':2,'april':3,'mai':4,
    'juni':5,'juli':6,'august':7,'september':8,'oktober':9,'november':10,'dezember':11
  };
  let year = new Date().getFullYear();
  let month = new Date().getMonth();
  const hm = html.match(/(Januar|Februar|M[äa]rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
  if (hm) {
    month = monthMap[hm[1].toLowerCase().replace('ä','ä')] ?? month;
    year  = parseInt(hm[2]);
  }

  // Primary: <td title="Dienst: ...">day</td>
  const tdRe = /<td[^>]+title="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/td>/gi;
  let m;
  while ((m = tdRe.exec(html)) !== null) {
    const title = m[1];
    if (!/Dienst:/i.test(title)) continue;

    const cellText = m[2].replace(/<[^>]+>/g, '').trim();
    const dayNum   = parseInt(cellText, 10);
    if (!dayNum || dayNum < 1 || dayNum > 31) continue;

    const dienst  = title.match(/Dienst:\s*(\S+)/);
    const zeit    = title.match(/Zeit:\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    const anfang  = title.match(/Anfangsort:\s*([^•\n,]+)/);
    if (!dienst) continue;

    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
    if (!roster[ds]) roster[ds] = [];
    roster[ds].push({
      dienst:     dienst[1].trim(),
      start:      zeit ? zeit[1].padStart(5,'0') : null,
      end:        zeit ? zeit[2].padStart(5,'0') : null,
      anfangsort: anfang ? anfang[1].trim() : ''
    });
  }

  // Fallback: row scan for pattern [1-2 digit day][3 digit service]
  if (Object.keys(roster).length === 0) {
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(html)) !== null) {
      const cells = [];
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let td;
      while ((td = cellRe.exec(tr[1])) !== null)
        cells.push(td[1].replace(/<[^>]+>/g,'').trim());
      for (let i = 0; i < cells.length - 1; i++) {
        if (/^\d{1,2}$/.test(cells[i]) && /^\d{3}$/.test(cells[i+1])) {
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

// ─── parse shift.aspx ────────────────────────────────────────────────────────
// Columns: Dienst | Von-Zeit | Von-Ort | Richtung | Bis-Zeit | Bis-Ort | Abw | Linie | ...
function parseShift(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html)) !== null) {
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(tr[1])) !== null)
      cells.push(td[1].replace(/<[^>]+>/g,'').trim());
    if (cells.length < 5) continue;
    const [dienst, vonZeit, vonOrt, richtung, bisZeit, bisOrt='', , linie=''] = cells;
    if (!/^\d{1,2}:\d{2}$/.test(vonZeit) || !/^\d{1,2}:\d{2}$/.test(bisZeit)) continue;
    rows.push({ dienst, start: vonZeit.padStart(5,'0'), end: bisZeit.padStart(5,'0'), vonOrt, bisOrt, richtung, linie });
  }
  return rows;
}

// ─── main handler ────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:CORS, body:'' };
  if (event.httpMethod !== 'POST')    return { statusCode:405, headers:CORS, body:JSON.stringify({error:'Method not allowed'}) };

  let body;
  try { body = JSON.parse(event.body||'{}'); }
  catch { return { statusCode:400, headers:CORS, body:JSON.stringify({error:'Invalid JSON'}) }; }

  const { action='login', username, password, session:sessIn, date } = body;

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (action === 'login') {
    if (!username || !password)
      return { statusCode:400, headers:CORS, body:JSON.stringify({success:false,error:'Benutzername und Passwort erforderlich'}) };

    try {
      const jar = {};

      // 1. GET login page → ViewState + initial cookies
      const loginPage = await get('/WebComm/default.aspx', jar);
      const vs = extractViewState(loginPage.body);
      console.log('[LOGIN] ViewState keys:', Object.keys(vs).join(', '));

      // 2. POST credentials
      const formData = querystring.stringify({ ...vs, UserName: username, Password: password, Logon: 'Logon' });
      const postResp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: '/WebComm/default.aspx',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formData),
          'Cookie': cookieStr(jar),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://perdisweb.verkehrs-ag.de/WebComm/default.aspx',
          'Accept': 'text/html,application/xhtml+xml'
        }
      }, formData);
      mergeCookies(jar, postResp.headers['set-cookie']);
      console.log('[LOGIN] POST status:', postResp.status, 'location:', postResp.headers.location||'–');
      console.log('[LOGIN] Cookies after POST:', Object.keys(jar).join(', '));

      // 3. Check login failure (still on login page with error message)
      const stillOnLogin = postResp.status === 200 &&
        postResp.body.includes('UserName') &&
        /falsch|ung[üu]ltig|incorrect|invalid|failed|error/i.test(postResp.body);
      if (stillOnLogin)
        return { statusCode:401, headers:CORS, body:JSON.stringify({success:false,error:'Benutzername oder Passwort falsch'}) };

      // 4. Follow the redirect chain after POST (302 → homepage or wherever)
      let nextPath = postResp.headers.location;
      if (nextPath) {
        if (!nextPath.startsWith('/')) nextPath = '/WebComm/' + nextPath;
        console.log('[LOGIN] Following redirect to:', nextPath);
        // Follow it (just to collect cookies – we don't need the body)
        await get(nextPath, jar);
      }

      console.log('[LOGIN] Cookies after redirect:', Object.keys(jar).join(', '));

      // 5. Now explicitly fetch roster.aspx with the fully built session
      const rosterResp = await get('/WebComm/roster.aspx', jar);
      console.log('[LOGIN] roster.aspx status:', rosterResp.status, 'body length:', rosterResp.body.length);

      // If we're back at the login page, credentials were wrong
      if (rosterResp.body.includes('UserName') && rosterResp.body.includes('Password') && !rosterResp.body.includes('Dienst')) {
        return { statusCode:401, headers:CORS, body:JSON.stringify({success:false,error:'Session konnte nicht aufgebaut werden – bitte Zugangsdaten prüfen'}) };
      }

      const roster = parseRoster(rosterResp.body);
      console.log('[LOGIN] Roster days parsed:', Object.keys(roster).length);

      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ success:true, username, session: cookieStr(jar), roster })
      };

    } catch (err) {
      console.error('[LOGIN] Error:', err);
      return { statusCode:500, headers:CORS, body:JSON.stringify({success:false,error:err.message}) };
    }
  }

  // ── ROSTER refresh ────────────────────────────────────────────────────────
  if (action === 'roster') {
    try {
      const jar = {}; mergeCookies(jar, sessIn ? [sessIn] : []);
      // sessIn is already a cookie string like "key=val; key2=val2"
      // We pass it directly as Cookie header
      const resp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: '/WebComm/roster.aspx',
        method: 'GET',
        headers: { 'Cookie': sessIn, 'User-Agent': 'Mozilla/5.0' }
      });
      const roster = parseRoster(resp.body);
      return { statusCode:200, headers:CORS, body:JSON.stringify({success:true,roster}) };
    } catch (err) {
      return { statusCode:500, headers:CORS, body:JSON.stringify({success:false,error:err.message}) };
    }
  }

  // ── SHIFT detail ──────────────────────────────────────────────────────────
  if (action === 'shift') {
    if (!date) return { statusCode:400, headers:CORS, body:JSON.stringify({success:false,error:'date fehlt'}) };
    try {
      const resp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: `/WebComm/shift.aspx?${date}`,
        method: 'GET',
        headers: { 'Cookie': sessIn, 'User-Agent': 'Mozilla/5.0' }
      });
      const rows = parseShift(resp.body);
      return { statusCode:200, headers:CORS, body:JSON.stringify({success:true,date,rows}) };
    } catch (err) {
      return { statusCode:500, headers:CORS, body:JSON.stringify({success:false,error:err.message}) };
    }
  }

  return { statusCode:400, headers:CORS, body:JSON.stringify({success:false,error:'Unbekannte action'}) };
};
