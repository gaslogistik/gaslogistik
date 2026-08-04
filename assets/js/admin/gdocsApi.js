const GDOCS_API_URL = 'https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec';
const DEFAULT_TIMEOUT = 15000;

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

        // 🔧 FIX: Sprawdź czy dane nie są błędem
        if (data && data.error) {
            console.warn(`⚠️ API zwróciło błąd dla ${action}:`, data.error);
            return {}; // Zwróć pusty obiekt zamiast wyrzucać błąd
        }

        return data;
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            console.error(`⏱️ Przekroczono limit czasu żądania (Timeout) dla akcji: ${action}`);
        } else {
            console.error(`Błąd podczas pobierania danych z Google Docs (${action}):`, error);
        }

        return {}; // 🔧 FIX: Zwróć pusty obiekt zamiast throw
    }
}

export async function fetchAllAdminDocsData() {
    try {
        console.log('📡 Pobieranie danych z Google Sheets API...');

        const [systemData, vehiclesData, adminData, alertsData, pointsData] = await Promise.all([
            fetchDocsData('getsystemdata'),
            fetchDocsData('getvehiclesdata'),
            fetchDocsData('getadmindata'),
            fetchDocsData('getalerts'),
            fetchDocsData('getaddressesdata') // 🔧 NOWE: arkusz POINTS (ten sam endpoint co addresses.html)
        ]);

        console.log('✅ systemData:', systemData);
        console.log('✅ vehiclesData:', vehiclesData);
        console.log('✅ adminData:', adminData);
        console.log('✅ alertsData:', alertsData);
        console.log('✅ pointsData (POINTS):', pointsData);

        // 🔧 FIX: Bezpieczne wyciąganie danych z fallbackami
        return {
            system: {
                cities: (systemData.cities || systemData.CITIES || []),
                // 🔧 NOWE: dane z arkusza POINTS dla liczników admina
                points: (pointsData.points || pointsData.cities || []),
                relations: (systemData.relations || systemData.RELATIONS || []),
                drivers: (systemData.drivers || systemData.DRIVERS || [])
            },
            vehicles: {
                trucks: (vehiclesData.trucks || vehiclesData.TRUCKS || []),
                tanktrailers: (vehiclesData.tanktrailers || vehiclesData.TANKTRAILERS || [])
            },
            users: (adminData.users || adminData.USERS || []),
            loginHistory: (adminData.loginHistory || adminData.LOGIN_HISTORY || []),
            reminders: (adminData.reminders || adminData.REMINDERS || []),
            alerts: (Array.isArray(alertsData) ? alertsData : (alertsData.alerts || alertsData.ALERTS || []))
        };
    } catch (error) {
        console.error('❌ Błąd podczas pobierania danych admina:', error);

        // 🔧 FIX: Zwróć pustą strukturę zamiast wyrzucać błąd
        return {
            system: { cities: [], points: [], relations: [], drivers: [] },
            vehicles: { trucks: [], tanktrailers: [] },
            users: [],
            loginHistory: [],
            reminders: [],
            alerts: []
        };
    }
}

export async function updateDocsData(action, payload = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
        const response = await fetch(GDOCS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
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