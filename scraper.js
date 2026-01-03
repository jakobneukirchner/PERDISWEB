// Dienstplan Scraper
class DienstplanScraper {
    static async getRosterData(date = null) {
        try {
            const targetDate = date || DateUtil.getToday();
            Logger.log('Fetching roster data', { date: targetDate });

            const response = await HttpClient.get(
                `${AuthManager.getServerUrl()}/WebComm/roster.aspx?date=${targetDate}`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch roster');
            }

            const html = await response.text();
            return this.parseRosterHTML(html, targetDate);

        } catch (error) {
            Logger.error('Failed to fetch roster', error);
            return null;
        }
    }

    static parseRosterHTML(html, date) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Find the main roster table
            const tables = doc.querySelectorAll('table');
            if (tables.length === 0) {
                Logger.warn('No tables found in roster');
                return null;
            }

            // Parse data from tables
            const dienste = [];
            const rows = doc.querySelectorAll('tr');

            let currentDienst = null;
            let dienstStartTime = null;

            rows.forEach((row, index) => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length === 0) return;

                const rowText = Array.from(cells).map(c => c.textContent.trim()).join('|');

                // Detect Dienst row (usually has a time pattern)
                if (this.isDienstRow(rowText)) {
                    const timeMatch = rowText.match(/(\d{1,2}):(\d{2})/);
                    if (timeMatch) {
                        dienstStartTime = `${timeMatch[1]}:${timeMatch[2]}`;
                        currentDienst = {
                            startTime: dienstStartTime,
                            fahrten: []
                        };
                        dienste.push(currentDienst);
                    }
                }

                // Parse Fahrten (trips)
                if (currentDienst && this.isFahrtRow(rowText)) {
                    const fahrt = this.parseFahrtRow(rowText);
                    if (fahrt) {
                        currentDienst.fahrten.push(fahrt);
                    }
                }
            });

            // Extract dienst name from first row or header
            const dienstName = this.extractDienstName(html);

            return {
                date,
                dienst: dienstName || 'Dienst',
                dienste,
                rawHtml: html
            };

        } catch (error) {
            Logger.error('Failed to parse roster HTML', error);
            return null;
        }
    }

    static isDienstRow(text) {
        // Check if row contains time pattern and common dienst keywords
        return /\d{1,2}:\d{2}/.test(text);
    }

    static isFahrtRow(text) {
        // Check if row contains line number and time information
        return /^\d+/.test(text.trim()) && /\d{1,2}:\d{2}/.test(text);
    }

    static parseFahrtRow(text) {
        try {
            // Parse: "Linie | Von Zeit | Nach Zeit | Ort"
            const parts = text.split('|').map(p => p.trim());
            if (parts.length < 3) return null;

            const line = parts[0];
            const abfahrt = this.extractTime(parts[1]);
            const ankunft = this.extractTime(parts[2]);
            const ort = parts[3] || '';

            return {
                line,
                abfahrt,
                ankunft,
                ort
            };
        } catch (e) {
            return null;
        }
    }

    static extractTime(text) {
        const match = text.match(/(\d{1,2}):(\d{2})/);
        return match ? `${match[1]}:${match[2]}` : text;
    }

    static extractDienstName(html) {
        // Try to find dienst name from common PERDIS patterns
        const patterns = [
            /Dienst:\s*([^<]+)</i,
            /class="dienst[^>]*>([^<]+)</i,
            /id="dienst[^>]*>([^<]+)</i
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) return match[1].trim();
        }

        return null;
    }
}

// PDF Management
class PDFManager {
    static async generatePDF(date) {
        try {
            Logger.log('Generating PDF for date', { date });

            // Try to get PDF download link from PERDIS
            const pdfUrl = `${AuthManager.getServerUrl()}/WebComm/shiprint.aspx?${date}`;
            
            const response = await HttpClient.get(pdfUrl);
            if (!response.ok) {
                throw new Error('Failed to generate PDF');
            }

            const blob = await response.blob();
            return {
                success: true,
                blob,
                filename: `dienstplan_${date}.pdf`,
                url: URL.createObjectURL(blob)
            };

        } catch (error) {
            Logger.error('Failed to generate PDF', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async downloadPDF(date) {
        const result = await this.generatePDF(date);
        if (!result.success) {
            return result;
        }

        // Create download link
        const a = document.createElement('a');
        a.href = result.url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(result.url);

        return result;
    }

    static async sharePDF(date) {
        const result = await this.generatePDF(date);
        if (!result.success) {
            return result;
        }

        // Use native share API if available
        if (navigator.share) {
            try {
                const file = new File([result.blob], result.filename, { type: 'application/pdf' });
                await navigator.share({
                    title: 'PERDIS Dienstplan',
                    text: `Dienstplan vom ${DateUtil.format(date)}`,
                    files: [file]
                });
                return { success: true, message: 'PDF erfolgreich geteilt' };
            } catch (error) {
                Logger.warn('Share failed', error);
                // Fallback to download
                return this.downloadPDF(date);
            }
        } else {
            // Fallback to download
            return this.downloadPDF(date);
        }
    }
}

// Cache Management
class CacheManager {
    static get(key) {
        try {
            const cached = SecureStorage.get(`${CONFIG.STORAGE_KEYS.CACHE}_${key}`);
            if (!cached) return null;

            const now = Date.now();
            if (now - cached.timestamp > CONFIG.CACHE_DURATION) {
                this.remove(key);
                return null;
            }

            return cached.data;
        } catch (e) {
            return null;
        }
    }

    static set(key, data) {
        try {
            SecureStorage.set(`${CONFIG.STORAGE_KEYS.CACHE}_${key}`, {
                data,
                timestamp: Date.now()
            });
        } catch (e) {
            Logger.warn('Cache set failed', e);
        }
    }

    static remove(key) {
        SecureStorage.remove(`${CONFIG.STORAGE_KEYS.CACHE}_${key}`);
    }

    static clear() {
        const keys = SecureStorage.getAllKeys();
        keys.forEach(key => {
            if (key.includes(CONFIG.STORAGE_KEYS.CACHE)) {
                SecureStorage.remove(key);
            }
        });
    }
}