/**
 * Netlify Function: PERDIS Login Proxy
 * Simplified version for Verkehrs-AG only
 * Direct HTTPS requests to PERDIS server
 */

const https = require('https');
const { URL } = require('url');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            body: JSON.stringify({ error: 'Method not allowed', success: false }) 
        };
    }

    try {
        const { username, password } = JSON.parse(event.body);

        if (!username || !password) {
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    error: 'Username und Passwort erforderlich',
                    success: false
                })
            };
        }

        // Only Verkehrs-AG
        const serverUrl = 'https://perdisweb.verkehrs-ag.de';

        // Step 1: Get session
        console.log('Step 1: Getting session...');
        const session = await getSession(serverUrl);
        if (!session) {
            return {
                statusCode: 500,
                body: JSON.stringify({ 
                    error: 'Keine Verbindung zum Server möglich',
                    success: false
                })
            };
        }

        // Step 2: Login
        console.log('Step 2: Attempting login...');
        const loginSuccess = await attemptLogin(serverUrl, username, password, session);
        
        if (!loginSuccess) {
            return {
                statusCode: 401,
                body: JSON.stringify({ 
                    error: 'Benutzername oder Passwort falsch',
                    success: false
                })
            };
        }

        // Step 3: Fetch roster
        console.log('Step 3: Fetching roster...');
        const roster = await getRoster(serverUrl, session);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                roster: roster,
                message: 'Erfolgreich angemeldet'
            })
        };

    } catch (error) {
        console.error('Error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Serverfehler: ' + error.message,
                success: false
            })
        };
    }
};

function getSession(serverUrl) {
    return new Promise((resolve) => {
        const url = new URL(serverUrl + '/WebComm/default.aspx');
        
        const req = https.get({
            hostname: url.hostname,
            path: url.pathname,
            headers: {
                'User-Agent': 'PERDISWEB/1.0',
                'Connection': 'keep-alive'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const cookies = res.headers['set-cookie'];
                const sessionCookie = cookies ? cookies[0] : null;
                console.log('Session cookie:', sessionCookie ? 'OK' : 'NONE');
                resolve(sessionCookie);
            });
        });

        req.on('error', (err) => {
            console.error('Session error:', err.message);
            resolve(null);
        });
    });
}

function attemptLogin(serverUrl, username, password, sessionCookie) {
    return new Promise((resolve) => {
        const url = new URL(serverUrl + '/WebComm/default.aspx');
        const postData = `user=${encodeURIComponent(username)}&passwd=${encodeURIComponent(password)}&login=Login`;

        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Cookie': sessionCookie,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': 'PERDISWEB/1.0',
                'Connection': 'keep-alive',
                'Referer': serverUrl + '/WebComm/default.aspx'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log('Login response code:', res.statusCode);
                console.log('Login response contains logout:', body.includes('logout'));
                // Success if we get redirected or see logout link
                const success = res.statusCode === 200 || 
                               res.statusCode === 302 || 
                               body.includes('logout') ||
                               body.includes('roster') ||
                               body.includes('Abmelden');
                resolve(success);
            });
        });

        req.on('error', (err) => {
            console.error('Login error:', err.message);
            resolve(false);
        });

        req.write(postData);
        req.end();
    });
}

function getRoster(serverUrl, sessionCookie) {
    return new Promise((resolve) => {
        const url = new URL(serverUrl + '/WebComm/roster.aspx');

        const req = https.get({
            hostname: url.hostname,
            path: url.pathname,
            headers: {
                'Cookie': sessionCookie,
                'User-Agent': 'PERDISWEB/1.0',
                'Connection': 'keep-alive'
            }
        }, (res) => {
            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                const roster = parseRoster(html);
                console.log('Parsed roster with', Object.keys(roster).length, 'dates');
                resolve(roster);
            });
        });

        req.on('error', (err) => {
            console.error('Roster error:', err.message);
            resolve({});
        });
    });
}

function parseRoster(html) {
    const roster = {};
    
    // Look for table rows with data
    // PERDIS format: <td>date</td><td>line</td><td>start</td><td>end</td><td>location</td>
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    
    let rowMatch;
    let rowCount = 0;
    
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const row = rowMatch[1];
        const cells = [];
        let cellMatch;
        
        // Reset cellRegex
        cellRegex.lastIndex = 0;
        
        while ((cellMatch = cellRegex.exec(row)) !== null) {
            let text = cellMatch[1]
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .trim();
            cells.push(text);
        }
        
        // Skip header rows and empty rows
        if (cells.length >= 5 && !cells[0].toLowerCase().includes('datum') && cells[0]) {
            const dateStr = parseDateString(cells[0]);
            
            if (dateStr) {
                if (!roster[dateStr]) roster[dateStr] = [];
                
                roster[dateStr].push({
                    line: cells[1] || '?',
                    start: cells[2] || '?',
                    end: cells[3] || '?',
                    location: cells[4] || '?'
                });
                
                rowCount++;
            }
        }
    }
    
    console.log('Parsed', rowCount, 'roster entries');
    return roster;
}

function parseDateString(dateStr) {
    // Try DD.MM.YYYY format
    const match = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
    }
    return null;
}
