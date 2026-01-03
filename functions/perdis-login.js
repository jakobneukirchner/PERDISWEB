const https = require('https');
const querystring = require('querystring');

const PERDIS_BASE = 'https://perdisweb.verkehrs-ag.de/WebComm';
const LOGIN_ENDPOINT = '/default.aspx';
const ROSTER_ENDPOINT = '/roster.aspx';

// Mock roster data for testing
const mockRoster = {
  '2026-01-03': [
    { line: '5', start: '06:30', end: '08:45', location: 'Zentrum' },
    { line: '12', start: '09:00', end: '13:15', location: 'Bahnhof' },
    { line: '7', start: '14:00', end: '18:30', location: 'Markt' }
  ],
  '2026-01-04': [
    { line: '3', start: '07:15', end: '11:00', location: 'Süd' },
    { line: '9', start: '13:00', end: '17:45', location: 'West' }
  ],
  '2026-01-05': [
    { line: '1', start: '06:00', end: '14:30', location: 'Nord' }
  ],
  '2026-01-06': [
    { line: '2', start: '08:00', end: '12:30', location: 'Ost' }
  ]
};

function httpsRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function extractCookie(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sessionCookie = cookies.find(c => c.includes('JSESSIONID') || c.includes('SessionId'));
  
  if (sessionCookie) {
    const match = sessionCookie.match(/([^=]+=[^;]+)/)[1];
    return match;
  }
  return null;
}

function parseRosterHtml(html) {
  // Simplified parsing - in production, use proper HTML parser
  // For now, return mock data
  return mockRoster;
}

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Handle OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: 'OK'
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Nur POST erlaubt' })
    };
  }

  try {
    const { username, password } = JSON.parse(event.body);

    if (!username || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Benutzername und Passwort erforderlich' 
        })
      };
    }

    // Step 1: Authenticate
    console.log(`[PERDIS] Anmeldung versucht für: ${username}`);

    const loginData = querystring.stringify({
      UserName: username,
      Password: password,
      Logon: 'Logon'
    });

    const loginResponse = await httpsRequest({
      hostname: 'perdisweb.verkehrs-ag.de',
      path: '/WebComm/default.aspx',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(loginData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    }, loginData);

    console.log(`[PERDIS] Login Response Status: ${loginResponse.statusCode}`);

    // Extract session cookie
    const sessionCookie = extractCookie(loginResponse.headers);
    console.log(`[PERDIS] Session Cookie: ${sessionCookie ? 'erhalten' : 'nicht erhalten'}`);

    // Step 2: Fetch roster
    // For now, return mock roster
    // In production, use sessionCookie to fetch real data
    const roster = parseRosterHtml(loginResponse.body);

    if (Object.keys(roster).length === 0) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Anmeldedaten ungültig oder Dienstplan nicht verfügbar' 
        })
      };
    }

    console.log(`[PERDIS] Erfolgreiche Anmeldung: ${username}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        username: username,
        roster: roster
      })
    };

  } catch (error) {
    console.error('[PERDIS] Fehler:', error.message);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Server-Fehler: ' + error.message
      })
    };
  }
};
