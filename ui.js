// UI Manager
class UIManager {
    static renderDienstplan(data, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!data || !data.dienste) {
            container.innerHTML = '<div class="error-message">Keine Daten für diesen Tag verfügbar</div>';
            return;
        }

        let html = '';

        // Dienst Header
        html += `<div class="dienst-header">${data.dienst}</div>`;

        // Perlschnur Layout
        if (data.dienste.length > 0) {
            html += '<div class="perlschnur">';
            
            data.dienste.forEach(dienst => {
                if (dienst.fahrten && dienst.fahrten.length > 0) {
                    dienst.fahrten.forEach(fahrt => {
                        html += `
                            <div class="fahrtstop">
                                <div class="fahrtstop-line">${fahrt.line}</div>
                                <div class="fahrtstop-divider"></div>
                                <div class="fahrtstop-times">
                                    <div class="fahrtstop-time">
                                        <span class="fahrtstop-time-label">Abfahrt</span>
                                        <span class="fahrtstop-time-value">${fahrt.abfahrt}</span>
                                    </div>
                                    <div class="fahrtstop-divider" style="height: 24px;"></div>
                                    <div class="fahrtstop-time">
                                        <span class="fahrtstop-time-label">Ankunft</span>
                                        <span class="fahrtstop-time-value">${fahrt.ankunft}</span>
                                    </div>
                                </div>
                                <div class="fahrtstop-ort">${fahrt.ort}</div>
                            </div>
                        `;
                    });
                }
            });
            
            html += '</div>';
        } else {
            html += '<div class="error-message">Keine Fahrten für diesen Tag</div>';
        }

        container.innerHTML = html;
    }

    static renderCalendar(startDate, endDate, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const days = DateUtil.getDaysAround(startDate, 14);
        let html = '';

        days.forEach(day => {
            const dateStr = day.toISOString().split('T')[0];
            const dayName = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][day.getDay()];
            const dayNum = day.getDate();
            const monthNum = day.getMonth() + 1;

            html += `
                <div class="calendar-day" onclick="DienstplanManager.showDate('${dateStr}')">
                    <div class="calendar-day-date">${dayNum}. ${monthNum}.</div>
                    <div class="calendar-day-dienste">${dayName}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    static showPDFModal(date) {
        const modal = document.getElementById('pdfModal');
        const pdfTitle = document.getElementById('pdfTitle');
        const pdfViewer = document.getElementById('pdfViewer');

        pdfTitle.textContent = `Dienstplan ${DateUtil.format(date)}`;
        pdfViewer.src = '';

        // Generate PDF and show in viewer
        PDFManager.generatePDF(date).then(result => {
            if (result.success) {
                pdfViewer.src = result.url;
                modal.classList.add('active');
                modal.style.display = 'flex';

                // Store current PDF for download/share
                window.currentPDF = result;
            } else {
                alert('PDF-Generierung fehlgeschlagen: ' + result.error);
            }
        });
    }

    static closePDFModal() {
        const modal = document.getElementById('pdfModal');
        modal.classList.remove('active');
        modal.style.display = 'none';
        if (window.currentPDF && window.currentPDF.url) {
            URL.revokeObjectURL(window.currentPDF.url);
        }
    }
}

// Dienstplan Manager
class DienstplanManager {
    static async loadMeinTag() {
        const container = document.getElementById('meinTagContent');
        container.innerHTML = '<div class="loading">Laden...</div>';

        const today = DateUtil.getToday();
        
        // Check cache first
        let data = CacheManager.get(`roster_${today}`);
        
        if (!data) {
            data = await DienstplanScraper.getRosterData(today);
            if (data) {
                CacheManager.set(`roster_${today}`, data);
            }
        }

        if (data) {
            UIManager.renderDienstplan(data, 'meinTagContent');
            // Add action buttons
            this.addDienstplanActions(today, 'meinTagContent');
        } else {
            container.innerHTML = '<div class="error-message">Fehler beim Laden des Dienstplans</div>';
        }
    }

    static async loadDienstplanCalendar() {
        const container = document.getElementById('dienstplanCalendar');
        container.innerHTML = '<div class="loading">Laden...</div>';
        
        const today = new Date();
        UIManager.renderCalendar(today, today, 'dienstplanCalendar');
    }

    static async showDate(dateStr) {
        const container = document.getElementById('tageswahlContent');
        container.innerHTML = '<div class="loading">Laden...</div>';

        // Check cache
        let data = CacheManager.get(`roster_${dateStr}`);
        
        if (!data) {
            data = await DienstplanScraper.getRosterData(dateStr);
            if (data) {
                CacheManager.set(`roster_${dateStr}`, data);
            }
        }

        if (data) {
            UIManager.renderDienstplan(data, 'tageswahlContent');
            this.addDienstplanActions(dateStr, 'tageswahlContent');
        } else {
            container.innerHTML = '<div class="error-message">Keine Daten für diesen Tag</div>';
        }
    }

    static addDienstplanActions(date, containerId) {
        const container = document.getElementById(containerId);
        
        // Add action buttons
        const actionDiv = document.createElement('div');
        actionDiv.style.marginTop = '20px';
        actionDiv.style.display = 'flex';
        actionDiv.style.gap = '10px';
        actionDiv.style.flexWrap = 'wrap';
        
        const pdfBtn = document.createElement('button');
        pdfBtn.className = 'btn-primary';
        pdfBtn.textContent = 'PDF ansehen';
        pdfBtn.onclick = () => UIManager.showPDFModal(date);
        
        actionDiv.appendChild(pdfBtn);
        container.appendChild(actionDiv);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Navigation tabs
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const screenId = tab.dataset.screen;
            
            // Remove active class from all tabs and screens
            navTabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding screen
            tab.classList.add('active');
            const screen = document.getElementById(screenId);
            if (screen) {
                screen.classList.add('active');
            }
        });
    });

    // PDF Modal
    const pdfModal = document.getElementById('pdfModal');
    const closePdfBtn = document.getElementById('closePdfBtn');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const sharePdfBtn = document.getElementById('sharePdfBtn');

    if (closePdfBtn) {
        closePdfBtn.addEventListener('click', () => {
            UIManager.closePDFModal();
        });
    }

    if (pdfModal) {
        pdfModal.addEventListener('click', (e) => {
            if (e.target === pdfModal) {
                UIManager.closePDFModal();
            }
        });
    }

    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', () => {
            if (window.currentPDF) {
                const a = document.createElement('a');
                a.href = window.currentPDF.url;
                a.download = window.currentPDF.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        });
    }

    if (sharePdfBtn) {
        sharePdfBtn.addEventListener('click', async () => {
            if (window.currentPDF && navigator.share) {
                try {
                    const file = new File(
                        [window.currentPDF.blob],
                        window.currentPDF.filename,
                        { type: 'application/pdf' }
                    );
                    await navigator.share({
                        title: 'PERDIS Dienstplan',
                        text: 'Mein Dienstplan',
                        files: [file]
                    });
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        Logger.error('Share failed', error);
                    }
                }
            }
        });
    }

    // Date picker
    const datePicker = document.getElementById('datePicker');
    const showDateBtn = document.getElementById('showDateBtn');

    if (datePicker) {
        datePicker.valueAsDate = new Date();
    }

    if (showDateBtn) {
        showDateBtn.addEventListener('click', () => {
            const date = document.getElementById('datePicker').value;
            if (date) {
                DienstplanManager.showDate(date);
            }
        });
    }

    if (datePicker) {
        datePicker.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                showDateBtn.click();
            }
        });
    }
});

window.currentPDF = null;