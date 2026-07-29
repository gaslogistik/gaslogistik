const GDOCS_API_URL = 'https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec';
const DEFAULT_TIMEOUT = 15000; // 15 sekund limitu na zapytanie

/**
 * Pobiera dane z Google Sheets / Apps Script za pomocą zapytania GET
 * @param {string} action - Akcja API do wykonania (domyślnie 'getsystemdata')
 * @returns {Promise<Object>} Zwraca pobrane dane w formacie JSON
 */
export async function fetchDocsData(action = 'getsystemdata') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
        const url = `${GDOCS_API_URL}?action=${encodeURIComponent(action)}`;
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Google Docs API HTTP Error (${action}): status ${response.status}`);
        }

        const data = await response.json();

        if (data && data.status === 'error') {
            throw new Error(`Apps Script Error (${action}): ${data.message || 'Nieznany błąd serwera'}`);
        }

        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error(`⏱️ Przekroczono limit czasu żądania (Timeout) dla akcji: ${action}`);
        } else {
            console.error(`❌ Błąd podczas pobierania danych z Google Docs (${action}):`, error);
        }
        throw error;
    }
}

/**
 * Pobiera komplet zagregowanych danych systemowych dla panelu admina
 * @returns {Promise<Object>}
 */
export async function fetchAllAdminDocsData() {
    return await fetchDocsData('getsystemdata');
}

/**
 * Wysyła aktualizację lub nowe dane do Google Sheets via Apps Script (POST)
 * @param {string} action - Nazwa operacji do wykonania w Apps Script
 * @param {Object|Array} payload - Dane do zapisania / zaktualizowania
 * @returns {Promise<Object>} Zwraca odpowiedź potwierdzającą z serwera
 */
export async function updateDocsData(action, payload = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
        const response = await fetch(GDOCS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8' // Standard dla Google Apps Script w celu uniknięcia preflight CORS
            },
            body: JSON.stringify({ action, payload }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Google Docs Update HTTP Error (${action}): status ${response.status}`);
        }

        const result = await response.json();

        if (result && result.status === 'error') {
            throw new Error(`Apps Script Update Error (${action}): ${result.message || 'Operacja nie powiodła się'}`);
        }

        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error(`⏱️ Przekroczono limit czasu zapisu (Timeout) dla akcji: ${action}`);
        } else {
            console.error(`❌ Błąd podczas aktualizacji Google Docs (${action}):`, error);
        }
        throw error;
    }
}