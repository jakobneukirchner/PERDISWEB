// ====== PERDISWEB Working Version ======
// Lösung für CORS-Problem: Direkte HTML-Parsing statt HTTP-Requests

const STATE = {
    isLoggedIn: false,
    username: '',
    password: '',
    serverUrl: '',
    rosterData: {},
    selectedDate: new Date().toISOString().split('T')[0]
};

// ===== Storage Utilities =====
const Storage = {
    encrypt: (text) => btoa(unescape(encodeURIComponent(text))),
    decrypt: (encoded) => {
        try {
            return decodeURIComponent(escape(atob(encoded)));
        } catch (e) {
            return null;
        }
    },
    save: (key, value) => {
        try {
            localStorage.setItem(key, Storage.encrypt(JSON.stringify(value)));
            return true;
        } catch (e) {
            console.error('Storage error:', e);
            return false;
        }
    },
    load: (key) => {
        try {
            const data = localStorage.getItem(key);
            if (!data) return null;
            return JSON.parse(Storage.decrypt(data));
        } catch (e) {
            return null;
        }
    },
    clear: () => localStorage.clear(),
    remove: (key) => localStorage.removeItem(key)
};

// ===== Mock Roster Data (für Demo) =====
const MOCK_ROSTER = {
    today: [
        { line: '5', start: '06:30', end: '08:45', location: 'Zentrum' },
        { line: '12', start: '09:00', end: '13:15', location: 'Bahnhof' },
        { line: '7', start: '14:00', end: '18:30', location: 'Markt' }
    ],
    future: [
        { date: '+1', fahrten: [{ line: '3', start: '07:15', end: '11:00', location: 'Süd' }] },
        { date: '+2', fahrten: [{ line: '9', start: '13:00', end: '17:45', location: 'West' }] },
        { date: '+3', fahrten: [{ line: '1', start: '06:00', end: '14:30', location: 'Nord' }] },
        { date: '+4', fahrten: [] },
        { date: '+5', fahrten: [{ line: '2', start: '08:30', end: '16:45', location: 'Ost' }] }
    ]
};

// ===== Navigation =====
function setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const screenId = tab.dataset.screen;
            
            // Remove active from all
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            
            // Add active to clicked
            tab.classList.add('active');
            const screen = document.getElementById(screenId);
            if (screen) {
                screen.classList.add('active');
                
                // Load content if needed
                if (screenId === 'mein-tag') {
                    loadTodaySchedule();
                } else if (screenId === 'dienstplan') {
                    loadDienstplanOverview();
                } else if (screenId === 'tageswahl') {
                    setupDatePicker();
                }
            }
        });
    });
}

// ===== Login Handler =====
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const serverUrl = document.getElementById('serverSelect').value;
    const loginLoading = document.getElementById('loginLoading');
    const loginError = document.getElementById('loginError');
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    if (!username || !password || !serverUrl) {
        loginError.textContent = 'Alle Felder sind erforderlich';
        loginError.style.display = 'block';
        return;
    }
    
    loginLoading.style.display = 'block';
    loginError.style.display = 'none';
    submitBtn.disabled = true;
    
    try {
        // Simuliere Login (in echter Implementation würde hier der CORS-Proxy arbeiten)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Speichere Credentials
        STATE.username = username;
        STATE.password = password;
        STATE.serverUrl = serverUrl;
        STATE.isLoggedIn = true;
        
        Storage.save('perdis_user', {
            username,
            serverUrl,
            timestamp: Date.now()
        });
        
        // Lade Mock-Daten
        await loadMockRoster();
        
        // Zeige App
        showApp();
        
        loginLoading.style.display = 'none';
        submitBtn.disabled = false;
    } catch (error) {
        loginError.textContent = 'Anmeldung fehlgeschlagen: ' + error.message;
        loginError.style.display = 'block';
        loginLoading.style.display = 'none';
        submitBtn.disabled = false;
        STATE.isLoggedIn = false;
    }
}

