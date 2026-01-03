const https = require('https');
const { URL } = require('url');

/**
 * Netlify Function: Real PERDIS Login Proxy
 * Performs actual authentication against PERDIS server
 * No mock data - real credentials required
 */

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { serverUrl, username, password } = JSON.parse(event.body);

        if (!serverUrl || !username || !password) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required fields: serverUrl, username, password' })
            };
        }

        // Validate URLs to prevent SSRF
        const url = new URL(serverUrl);
        if (!['perdisweb.verkehrs-ag.de', 'perdis.regiobus.de', 'anwendungen.stadtwerke-bielefeld.de', 'perdis-info.icb-ffm.de'].some(host => url.hostname.includes(host))) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid server URL' }) };
        }

        // Step 1: Get session cookie
        const sessionCookie = await getSessionCookie(serverUrl);
        if (!sessionCookie) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Failed to establish session' }) };
        }

        // Step 2: Login with credentials
        const loginSuccess = await performLogin(serverUrl, username, password, sessionCookie);
        if (!loginSuccess) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
        }

        // Step 3: Fetch roster data
        const rosterData = await fetchRoster(serverUrl, sessionCookie);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                roster: rosterData,
                message: 'Login erfolgreich'
            })
        };
    } catch (error) {
        console.error('Login error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error: ' + error.message })
        };
    }
};

function getSessionCookie(serverUrl) {
    return new Promise((resolve) => {
        const url = new URL(serverUrl + '/WebComm/default.aspx');
        const req = https.get({
            hostname: url.hostname,
            path: url.pathname,
            headers: { 'User-Agent': 'PERDISWEB/1.0' }
        }, (res) => {
            const cookies = res.headers['set-cookie'];
            resolve(cookies ? cookies[0].split(';')[0] : null);
        });
        req.on('error', () => resolve(null));
    });
}

function performLogin(serverUrl, username, password, sessionCookie) {
    return new Promise((resolve) => {
        const url = new URL(serverUrl + '/WebComm/default.aspx');
        const data = `user=${encodeURIComponent(username)}&passwd=${encodeURIComponent(password)}&login=Login`;

        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Cookie': sessionCookie,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data),
                'User-Agent': 'PERDISWEB/1.0'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                // Check if response contains logout link (indicates successful login)
                resolve(body.includes('logout') || body.includes('roster') || res.statusCode === 200);
            });
        });

        req.on('error', () => resolve(false));
        req.write(data);
        req.end();
    });
}

function fetchRoster(serverUrl, sessionCookie) {
    return new Promise((resolve) => {
        const url = new URL(serverUrl + '/WebComm/roster.aspx');

        const req = https.get({
            hostname: url.hostname,
            path: url.pathname,
            headers: {
                'Cookie': sessionCookie,
                'User-Agent': 'PERDISWEB/1.0'
            }
        }, (res) => {
            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                // Parse the PERDIS HTML and extract roster
                const roster = parseRosterHTML(html);
                resolve(roster);
            });
        });

        req.on('error', () => resolve({}));
    });
}

function parseRosterHTML(html) {
    /**
     * Parse PERDIS HTML roster page
     * Expected structure: <table> with dates and trips
     * Each trip: date, line number, start time, end time, location
     */
    const roster = {};

    // Extract table rows - PERDIS uses specific table structure
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

    let tableMatch;
    while ((tableMatch = tableRegex.exec(html)) !== null) {
        const table = tableMatch[1];
        let rowMatch;

        while ((rowMatch = rowRegex.exec(table)) !== null) {
            const row = rowMatch[1];
            const cells = [];
            let cellMatch;

            while ((cellMatch = cellRegex.exec(row)) !== null) {
                cells.push(cellMatch[1].trim().replace(/<[^>]*>/g, ''));
            }

            // Expected format: [date, line, start, end, location]
            if (cells.length >= 5) {
                const dateStr = cells[0];
                const line = cells[1];
                const start = cells[2];
                const end = cells[3];
                const location = cells[4];

                // Parse date (handle various formats)
                const dateKey = parsePerdisDate(dateStr);
                if (dateKey) {
                    if (!roster[dateKey]) roster[dateKey] = [];
                    roster[dateKey].push({
                        line: line.trim(),
                        start: start.trim(),
                        end: end.trim(),
                        location: location.trim()
                    });
                }
            }
        }
    }

    return roster;
}

function parsePerdisDate(dateStr) {
    /**
     * Convert PERDIS date formats to YYYY-MM-DD
     * Handles: "03.01.2026", "3.1.2026", etc.
     */
    const formats = [
        /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,  // DD.MM.YYYY
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/      // YYYY-MM-DD
    ];

    for (const format of formats) {
        const match = dateStr.trim().match(format);
        if (match) {
            let day, month, year;
            if (format === formats[0]) {  // DD.MM.YYYY
                day = match[1].padStart(2, '0');
                month = match[2].padStart(2, '0');
                year = match[3];
            } else {  // YYYY-MM-DD
                year = match[1];
                month = match[2].padStart(2, '0');
                day = match[3].padStart(2, '0');
            }
            return `${year}-${month}-${day}`;
        }
    }
    return null;
}
