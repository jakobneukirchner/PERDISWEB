// Netlify Function: CORS-Proxy für PERDIS Login
// Erlaubt Browser-App, sich zu PERDIS anzumelden

const https = require('https');
const http = require('http');
const { URL } = require('url');

exports.handler = async (event, context) => {
    // Nur POST erlaubt
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const { serverUrl, username, password } = JSON.parse(event.body);

        if (!serverUrl || !username || !password) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing parameters' })
            };
        }

        // Step 1: Initialize session
        await proxyRequest(serverUrl, '/WebComm/default.aspx?TestingCookie=1', 'GET');

        // Step 2: Submit login
        const loginData = `user=${encodeURIComponent(username)}&passwd=${encodeURIComponent(password)}&login=Login`;
        
        const response = await proxyRequest(
            serverUrl,
            '/WebComm/default.aspx',
            'POST',
            loginData
        );

        // Check if login successful
        if (response.includes('logout') || response.includes('roster')) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    message: 'Login erfolgreich'
                })
            };
        } else {
            return {
                statusCode: 401,
                body: JSON.stringify({
                    success: false,
                    message: 'Login fehlgeschlagen - ungültige Anmeldedaten'
                })
            };
        }
    } catch (error) {
        console.error('Login error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Server error: ' + error.message
            })
        };
    }
};

function proxyRequest(serverUrl, path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(serverUrl + path);
        const protocol = url.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: method,
            headers: {
                'User-Agent': 'PERDISWEB/1.0',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

        if (body) {
            options.headers['Content-Length'] = Buffer.byteLength(body);
        }

        const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve(data);
            });
        });

        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}
