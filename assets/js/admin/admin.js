import { fetchDriveData } from './gdriveApi.js';
import { fetchAllAdminDocsData, updateDocsData } from './gdocsApi.js';
import { initAdminCalendar } from './calendar.js';
import { initAdminModals } from './modal.js';
import { initWorldClocks } from './worldTime.js';

// Główny stan aplikacji współdzielony między modułami
let globalState = {
    drive: null,
    docs: null
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicjalizacja Panelu Admina KP Gaslogistik...');

    // 0. Dynamiczne wstrzyknięcie stylów overlay i spinnera (jasny motyw neomorficzny)
    injectHighlightStyles();

    // 1. Inicjalizacja komponentów interfejsu
    initAdminCalendar();
    initAdminModals();
    initWorldClocks();

    // 2. Start zegara czasu rzeczywistego (Wustermark + KW)
    startLiveClock();

    // 3. Pobranie danych ze wszystkich źródeł API z widocznym spinnerem
    await loadAllDashboardData();
});

/**
 * Kontroluje widoczność spinnera i blokuje/odblokowuje interfejs na czas ładowania
 */
function setInitialLoadingState(isLoading) {
    const loaderId = 'repo-sync-loader-overlay';
    let loader = document.getElementById(loaderId);

    if (isLoading) {
        if (!loader) {
            loader = document.createElement('div');
            loader.id = loaderId;
            loader.innerHTML = `<div class="sync-loader-box">
        <div class="sync-spinner"></div>
        <div class="sync-loader-text-container">
          <span class="sync-loader-title">Synchronizacja danych...</span>
          <span class="sync-loader-subtitle">Proszę czekać na przeliczenie liczników</span>
        </div>
      </div>`;
            document.body.appendChild(loader);
        }

        loader.style.display = 'flex';
        document.body.classList.add('loading-active');
    } else {
        if (loader) {
            loader.style.display = 'none';
        }
        document.body.classList.remove('loading-active');
    }
}

/**
 * Wstrzykuje dedykowane style dla wskaźnika ładowania w jasnym motywie neomorficznym
 */
function injectHighlightStyles() {
    if (document.getElementById('admin-sync-loader-styles')) return;

    const style = document.createElement('style');
    style.id = 'admin-sync-loader-styles';
    style.innerHTML = `
  #repo-sync-loader-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(240, 242, 245, 0.45);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
  }
  .sync-loader-box {
      background: rgba(255, 255, 255, 0.95);
      padding: 24px 36px;
      border-radius: 20px;
      box-shadow: 0 15px 35px rgba(230, 0, 92, 0.08), 
                  0 4px 12px rgba(0, 0, 0, 0.04);
      display: flex;
      align-items: center;
      gap: 18px;
      border: 1px solid rgba(230, 0, 92, 0.12);
  }
  .sync-spinner {
      width: 38px;
      height: 38px;
      min-width: 38px;
      border: 4px solid rgba(230, 0, 92, 0.12);
      border-top: 4px solid #e6005c;
      border-radius: 50%;
      animation: spinAdmin 0.8s cubic-bezier(0.6, 0.2, 0.1, 1) infinite;
  }
  .sync-loader-text-container {
      display: flex;
      flex-direction: column;
      text-align: left;
  }
  .sync-loader-title {
      font-size: 15px;
      font-weight: 700;
      color: #1a1a2e;
      letter-spacing: -0.2px;
  }
  .sync-loader-subtitle {
      font-size: 12px;
      font-weight: 500;
      color: #8c8c9e;
      margin-top: 2px;
  }
  @keyframes spinAdmin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
  }
  body.loading-active {
      pointer-events: none;
      user-select: none;
  }
`;
    document.head.appendChild(style);
}

/**
 * Ładuje dane z Google Drive API oraz Google Docs/Sheets API równolegle.
 */
