const https = require('https');
const querystring = require('querystring');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ─── raw HTTPS (no auto-redirect) ────────────────────────────────────────────
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

// ─── cookie helpers ───────────────────────────────────────────────────────────
function mergeCookies(jar, header) {
  if (!header) return;
  (Array.isArray(header) ? header : [header]).forEach(line => {
    const part = line.split(';')[0].trim();
    const eq = part.indexOf('=');
    if (eq > 0) jar[part.slice(0, eq)] = part.slice(eq + 1);
  });
}
function cookieStr(jar) {
  return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
}

// ─── follow redirects (GET only), accumulate cookies ─────────────────────────
async function getFollow(startPath, jar) {
  let path = startPath;
  for (let i = 0; i < 8; i++) {
    const resp = await request({
      hostname: 'perdisweb.verkehrs-ag.de',
      path,
      method: 'GET',
      headers: {
        'Cookie': cookieStr(jar),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*'
      }
    });
    mergeCookies(jar, resp.headers['set-cookie']);
    console.log(`[GET] ${path} → ${resp.status} | cookies: ${Object.keys(jar).join(', ')}`);

    if (resp.status === 301 || resp.status === 302 || resp.status === 303 || resp.status === 307) {
      let loc = resp.headers.location || '/';
      // Make absolute
      if (loc.startsWith('http')) {
        const u = new URL(loc);
        path = u.pathname + u.search;
      } else if (!loc.startsWith('/')) {
        path = '/WebComm/' + loc;
      } else {
        path = loc;
      }
      console.log(`[REDIRECT] → ${path}`);
      continue;
    }
    return { resp, finalPath: path };
  }
  throw new Error('Too many redirects');
}