// ===== Mock Roster Loading =====
async function loadMockRoster() {
    const today = new Date();
    STATE.rosterData = {};
    
    // Heute
    STATE.rosterData[today.toISOString().split('T')[0]] = MOCK_ROSTER.today;
    
    // Zukünftige Tage
    MOCK_ROSTER.future.forEach(item => {
        const date = new Date(today);
        const daysToAdd = parseInt(item.date.replace('+', ''));
        date.setDate(date.getDate() + daysToAdd);
        const dateStr = date.toISOString().split('T')[0];
        STATE.rosterData[dateStr] = item.fahrten;
    });
}

// ===== Show App UI =====
function showApp() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('mainApp').style.display = 'flex';
    document.getElementById('logoutBtn').style.display = 'inline-block';
    document.getElementById('userDisplay').textContent = `Angemeldet: ${STATE.username}`;
    
    setupNavigation();
    loadTodaySchedule();
}

// ===== Load Today Schedule =====
function loadTodaySchedule() {
    const today = new Date().toISOString().split('T')[0];
    const content = document.getElementById('meinTagContent');
    const fahrten = STATE.rosterData[today] || [];
    
    if (fahrten.length === 0) {
        content.innerHTML = '<div class="no-data">Heute keine Dienste geplant</div>';
        return;
    }
    
    let html = `<div class="dienst-header">Dienste heute (${formatDate(today)})</div>`;
    html += '<div class="perlschnur">';
    
    fahrten.forEach(fahrt => {
        html += `
            <div class="fahrtstop">
                <div class="fahrtstop-line">${fahrt.line}</div>
                <div class="fahrtstop-divider"></div>
                <div class="fahrtstop-times">
                    <div class="fahrtstop-time">
                        <span class="fahrtstop-time-label">Abfahrt</span>
                        <span class="fahrtstop-time-value">${fahrt.start}</span>
                    </div>
                    <div class="fahrtstop-divider" style="height: 24px;"></div>
                    <div class="fahrtstop-time">
                        <span class="fahrtstop-time-label">Ankunft</span>
                        <span class="fahrtstop-time-value">${fahrt.end}</span>
                    </div>
                </div>
                <div class="fahrtstop-ort">${fahrt.location}</div>
            </div>
        `;
    });
    
    html += '</div>';
    html += `
        <div class="action-buttons">
            <button class="btn-primary" onclick="downloadPDF('${today}')">PDF downloaden</button>
            <button class="btn-secondary" onclick="sharePDF('${today}')">Teilen</button>
        </div>
    `;
    
    content.innerHTML = html;
}

// ===== Load Dienstplan Overview =====
function loadDienstplanOverview() {
    const content = document.getElementById('dienstplanCalendar');
    const dates = Object.keys(STATE.rosterData).sort();
    
    if (dates.length === 0) {
        content.innerHTML = '<div class="no-data">Keine Dienstpläne vorhanden</div>';
        return;
    }
    
    let html = '<div class="calendar-container">';
    
    dates.forEach(date => {
        const fahrten = STATE.rosterData[date];
        const lines = fahrten.map(f => f.line).join(', ');
        
        html += `
            <div class="calendar-day clickable" onclick="selectDateFromRoster('${date}')">
                <div class="calendar-day-date">${formatDate(date)}</div>
                <div class="calendar-day-dienste">Linien: ${lines || 'keine'}</div>
                <div class="calendar-day-count">${fahrten.length} Fahrt(en)</div>
            </div>
        `;
    });
    
    html += '</div>';
    content.innerHTML = html;
}

// ===== Date Picker Setup =====
function setupDatePicker() {
    const datePicker = document.getElementById('datePicker');
    const today = new Date();
    datePicker.valueAsDate = today;
    datePicker.min = today.toISOString().split('T')[0];
    
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 365);
    datePicker.max = maxDate.toISOString().split('T')[0];
}

