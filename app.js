// Main Application
class PERDISWEBApp {
    static async initialize() {
        Logger.log('PERDISWEB initializing');
        
        try {
            // Check if user is already logged in
            const isLoggedIn = AuthManager.isLoggedIn();
            
            if (isLoggedIn) {
                this.showMainInterface();
                // Try to load data
                setTimeout(() => {
                    DienstplanManager.loadMeinTag();
                    DienstplanManager.loadDienstplanCalendar();
                }, 500);
            } else {
                this.showLoginInterface();
            }
        } catch (error) {
            Logger.error('Initialization failed', error);
            this.showLoginInterface();
        }
    }

    static showLoginInterface() {
        document.getElementById('loginScreen').classList.add('active');
        document.getElementById('navTabs').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
        document.querySelectorAll('.screen:not(#loginScreen)').forEach(s => {
            s.classList.remove('active');
        });
    }

    static showMainInterface() {
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('navTabs').style.display = 'flex';
        document.getElementById('logoutBtn').style.display = 'inline-block';
        document.getElementById('mein-tag').classList.add('active');
    }

    static handleError(error) {
        Logger.error('Application error', error);
        // Show user-friendly error
        alert('Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
    }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        PERDISWEBApp.initialize();
    });
} else {
    PERDISWEBApp.initialize();
}