// ─── extract ASP.NET hidden fields ───────────────────────────────────────────
function extractHidden(html) {
  const fields = {};
  // value before or after name attribute
  const re1 = /name="(__[^"]+)"[^>]*value="([^"]*)"/g;
  const re2 = /value="([^"]*)"[^>]*name="(__[^"]+)"/g;
  let m;
  while ((m = re1.exec(html)) !== null) fields[m[1]] = m[2];
  while ((m = re2.exec(html)) !== null) fields[m[2]] = fields[m[2]] || m[1];
  return fields;
}

// ─── parse roster.aspx ───────────────────────────────────────────────────────
function parseRoster(html) {
  const roster = {};
  const monthMap = {
    'januar':0,'februar':1,'märz':2,'maerz':2,'april':3,'mai':4,
    'juni':5,'juli':6,'august':7,'september':8,'oktober':9,'november':10,'dezember':11
  };
  let year = new Date().getFullYear();
  let month = new Date().getMonth();
  const hm = html.match(/(Januar|Februar|M[äa]rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
  if (hm) {
    month = monthMap[hm[1].toLowerCase()] ?? month;
    year  = parseInt(hm[2]);
  }

  // Primary: <td title="Dienst: 227 • • Zeit: 06:30 - 14:28 • • Anfangsort: ...">DD</td>
  const tdRe = /<td[^>]+title="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/td>/gi;
  let m;
  while ((m = tdRe.exec(html)) !== null) {
    const title = m[1];
    if (!/Dienst:/i.test(title)) continue;
    const cellText = m[2].replace(/<[^>]+>/g, '').trim();
    const dayNum   = parseInt(cellText, 10);
    if (!dayNum || dayNum < 1 || dayNum > 31) continue;
    const dienst = title.match(/Dienst:\s*(\S+)/);
    const zeit   = title.match(/Zeit:\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    const anfang = title.match(/Anfangsort:\s*([^•\n,]+)/);
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

  // Fallback row scan
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

// ─── handler ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:CORS, body:'' };
  if (event.httpMethod !== 'POST')    return { statusCode:405, headers:CORS, body:JSON.stringify({error:'Method not allowed'}) };

  let body;
  try { body = JSON.parse(event.body||'{}'); }
  catch { return { statusCode:400, headers:CORS, body:JSON.stringify({error:'Invalid JSON'}) }; }

  const { action='login', username, password, session:sessIn, date } = body;

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (action === 'login') {
    if (!username || !password)
      return { statusCode:400, headers:CORS, body:JSON.stringify({success:false,error:'Benutzername und Passwort erforderlich'}) };

    try {
      const jar = {};

      // Step 1: GET login page → ViewState + initial session cookie
      const { resp: loginPage } = await getFollow('/WebComm/default.aspx', jar);
      const hidden = extractHidden(loginPage.body);
      console.log('[LOGIN] Hidden fields found:', Object.keys(hidden).join(', '));
      console.log('[LOGIN] Cookies after GET:', Object.keys(jar).join(', '));

      // Step 2: POST credentials
      const formData = querystring.stringify({
        ...hidden,
        UserName: username,
        Password: password,
        Logon:    'Logon'
      });
      console.log('[LOGIN] Posting formData keys:', Object.keys({ ...hidden, UserName:'', Password:'', Logon:'' }).join(', '));

      const postResp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: '/WebComm/default.aspx',
        method: 'POST',
        headers: {
          'Content-Type':   'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formData),
          'Cookie':         cookieStr(jar),
          'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer':        'https://perdisweb.verkehrs-ag.de/WebComm/default.aspx',
          'Accept':         'text/html,application/xhtml+xml,*/*',
          'Origin':         'https://perdisweb.verkehrs-ag.de'
        }
      }, formData);
      mergeCookies(jar, postResp.headers['set-cookie']);

      console.log('[LOGIN] POST → status:', postResp.status);
      console.log('[LOGIN] POST → location:', postResp.headers.location || '(none)');
      console.log('[LOGIN] POST → cookies now:', Object.keys(jar).join(', '));
      // Log first 300 chars of response body to see what server returned
      console.log('[LOGIN] POST → body snippet:', postResp.body.substring(0, 300).replace(/\s+/g,' '));

      // Step 3: Follow all redirects after POST to fully establish session
      if (postResp.status === 301 || postResp.status === 302 || postResp.status === 303 || postResp.status === 307) {
        let loc = postResp.headers.location || '/';
        if (loc.startsWith('http')) { const u = new URL(loc); loc = u.pathname + u.search; }
        else if (!loc.startsWith('/')) loc = '/WebComm/' + loc;
        console.log('[LOGIN] Following post-login redirect to:', loc);
        await getFollow(loc, jar);
      }

      console.log('[LOGIN] Final cookies:', cookieStr(jar));

      // Step 4: Fetch roster.aspx
      const { resp: rosterResp } = await getFollow('/WebComm/roster.aspx', jar);
      console.log('[LOGIN] roster.aspx → status:', rosterResp.status, 'body length:', rosterResp.body.length);
      console.log('[LOGIN] roster.aspx → body snippet:', rosterResp.body.substring(0, 300).replace(/\s+/g,' '));

      // Detect if we got redirected back to login
      const isLoginPage = /name=["']UserName["']/i.test(rosterResp.body) || /name=["']Password["']/i.test(rosterResp.body);
      if (isLoginPage) {
        return {
          statusCode: 401, headers: CORS,
          body: JSON.stringify({ success:false, error:'Anmeldung fehlgeschlagen – bitte Zugangsdaten prüfen (session ungültig nach Login)' })
        };
      }

      const roster = parseRoster(rosterResp.body);
      console.log('[LOGIN] Roster days:', Object.keys(roster).length);

      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ success:true, username, session: cookieStr(jar), roster })
      };

    } catch (err) {
      console.error('[LOGIN] Exception:', err);
      return { statusCode:500, headers:CORS, body:JSON.stringify({success:false, error:err.message}) };
    }
  }

  // ── ROSTER refresh ─────────────────────────────────────────────────────────
  if (action === 'roster') {
    try {
      const resp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: '/WebComm/roster.aspx',
        method: 'GET',
        headers: { 'Cookie': sessIn, 'User-Agent': 'Mozilla/5.0' }
      });
      return { statusCode:200, headers:CORS, body:JSON.stringify({success:true, roster: parseRoster(resp.body)}) };
    } catch (err) {
      return { statusCode:500, headers:CORS, body:JSON.stringify({success:false,error:err.message}) };
    }
  }

  // ── SHIFT detail ───────────────────────────────────────────────────────────
  if (action === 'shift') {
    if (!date) return { statusCode:400, headers:CORS, body:JSON.stringify({success:false,error:'date fehlt'}) };
    try {
      const resp = await request({
        hostname: 'perdisweb.verkehrs-ag.de',
        path: `/WebComm/shift.aspx?${date}`,
        method: 'GET',
        headers: { 'Cookie': sessIn, 'User-Agent': 'Mozilla/5.0' }
      });
      return { statusCode:200, headers:CORS, body:JSON.stringify({success:true,date, rows: parseShift(resp.body)}) };
    } catch (err) {
      return { statusCode:500, headers:CORS, body:JSON.stringify({success:false,error:err.message}) };
    }
  }

  return { statusCode:400, headers:CORS, body:JSON.stringify({success:false,error:'Unbekannte action'}) };
};