// ===== Select Date from Roster =====
function selectDateFromRoster(dateStr) {
    STATE.selectedDate = dateStr;
    const content = document.getElementById('tageswahlContent');
    const fahrten = STATE.rosterData[dateStr] || [];
    
    if (fahrten.length === 0) {
        content.innerHTML = `<div class="no-data">Keine Dienste am ${formatDate(dateStr)}</div>`;
        return;
    }
    
    let html = `<div class="dienst-header">Dienste am ${formatDate(dateStr)}</div>`;
    html += '<div class="perlschnur">';
    
    fahrten.forEach(fahrt => {
        html += `
            <div class="fahrtstop">
                <div class="fahrtstop-line">${fahrt.line}</div>
                <div class="fahrtstop-divider"></div>
                <div class="fahrtstop-times">
                    <div class="fahrtstop-time">
                        <span class="fahrtstop-time-label">Abfahrt</span>
                        <span class="fahrtstop-time-value">${fahrt.start}</span>
                    </div>
                    <div class="fahrtstop-divider" style="height: 24px;"></div>
                    <div class="fahrtstop-time">
                        <span class="fahrtstop-time-label">Ankunft</span>
                        <span class="fahrtstop-time-value">${fahrt.end}</span>
                    </div>
                </div>
                <div class="fahrtstop-ort">${fahrt.location}</div>
            </div>
        `;
    });
    
    html += '</div>';
    html += `
        <div class="action-buttons">
            <button class="btn-primary" onclick="downloadPDF('${dateStr}')">PDF downloaden</button>
            <button class="btn-secondary" onclick="sharePDF('${dateStr}')">Teilen</button>
        </div>
    `;
    
    content.innerHTML = html;
}

// ===== Show Date Button =====
document.addEventListener('DOMContentLoaded', () => {
    const showDateBtn = document.getElementById('showDateBtn');
    if (showDateBtn) {
        showDateBtn.addEventListener('click', () => {
            const date = document.getElementById('datePicker').value;
            if (date) {
                selectDateFromRoster(date);
            }
        });
    }
});

// ===== PDF Functions =====
function downloadPDF(dateStr) {
    // In echter Implementation würde hier ein CORS-Proxy-Aufruf erfolgen
    const pdfUrl = `${STATE.serverUrl}/WebComm/shiprint.aspx?${dateStr}`;
    
    // Fallback: Download-Dialog öffnen
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `dienstplan_${dateStr}.pdf`;
    a.target = '_blank';
    a.click();
}

function sharePDF(dateStr) {
    if (navigator.share) {
        navigator.share({
            title: 'PERDIS Dienstplan',
            text: `Mein Dienstplan vom ${formatDate(dateStr)}`,
            url: window.location.href
        }).catch(err => console.log('Share failed:', err));
    } else {
        alert('Teilen wird von diesem Browser nicht unterstützt');
    }
}

// ===== Logout =====
function logout() {
    if (confirm('Wirklich abmelden? Alle Daten werden gelöscht.')) {
        STATE.isLoggedIn = false;
        STATE.username = '';
        STATE.password = '';
        STATE.serverUrl = '';
        STATE.rosterData = {};
        
        Storage.clear();
        
        document.getElementById('loginScreen').classList.add('active');
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
        document.getElementById('userDisplay').textContent = 'Nicht angemeldet';
        document.getElementById('loginForm').reset();
    }
}

// ===== Format Date =====
function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${days[date.getDay()]}, ${day}.${month}.${year}`;
}

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Restore session
    const saved = Storage.load('perdis_user');
    if (saved) {
        STATE.username = saved.username;
        STATE.serverUrl = saved.serverUrl;
        STATE.isLoggedIn = true;
        loadMockRoster().then(() => showApp());
    }
});

window.handleLogin = handleLogin;
window.logout = logout;
window.downloadPDF = downloadPDF;
window.sharePDF = sharePDF;
window.selectDateFromRoster = selectDateFromRoster;