async function loadAllDashboardData() {
    setInitialLoadingState(true);

    try {
        setElText('cnt-status-monitor', 'CHECKING');

        const [driveResult, docsResult] = await Promise.allSettled([
            fetchDriveData(),
            fetchAllAdminDocsData()
        ]);

        // Obsługa wyników z Google Drive API
        if (driveResult.status === 'fulfilled' && driveResult.value) {
            globalState.drive = driveResult.value;
            console.log('📁 Otrzymane dane z Google Drive API:', driveResult.value);
            setElTextAndColor('cnt-gdrive-status', 'ONLINE', '#009A44');
        } else {
            console.warn('⚠️ Problem z połączeniem z Google Drive API');
            setElTextAndColor('cnt-gdrive-status', 'OFFLINE', '#ff4d4d');
        }

        // Obsługa wyników z Google Sheets / Docs API
        if (docsResult.status === 'fulfilled' && docsResult.value) {
            globalState.docs = docsResult.value;
            console.log('📊 Otrzymane dane z Google API (Sheets):', docsResult.value);
            setElText('cnt-status-monitor', 'ONLINE');
            setElTextAndColor('cnt-api-online', 'ONLINE', '#009A44');
        } else {
            setElText('cnt-status-monitor', 'ERROR');
            setElTextAndColor('cnt-api-online', 'OFFLINE', '#ff4d4d');
        }

        // Przeliczenie kafelków i statystyk
        updateCounters(globalState);
    } catch (err) {
        console.error('❌ Błąd krytyczny podczas ładowania danych:', err);
        setElText('cnt-status-monitor', 'ERROR');
        setElTextAndColor('cnt-api-online', 'OFFLINE', '#ff4d4d');
    } finally {
        setInitialLoadingState(false);
    }
}

/**
 * Przelicza licznik kafelków oraz odświeża statusy w panelu
 */
