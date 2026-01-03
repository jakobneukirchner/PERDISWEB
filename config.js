// PERDISWEB Configuration
const CONFIG = {
    PERDIS_SERVERS: {
        'https://perdisweb.verkehrs-ag.de': 'Verkehrs-AG',
        'https://perdis.regiobus.de': 'RegioBus',
        'https://anwendungen.stadtwerke-bielefeld.de': 'Stadtwerke Bielefeld',
        'https://perdis-info.icb-ffm.de': 'ICB Frankfurt'
    },
    STORAGE_KEYS: {
        USER: 'perdis_user',
        TOKEN: 'perdis_token',
        SERVER: 'perdis_server',
        LAST_LOGIN: 'perdis_last_login',
        CACHE: 'perdis_cache'
    },
    LOGIN_REAUTH_DAYS: 30,
    CACHE_DURATION: 60 * 60 * 1000, // 1 hour
    REQUEST_TIMEOUT: 30000 // 30 seconds
};

// Simple encryption (for browser storage)
class CryptoUtil {
    static encode(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    static decode(str) {
        try {
            return decodeURIComponent(escape(atob(str)));
        } catch (e) {
            return null;
        }
    }

    static hashPassword(password) {
        // Simple hash for local comparison
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
}

// LocalStorage wrapper with encryption
class SecureStorage {
    static set(key, value) {
        try {
            const encrypted = CryptoUtil.encode(JSON.stringify(value));
            localStorage.setItem(key, encrypted);
        } catch (e) {
            console.error('Storage error:', e);
        }
    }

    static get(key) {
        try {
            const encrypted = localStorage.getItem(key);
            if (!encrypted) return null;
            return JSON.parse(CryptoUtil.decode(encrypted));
        } catch (e) {
            console.error('Storage error:', e);
            return null;
        }
    }

    static remove(key) {
        localStorage.removeItem(key);
    }

    static clear() {
        localStorage.clear();
    }

    static getAllKeys() {
        return Object.keys(localStorage);
    }
}

// Date utilities
class DateUtil {
    static format(date, format = 'DD.MM.YYYY') {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const dayName = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];

        return format
            .replace('DD', day)
            .replace('MM', month)
            .replace('YYYY', year)
            .replace('ddd', dayName);
    }

    static getToday() {
        const d = new Date();
        return d.toISOString().split('T')[0];
    }

    static getDaysAround(date, days = 14) {
        const d = new Date(date);
        const result = [];
        for (let i = -Math.floor(days / 2); i <= Math.floor(days / 2); i++) {
            const newDate = new Date(d);
            newDate.setDate(newDate.getDate() + i);
            result.push(newDate);
        }
        return result;
    }
}

// HTTP Request wrapper
class HttpClient {
    static async get(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        try {
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeout);
            return response;
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    }

    static async post(url, data = {}, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        try {
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    ...options.headers
                },
                body: new URLSearchParams(data),
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeout);
            return response;
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    }
}

// Logger
class Logger {
    static log(message, data = null) {
        console.log(`[PERDISWEB] ${message}`, data || '');
    }

    static error(message, error = null) {
        console.error(`[ERROR] ${message}`, error || '');
    }

    static warn(message, data = null) {
        console.warn(`[WARN] ${message}`, data || '');
    }
}