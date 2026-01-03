// Authentication Management
class AuthManager {
    static currentUser = null;
    static currentServer = null;
    static sessionToken = null;

    static async login(username, password, serverUrl) {
        try {
            Logger.log('Attempting login', { username, server: serverUrl });
            
            // Step 1: Initialize session with server
            const initResponse = await HttpClient.get(`${serverUrl}/WebComm/default.aspx?TestingCookie=1`);
            if (!initResponse.ok) throw new Error('Failed to initialize session');

            // Step 2: Submit login credentials
            const loginResponse = await HttpClient.post(
                `${serverUrl}/WebComm/default.aspx`,
                {
                    'user': username,
                    'passwd': password,
                    'login': 'Login'
                }
            );

            if (!loginResponse.ok) {
                throw new Error('Login failed - invalid credentials');
            }

            // Step 3: Verify login by checking roster access
            const rosterResponse = await HttpClient.get(`${serverUrl}/WebComm/roster.aspx`);
            if (!rosterResponse.ok) {
                throw new Error('Session validation failed');
            }

            const rosterHtml = await rosterResponse.text();
            if (rosterHtml.includes('login') || rosterHtml.includes('Log in')) {
                throw new Error('Session validation failed - redirected to login');
            }

            // Login successful - store credentials
            this.currentUser = username;
            this.currentServer = serverUrl;
            this.sessionToken = `${username}_${Date.now()}`;

            SecureStorage.set(CONFIG.STORAGE_KEYS.USER, {
                username,
                passwordHash: CryptoUtil.hashPassword(password),
                server: serverUrl,
                token: this.sessionToken,
                lastLogin: new Date().toISOString()
            });

            Logger.log('Login successful', { username, server: serverUrl });
            return { success: true, message: 'Login erfolgreich' };

        } catch (error) {
            Logger.error('Login failed', error);
            return {
                success: false,
                message: error.message || 'Login fehlgeschlagen. Bitte versuchen Sie es erneut.'
            };
        }
    }

    static async logout() {
        try {
            Logger.log('Logging out', { user: this.currentUser });

            if (this.currentServer) {
                // Try to logout from server
                await HttpClient.get(`${this.currentServer}/WebComm/logout.aspx`).catch(e => {
                    Logger.warn('Server logout failed', e);
                });
            }

            // Clear all local data
            this.clearSession();
            Logger.log('Logout successful');
            return { success: true };

        } catch (error) {
            Logger.error('Logout error', error);
            this.clearSession();
            return { success: true }; // Clear locally anyway
        }
    }

    static clearSession() {
        this.currentUser = null;
        this.currentServer = null;
        this.sessionToken = null;
        SecureStorage.clear();
    }

    static async restoreSession() {
        try {
            const stored = SecureStorage.get(CONFIG.STORAGE_KEYS.USER);
            if (!stored) return false;

            this.currentUser = stored.username;
            this.currentServer = stored.server;
            this.sessionToken = stored.token;

            // Check if we need to re-authenticate
            const lastLogin = new Date(stored.lastLogin);
            const daysSinceLogin = (Date.now() - lastLogin) / (1000 * 60 * 60 * 24);

            if (daysSinceLogin > CONFIG.LOGIN_REAUTH_DAYS) {
                Logger.log('Session expired - re-authentication needed');
                return false;
            }

            // Verify session is still valid
            const rosterResponse = await HttpClient.get(`${this.currentServer}/WebComm/roster.aspx`);
            if (!rosterResponse.ok) {
                Logger.warn('Session validation failed');
                return false;
            }

            Logger.log('Session restored successfully');
            return true;

        } catch (error) {
            Logger.error('Session restore failed', error);
            return false;
        }
    }

    static isLoggedIn() {
        return this.currentUser !== null && this.currentServer !== null;
    }

    static getServerUrl() {
        return this.currentServer;
    }

    static getUsername() {
        return this.currentUser;
    }

    static async reauthorize(username, password) {
        try {
            const server = this.currentServer;
            this.clearSession();
            return await this.login(username, password, server);
        } catch (error) {
            Logger.error('Re-authorization failed', error);
            return { success: false, message: 'Re-authorization failed' };
        }
    }
}

// UI Event Handlers
document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Try to restore session on page load
    const sessionRestored = await AuthManager.restoreSession();
    if (sessionRestored) {
        showMainApp();
    }
});

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const serverUrl = document.getElementById('perdisUrl').value;

    if (!username || !password || !serverUrl) {
        showLoginError('Bitte füllen Sie alle Felder aus');
        return;
    }

    const loginLoading = document.getElementById('loginLoading');
    const loginError = document.getElementById('loginError');
    const submitBtn = event.target.querySelector('button[type="submit"]');

    loginLoading.style.display = 'block';
    loginError.style.display = 'none';
    submitBtn.disabled = true;

    const result = await AuthManager.login(username, password, serverUrl);

    loginLoading.style.display = 'none';
    submitBtn.disabled = false;

    if (result.success) {
        // Clear form
        document.getElementById('loginForm').reset();
        showMainApp();
    } else {
        showLoginError(result.message);
    }
}

async function handleLogout() {
    if (confirm('Möchten Sie sich wirklich abmelden?')) {
        await AuthManager.logout();
        location.reload();
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function showMainApp() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('navTabs').style.display = 'flex';
    document.getElementById('logoutBtn').style.display = 'inline-block';
    document.getElementById('mein-tag').classList.add('active');

    // Load initial data
    DienstplanManager.loadMeinTag();
    DienstplanManager.loadDienstplanCalendar();
}