function updateCounters(state) {
    const docs = state.docs || {};
    const system = docs.system || {};
    const vehicles = docs.vehicles || {};

    // 1. TRUCKS (Ciągniki)
    const trucksList = vehicles.trucks || vehicles.TRUCKS || system.trucks || system.TRUCKS || docs.trucks || [];
    setElText('cnt-trucks', countValidRecordsAny(trucksList));

    // 2. TANKTRAILERS (Cysterny)
    const trailersList = vehicles.tanktrailers || vehicles.TANKTRAILERS || system.tanktrailers || system.TANKTRAILERS || docs.tanktrailers || [];
    setElText('cnt-tanktrailers', countValidRecordsAny(trailersList));

    // 3. DRIVERS (Kierowcy)
    const rawDrivers = system.drivers || system.DRIVERS || system.driversList || docs.drivers || docs.DRIVERS || [];
    let validDriversCount = 0;

    if (Array.isArray(rawDrivers)) {
        validDriversCount = rawDrivers.filter(driver => {
            if (!driver) return false;

            const name = driver.NAME || driver.Name || driver.name;
            const id = driver.ID || driver.id || driver.Id;

            if (name && name.toString().trim() !== '' && name.toString().trim().toUpperCase() !== 'NAME') return true;

            if (Array.isArray(driver)) {
                const rowName = driver[1];
                const rowId = driver[0];
                if (rowName && rowName.toString().trim() !== '' && rowName.toString().trim().toUpperCase() !== 'NAME') return true;
                return rowId && rowId.toString().trim() !== '' && rowId.toString().trim().toUpperCase() !== 'ID';
            }

            return id && id.toString().trim() !== '' && id.toString().trim().toUpperCase() !== 'ID';
        }).length;
    }

    setElText('cnt-drivers', validDriversCount);

    // 4. RELATIONS (Relacje)
    const relationsList = system.relations || system.RELATIONS || docs.relations || [];
    setElText('cnt-relations', countValidRecordsAny(relationsList));

    /* ============================================================
       5. MIASTA I KRAJE
       🔧 AKTUALIZACJA:
       Liczniki CITIES / COUNTRIES / VIGO STATIONS (DE) / HUBS (ALL)
       pobierają teraz dane z nowego arkusza POINTS
       (tak samo jak addresses.html i map.html).
       Nazwa licznika "CITIES" zostaje BEZ ZMIAN — zmienia się tylko źródło danych.
       ============================================================ */
    const citiesList = Array.isArray(system.points)
        ? system.points
        : (system.cities || system.CITIES || docs.cities || []);

    setElText('cnt-cities', countValidRecordsAny(citiesList));

    const countriesSet = new Set();
    let vigoCount = 0;
    let hubsCount = 0;

    citiesList.forEach(item => {
        const country = item.country || item.COUNTRY || item.kraj;
        if (country) countriesSet.add(country.toString().trim());

        const type = (item.type || item.TYPE || '').toString().toLowerCase();
        if (type.includes('vigo')) vigoCount++;
        if (type.includes('hub')) hubsCount++;
    });

    setElText('cnt-countries', countriesSet.size > 0 ? countriesSet.size : '--');
    setElText('cnt-vigo', vigoCount);
    setElText('cnt-hubs', hubsCount);

    // 6. WARNIENIA ADR & DOKUMENTY
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let adrExpiredCount = 0;
    let adrMissingCount = 0;
    const allVehicles = [...trucksList, ...trailersList];

    allVehicles.forEach(item => {
        const validDateStr = item.adrValid || item['ADR VALID'] || item.adr_valid;
        if (validDateStr) {
            const parsedDate = parseSheetDate(validDateStr);
            if (parsedDate && parsedDate < today) adrExpiredCount++;
        }

        const missingVal = item.adrDocumentMissing || item['ADR DOCUMENT MISSING'] || item.adr_document_missing;
        if (missingVal !== undefined && missingVal !== null && missingVal !== '') {
            const valStr = missingVal.toString().trim().toUpperCase();
            if (valStr === 'YES' || valStr === 'TAK' || valStr.length > 0) adrMissingCount++;
        }
    });

    setElText('cnt-adr-expired', adrExpiredCount);
    setElText('cnt-adr-missing', adrMissingCount);

    const totalAlerts = Array.isArray(docs.alerts) && docs.alerts.length > 0
        ? docs.alerts.length
        : (adrExpiredCount + adrMissingCount);
    setElText('cnt-adr-alerts', totalAlerts);

    // 7. HISTORIA LOGOWANIA, PRZYPOMNIENIA, UŻYTKOWNICY
    const loginHistoryData = docs.loginHistory || system.loginHistory || system.login_history || system.LOGIN_HISTORY || [];
    setElText('cnt-login-history', countValidRecordsAny(loginHistoryData));

    const remindersData = docs.reminders || system.reminders || system.REMINDERS || [];
    setElText('cnt-reminders', countValidRecordsAny(remindersData));

    const usersData = docs.users || system.users || system.USERS || [];
    setElText('cnt-users', countValidRecordsAny(usersData));

    // 8. WSPÓŁDZIELONE STAŁE STATUSY
    setElTextAndColor('cnt-access-status', '24/7', '#009A44');
    setElTextAndColor('cnt-repo-active', 'ACTIVE', '#009A44');
    setElTextAndColor('cnt-repo-online', 'ONLINE', '#009A44');
    setElTextAndColor('cnt-map-status', 'READY', '#009A44');

    // Znacznik Ostatniej Aktualizacji
    const now = new Date();
    setElText('cnt-last-update', now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
}

/**
 * Automatyczne odświeżanie czasu rzeczywistego (Wustermark + ISO Tydzień KW)
 */
function startLiveClock() {
    const updateTime = () => {
        const now = new Date();
        setElText('cnt-wustermark-time', now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' }));
        setElText('cnt-kw-week', `KW ${getISOWeekNumber(now)}`);
    };

    updateTime();
    setInterval(updateTime, 1000);
}

/**
 * Uniwersalna funkcja zliczająca poprawne rekordy
 */
function countValidRecordsAny(data) {
    if (!data) return 0;

    const list = Array.isArray(data) ? data : (data.data || data.rows || data.items || []);
    if (!Array.isArray(list)) return 0;

    return list.filter(item => {
        if (item === null || item === undefined) return false;

        if (Array.isArray(item)) {
            const firstCell = item[0] !== undefined && item[0] !== null ? item[0].toString().trim().toUpperCase() : '';
            if (['ID', 'USER', 'NAME', 'TITLE'].includes(firstCell)) return false;
            return item.some(cell => cell !== null && cell !== undefined && cell.toString().trim() !== '');
        }

        if (typeof item === 'object') {
            const keys = Object.keys(item);
            if (keys.length === 0) return false;

            const idVal = item.ID !== undefined ? item.ID : item.id;
            if (idVal !== undefined && idVal !== null) {
                const idStr = idVal.toString().trim().toUpperCase();
                if (idStr === 'ID' || idStr === '') return false;
                return true;
            }

            const values = Object.values(item);
            const firstVal = values[0] !== undefined && values[0] !== null ? values[0].toString().trim().toUpperCase() : '';
            if (['ID', 'USER', 'NAME'].includes(firstVal)) return false;

            return values.some(val => val !== null && val !== undefined && val.toString().trim() !== '');
        }

        return true;
    }).length;
}

/**
 * Parsowanie dat z formatu polskiego/niemieckiego (DD/MM/YYYY lub DD.MM.YYYY)
 */
function parseSheetDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;

    const parts = dateStr.toString().split(/[/.-]/);
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        return new Date(year, month, day);
    }

    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

function getISOWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function setElText(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

function setElTextAndColor(id, val, color) {
    const el = document.getElementById(id);
    if (el) {
        el.innerText = val;
        el.style.color = color;
    }
}

/**
 * Ogólny handler do zapisywania zmian w Google Sheets z automatycznym przeładowaniem widoku
 */
export async function handleAdminDataSave(action, data) {
    try {
        setInitialLoadingState(true);
        const result = await updateDocsData(action, data);
        await loadAllDashboardData();
        return result;
    } catch (error) {
        console.error(`❌ Błąd podczas zapisu (${action}):`, error);
        throw error;
    } finally {
        setInitialLoadingState(false);
    }
}