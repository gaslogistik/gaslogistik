const GDRIVE_API_URL = 'https://script.google.com/macros/s/AKfycbxySJRg7CvMDTcLN_epiVNUsaiH959hYV-v2rdUHNFCxuGPB86KxMqwR3i9NUGboVutAw/exec';

// 🔧 FIX: Wydłużony limit czasu (cold start Apps Script + duże foldery Drive)
const DEFAULT_TIMEOUT = 30000; // 30 sekund

// 🔧 FIX: Ponowna próba przy niepowodzeniu
const MAX_RETRIES = 2;

/**
 * Pobiera strukturę plików i folderów z Google Drive API.
 * 🔧 FIX: timeout 30 s + automatyczny retry + łagodniejsza ocena statusu.
 * @param {string} action - Opcjonalna akcja lub filtr dla Apps Script (domyślnie 'getdrivedata').
 * @returns {Promise<Object|null>} Zwraca drzewo plików/folderów lub null w przypadku błędu.
 */
export async function fetchDriveData(action = 'getdrivedata') {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        let timeoutId = null;

        try {
            timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

            const url = action ? `${GDRIVE_API_URL}?action=${encodeURIComponent(action)}` : GDRIVE_API_URL;
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Drive HTTP Error (${action}): status ${response.status}`);
            }

            const data = await response.json();

            if (data && data.status === 'error') {
                // 🔧 FIX: API ODPOWIEDZIAŁO (łącze działa) — nie oznaczamy kafelka jako OFFLINE.
                // Twardy błąd biznesowy nie oznacza braku połączenia z Google Drive.
                console.warn(`⚠️ Google Drive Apps Script zgłosił błąd (${action}): ${data.message || 'Nieznany błąd Drive'} — połączenie uznajemy za ONLINE`);
                return data;
            }

            return data;
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            lastError = error;

            if (error.name === 'AbortError') {
                console.error(`⏱️ Przekroczono limit czasu pobierania z Google Drive (Timeout) dla akcji: ${action} (próba ${attempt}/${MAX_RETRIES})`);
            } else {
                console.error(`❌ Błąd podczas pobierania danych z Google Drive API (${action}) (próba ${attempt}/${MAX_RETRIES}):`, error);
            }

            // 🔧 FIX: chwila odstępu przed ponowną próbą
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }

    console.error(`❌ Google Drive API nie odpowiedziało po ${MAX_RETRIES} próbach. Ostatni błąd:`, lastError);
    return null;
}

/**
 * Uniwersalna obsługa wysyłania lub modyfikacji danych w Google Drive (POST).
 * @param {string} action - Akcja do wykonania w Apps Script
 * @param {Object} payload - Dane do przesłania
 * @returns {Promise<Object>} Odpowiedź z serwera Apps Script
 */
export async function updateDriveData(action, payload = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
        const response = await fetch(`${GDRIVE_API_URL}?action=${encodeURIComponent(action)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8' // Unikanie wymogu zapytania preflight CORS
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Drive HTTP Error on update (${action}): status ${response.status}`);
        }

        const result = await response.json();

        if (result && result.status === 'error') {
            throw new Error(`Google Drive Apps Script Update Error (${action}): ${result.message || 'Operacja nie powiodła się'}`);
        }

        return result;
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            console.error(`⏱️ Przekroczono limit czasu zapisu w Google Drive (Timeout) dla akcji: ${action}`);
        } else {
            console.error(`❌ Błąd podczas aktualizacji danych w Google Drive API (${action}):`, error);
        }

        throw error;
    }
}