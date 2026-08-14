const GDOCS_API_URL = 'https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec';
/* v2: klucz legacy — admin.html może czytać dane prywatne (przypomnienia/historia) */
const LEGACY_KEY = 'KP_LEGACY_2026';
const DEFAULT_TIMEOUT = 25000;
const API_BASE_URL = GDOCS_API_URL;
async function fetchApiJson(action, opts) {
  opts = opts || {};
  const retries = opts.retries || 3;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT;
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API_BASE_URL + "?action=" + encodeURIComponent(action) + "&key=" + encodeURIComponent(LEGACY_KEY), {
        signal: ctrl.signal,
        cache: "no-store",
        redirect: "follow"
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = JSON.parse(await res.text());
      if (data && data.error) throw new Error(String(data.error));
      try { localStorage.setItem("lastgood_" + action, JSON.stringify({ ts: Date.now(), data: data })); } catch (e) { }
      return data;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      console.warn("API próba " + attempt + "/" + retries + " (" + action + "):", err);
      if (attempt < retries) await new Promise(r => setTimeout(r, 1200 * attempt));
    }
  }
  try {
    const raw = localStorage.getItem("lastgood_" + action);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.data) { console.warn("Ostatnie dobre dane: " + action); return p.data; }
    }
  } catch (e) { }
  throw lastError || new Error("API niedostępne: " + action);
}
export async function fetchDocsData(action = 'getsystemdata') {
  try {
    return await fetchApiJson(action, { retries: 2 });
  } catch (error) {
    console.error(`Błąd podczas pobierania danych z Google Docs (${action}):`, error);
    return {};
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
      fetchDocsData('getaddressesdata')
    ]);
    return {
      system: {
        cities: (systemData.cities || systemData.CITIES || []),
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
    return {
      system: { cities: [], points: [], relations: [], drivers: [] },
      vehicles: { trucks: [], tanktrailers: [] },
      users: [], loginHistory: [], reminders: [], alerts: []
    };
  }
}
export async function updateDocsData(action, payload = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const response = await fetch(GDOCS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Google Docs Update HTTP Error (${action}): status ${response.status}`);
    }
    const result = await response.json();
    if (result && result.status === 'error') {
      throw new Error(`Google Apps Script Update Error (${action}): ${result.message || 'Operacja nie powiodła się'}`);
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