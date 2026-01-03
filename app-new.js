/**
 * PERDISWEB - Real PERDIS Server Integration
 * Uses Netlify Functions as CORS proxy to fetch actual dienstplan data
 * NO MOCK DATA - All data from real PERDIS server
 */

const AppConfig = {
    serverOptions: {
        'verkehrs-ag': { name: 'Verkehrs-AG', url: 'https://perdisweb.verkehrs-ag.de' },
        'regiobus': { name: 'RegioBus', url: 'https://perdis.regiobus.de' },
        'bielefeld': { name: 'Stadtwerke Bielefeld', url: 'https://anwendungen.stadtwerke-bielefeld.de' },
        'frankfurt': { name: 'ICB Frankfurt', url: 'https://perdis-info.icb-ffm.de' }
    },
    apiEndpoint: '/.netlify/functions/perdis-login'
};

class Perdisweb {
    constructor() {
        this.appState = {
            isLoggedIn: false,
            username: '',
            serverUrl: '',
            roster: {},
            currentDate: new Date()
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSavedSession();
        this.renderServerOptions();
    }

    setupEventListeners() {
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchScreen(e.target.dataset.screen));
        });
        document.getElementById('showDateBtn').addEventListener('click', () => this.showDateContent());
        document.getElementById('closePdfBtn').addEventListener('click', () => this.closePdfModal());
    }

    renderServerOptions() {
        const select = document.getElementById('serverSelect');
        Object.entries(AppConfig.serverOptions).forEach(([key, config]) => {
            const option = document.createElement('option');
            option.value = config.url;
            option.textContent = config.name;
            select.appendChild(option);
        });
    }

    async handleLogin(event) {
        event.preventDefault();

        const serverUrl = document.getElementById('serverSelect').value;
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        if (!serverUrl || !username || !password) {
            this.showError('loginError', 'Alle Felder erforderlich');
            return;
        }

        this.showLoading('loginLoading', true);

        try {
            // Call real PERDIS login via Netlify Function proxy
            const response = await fetch(AppConfig.apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serverUrl,
                    username,
                    password
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Login fehlgeschlagen');
            }

            // Login successful - save session
            this.appState.isLoggedIn = true;
            this.appState.username = username;
            this.appState.serverUrl = serverUrl;
            this.appState.roster = result.roster || {};

            this.saveSession();
            this.showLoginScreen(false);
            this.renderAllScreens();

        } catch (error) {
            console.error('Login error:', error);
            this.showError('loginError', error.message);
        } finally {
            this.showLoading('loginLoading', false);
        }
    }

    saveSession() {
        localStorage.setItem('perdis_session', JSON.stringify({
            username: this.appState.username,
            serverUrl: this.appState.serverUrl,
            timestamp: Date.now()
        }));
        localStorage.setItem('perdis_roster', JSON.stringify(this.appState.roster));
    }

    loadSavedSession() {
        const session = localStorage.getItem('perdis_session');
        if (session) {
            const data = JSON.parse(session);
            // Session valid for 30 days
            if (Date.now() - data.timestamp < 30 * 24 * 60 * 60 * 1000) {
                this.appState.username = data.username;
                this.appState.serverUrl = data.serverUrl;
                this.appState.isLoggedIn = true;

                const roster = localStorage.getItem('perdis_roster');
                if (roster) this.appState.roster = JSON.parse(roster);

                this.showLoginScreen(false);
                this.renderAllScreens();
            }
        }
    }

    logout() {
        if (confirm('Wirklich abmelden?')) {
            localStorage.clear();
            this.appState = {
                isLoggedIn: false,
                username: '',
                serverUrl: '',
                roster: {},
                currentDate: new Date()
            };
            this.showLoginScreen(true);
            document.getElementById('loginForm').reset();
        }
    }

    showLoginScreen(show) {
        document.getElementById('loginScreen').classList.toggle('active', show);
        document.getElementById('mainApp').style.display = show ? 'none' : 'flex';
        document.getElementById('logoutBtn').style.display = show ? 'none' : 'block';
        document.getElementById('userDisplay').textContent = show ? 'Nicht angemeldet' : `Angemeldet als: ${this.appState.username}`;
    }

    switchScreen(screenName) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(screenName).classList.add('active');
        event.target.classList.add('active');
    }

    renderAllScreens() {
        this.renderMeinTag();
        this.renderDienstplan();
    }

    renderMeinTag() {
        const today = new Date().toISOString().split('T')[0];
        const todayData = this.appState.roster[today] || [];
        const container = document.getElementById('meinTagContent');

        if (todayData.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 30px; color: var(--color-text-secondary);">Heute keine Dienste geplant</p>';
            return;
        }

        container.innerHTML = `
            <div class="dienst-card">
                <div class="dienst-header">${this.formatDate(today)}</div>
                ${todayData.map(fahrt => this.renderFahrt(fahrt, today)).join('')}
                <button class="btn-primary" onclick="app.downloadPDF('${today}')">PDF downloaden</button>
            </div>
        `;
    }

    renderDienstplan() {
        const container = document.getElementById('dienstplanCalendar');
        const dates = Object.keys(this.appState.roster).sort();

        if (dates.length === 0) {
            container.innerHTML = '<p>Keine Dienstpläne vorhanden</p>';
            return;
        }

        container.innerHTML = dates.map(date => {
            const fahrten = this.appState.roster[date];
            const summary = fahrten.map(f => f.line).join(', ');
            return `
                <div class="dienst-card dienst-day" onclick="app.showDateContent('${date}')">
                    <div class="dienst-day-date">${this.formatDate(date)}</div>
                    <div class="dienst-day-title">Linien: ${summary}</div>
                    <div class="dienst-day-summary">${fahrten.length} Fahrt(en)</div>
                </div>
            `;
        }).join('');
    }

    renderFahrt(fahrt, dateStr) {
        return `
            <div class="fahrt-item">
                <div class="fahrt-line">${fahrt.line}</div>
                <div class="fahrt-info">
                    <div class="fahrt-time">▶ ${fahrt.start}</div>
                    <div class="fahrt-time">■ ${fahrt.end}</div>
                </div>
                <div class="fahrt-location">${fahrt.location}</div>
            </div>
        `;
    }

    showDateContent(dateStr = null) {
        if (!dateStr) {
            dateStr = document.getElementById('datePicker').value;
            if (!dateStr) return;
        }

        const data = this.appState.roster[dateStr] || [];
        const container = document.getElementById('tageswahlContent');

        if (data.length === 0) {
            container.innerHTML = `<p>Keine Dienste am ${this.formatDate(dateStr)}</p>`;
            return;
        }

        container.innerHTML = `
            <div class="dienst-card">
                <div class="dienst-header">${this.formatDate(dateStr)}</div>
                ${data.map(fahrt => this.renderFahrt(fahrt, dateStr)).join('')}
                <button class="btn-primary" onclick="app.downloadPDF('${dateStr}')">PDF downloaden</button>
            </div>
        `;
    }

    downloadPDF(dateStr) {
        const pdfUrl = `${this.appState.serverUrl}/WebComm/shiprint.aspx?${dateStr}`;
        window.open(pdfUrl, '_blank');
    }

    formatDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `${days[date.getDay()]}, ${date.getDate()}. ${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    showError(elementId, message) {
        const el = document.getElementById(elementId);
        el.textContent = message;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 5000);
    }

    showLoading(elementId, show) {
        document.getElementById(elementId).style.display = show ? 'block' : 'none';
    }

    closePdfModal() {
        document.getElementById('pdfModal').style.display = 'none';
    }
}

// Initialize app on page load
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new Perdisweb();
});
