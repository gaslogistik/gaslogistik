const GDRIVE_API_URL = 'https://script.google.com/macros/s/AKfycbxySJRg7CvMDTcLN_epiVNUsaiH959hYV-v2rdUHNFCxuGPB86KxMqwR3i9NUGboVutAw/exec';
const DEFAULT_TIMEOUT = 15000; // 15 sekund limitu czasowego na zapytanie

/**
 * Pobiera strukturę plików i folderów z Google Drive API.
 * @param {string} action - Opcjonalna akcja lub filtr dla Apps Script (domyślnie 'getdrivedata').
 * @returns {Promise<Object|null>} Zwraca drzewo plików/folderów lub null w przypadku błędu.
 */
export async function fetchDriveData(action = 'getdrivedata') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
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
            throw new Error(`Google Drive Apps Script Error (${action}): ${data.message || 'Nieznany błąd Drive'}`);
        }

        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error(`⏱️ Przekroczono limit czasu pobierania z Google Drive (Timeout) dla akcji: ${action}`);
        } else {
            console.error(`❌ Błąd podczas pobierania danych z Google Drive API (${action}):`, error);
        }
        return null;
    }
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