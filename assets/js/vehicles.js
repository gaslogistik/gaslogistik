/* ============================================================
VEHICLES.JS — PREMIUM ADR MODULE (STABLE, CLEAN, EXTENDED)
🔧 2026-08-06 — WERSJA 2:
 • Natychmiastowy render z localStorage (stale-while-revalidate) —
   kierowca ZAWSZE widzi dane od razu, świeże dociągają się w tle.
 • Koniec z "ERR" — baner offline z przyciskiem + auto‑retry w tle.
 • Pigułka statusu (✓ LIVE / ⟳ SYNC / ⚠ CACHE) na dole ekranu.
 • Auto‑odświeżanie co 5 min + odświeżenie po powrocie do karty.
 • Prefetch API startuje od razu przy parsowaniu skryptu.
 • 🔧 FIX: tolerancyjne czytanie pól (vGet) — spacje w nagłówkach
   i kluczach (np. "PLATES ") już nie psują ALL VEHICLES i szukajki.
 • 🔧 FIX: wyszukiwarki bindowane tylko raz (index odświeżany).
============================================================ */
const API_URL =
"https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec?action=getvehiclesdata";
const API_BASE_URL =
"https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec";
/* ============================================================
KONFIGURACJA ODPORNOŚCI
============================================================ */
const CFG = {
LS_KEY: "lastgood_getvehiclesdata",
BG_TIMEOUT_MS: 60000,      // sync w tle — UI nie blokuje, może trwać długo
BG_RETRIES: 2,
HARD_TIMEOUT_MS: 30000,    // twarde ładowanie (brak cache) — spinner widoczny
HARD_RETRIES: 3,
AUTO_REFRESH_MS: 5 * 60 * 1000,   // co 5 min odśwież w tle (grzeje cache serwera)
MIN_REFETCH_GAP_MS: 45 * 1000,    // nie odświeżaj częściej niż co 45 s
MAX_AUTO_RETRY: 4                 // auto‑retry po całkowitej awarii
};
let lastGoodTs = null;      // timestamp ostatnich dobrych danych
let lastFetchTs = 0;        // czas ostatniego udanego pobrania
let syncInProgress = false;
let autoRefreshTimer = null;
let hardFailAutoRetries = 0;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
/* ============================================================
🔧 TOLERANCYJNY ODCZYT PÓL — nagłówki ze spacjami nie psują strony
============================================================ */
function normKey_(k) {
return String(k).toUpperCase().replace(/\s+/g, " ").trim();
}
function vGet(v, wanted, fallback) {
if (!v || typeof v !== "object") return fallback;
for (let w = 0; w < wanted.length; w++) {
const want = wanted[w];
for (const k in v) {
if (normKey_(k) === want) {
const val = v[k];
if (val !== undefined && val !== null && String(val).trim() !== "") return val;
}
}
}
return fallback;
}
function getPlates(v)   { return String(vGet(v, ["PLATES", "REG"], "UNKNOWN")).trim(); }
function getInternal(v) { return String(vGet(v, ["INTERNAL NR."], "—")).trim(); }
function getModel(v)    { return String(vGet(v, ["MODEL", "TYPE"], "—")).trim(); }
function getAdrRaw(v) {
return vGet(v, ["ADR VALID", "ADR", "ADR_VALID", "ADR DATE", "ADR_VALID_DATE", "ADR EXPIRATION"], "");
}
/* ============================================================
API RESILIENCE — próby + ostatnie dobre dane
🔧 opts.fallbackToLastGood=false → rzuca błędem (sync w tle sam obsłuży)
============================================================ */
async function fetchApiJson(action, opts) {
opts = opts || {};
const retries = opts.retries || 3;
const timeoutMs = opts.timeoutMs || CFG.BG_TIMEOUT_MS;
const useLastGood = opts.fallbackToLastGood !== false;
let lastError = null;
for (let attempt = 1; attempt <= retries; attempt++) {
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), timeoutMs);
try {
const res = await fetch(API_BASE_URL + "?action=" + action, {
signal: ctrl.signal,
cache: "no-store",
redirect: "follow"
});
clearTimeout(timer);
if (!res.ok) throw new Error("HTTP " + res.status);
const data = JSON.parse(await res.text());
if (data && data.error) throw new Error(String(data.error));
writeLastGood(data);
return data;
} catch (err) {
clearTimeout(timer);
lastError = err;
console.warn("API próba " + attempt + "/" + retries + " (" + action + "):", err);
if (attempt < retries) await sleep(1200 * attempt);
}
}
// Wszystkie próby padły → ostatnie dobre dane (jeśli wolno)
if (useLastGood) {
const good = readLastGood();
if (good) { console.warn("Ostatnie dobre dane: " + action); return good.data; }
}
throw lastError || new Error("API niedostępne: " + action);
}
function readLastGood() {
try {
const raw = localStorage.getItem(CFG.LS_KEY);
if (!raw) return null;
const p = JSON.parse(raw);
if (p && p.data) return p;
} catch (e) { }
return null;
}
function writeLastGood(data) {
try {
localStorage.setItem(CFG.LS_KEY, JSON.stringify({ ts: Date.now(), data: data }));
} catch (e) { }
}
/* ============================================================
🔧 PIGUŁKA STATUSU (prawy dolny róg) — informacja, nie błąd
============================================================ */
function updateSyncChip(state, ts) {
let chip = document.getElementById("vehicles-sync-chip");
if (!chip) {
chip = document.createElement("div");
chip.id = "vehicles-sync-chip";
chip.style.cssText =
"position:fixed;right:12px;bottom:12px;z-index:99999;" +
"background:rgba(20,20,28,.8);color:#e8e8f0;border-radius:999px;" +
"padding:6px 12px;font:600 11px/1 system-ui,sans-serif;letter-spacing:.4px;" +
"border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(4px);";
document.body.appendChild(chip);
}
const t = ts ? new Date(ts).toLocaleTimeString("pl-PL") : "";
if (state === "syncing")     chip.textContent = "⟳ SYNC…";
else if (state === "fresh")  chip.textContent = "✓ LIVE · " + t;
else if (state === "stale")  chip.textContent = "⚠ CACHE · " + t;
}
/* ============================================================
🔧 BANER OFFLINE — zamiast ERR, z przyciskiem i auto‑retry
============================================================ */
function showRetryBanner() {
let b = document.getElementById("vehicles-retry-banner");
if (!b) {
b = document.createElement("div");
b.id = "vehicles-retry-banner";
b.style.cssText =
"position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;" +
"background:#2b0b14;color:#ffd7e2;border:1px solid #ff2a6d;border-radius:12px;" +
"padding:10px 16px;font:600 13px/1.4 system-ui,sans-serif;display:flex;" +
"gap:12px;align-items:center;box-shadow:0 8px 24px rgba(255,42,109,.35);";
const msg = document.createElement("span");
msg.textContent = "Brak połączenia z API — ponawianie automatyczne…";
const btn = document.createElement("button");
btn.textContent = "Spróbuj teraz";
btn.style.cssText =
"background:#ff2a6d;color:#fff;border:none;border-radius:8px;" +
"padding:6px 12px;font-weight:700;cursor:pointer;";
btn.addEventListener("click", () => { hardFailAutoRetries = 0; hardLoad(null); });
b.appendChild(msg);
b.appendChild(btn);
document.body.appendChild(b);
}
b.style.display = "flex";
if (hardFailAutoRetries < CFG.MAX_AUTO_RETRY) {
hardFailAutoRetries++;
setTimeout(() => {
const still = document.getElementById("vehicles-retry-banner");
if (still && still.style.display !== "none") hardLoad(null);
}, 15000);
}
}
function hideRetryBanner() {
const b = document.getElementById("vehicles-retry-banner");
if (b) b.style.display = "none";
}
/* ============================================================
🔧 PODŚWIETLANIE — WSTRZYKIWANIE STYLI CSS
============================================================ */
function injectHighlightStyles() {
if (document.getElementById("vehicles-highlight-styles")) return;
const style = document.createElement("style");
style.id = "vehicles-highlight-styles";
style.innerHTML = `
@keyframes adr-highlight-pulse {
0%, 100% {
background: rgba(255, 42, 109, 0.15);
box-shadow: 0 0 0 0 rgba(255, 42, 109, 0.4);
}
50% {
background: rgba(255, 42, 109, 0.3);
box-shadow: 0 0 20px 4px rgba(255, 42, 109, 0.6);
}
}
.adr-card-highlight {
animation: adr-highlight-pulse 1.2s ease-in-out 3;
border: 2px solid #ff2a6d !important;
border-radius: 12px;
transition: all 0.3s ease;
}
.adr-all-highlight {
animation: adr-highlight-pulse 1.2s ease-in-out 3;
background: rgba(255, 42, 109, 0.2) !important;
border-left: 4px solid #ff2a6d !important;
transition: all 0.3s ease;
}
`;
document.head.appendChild(style);
}
/* ============================================================
🔧 PREFETCH — startuje od razu przy parsowaniu skryptu,
zanim jeszcze DOM będzie gotowy (ucina czekanie na DOMContentLoaded)
============================================================ */
let prefetchPromise = null;
try {
prefetchPromise = fetchApiJson("getvehiclesdata", {
retries: 1,
timeoutMs: CFG.HARD_TIMEOUT_MS,
fallbackToLastGood: false
}).catch(err => { prefetchPromise = null; throw err; });
} catch (e) { prefetchPromise = null; }
/* ============================================================
MAIN LOADER
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
injectHighlightStyles();
bootstrapVehicles();
});
/*
🔧 NOWY PRZEPŁYW ŁADOWANIA:
1) Masz ostatnie dobre dane? → render NATYCHMIAST (0 s), sync w tle.
2) Nie masz? → spinner + twarde ładowanie z retry (pierwsza próba = prefetch).
Kierowca nigdy nie widzi ERR ani pustej strony przy zimnym starcie.
*/
function bootstrapVehicles() {
const p = prefetchPromise; prefetchPromise = null;
const good = readLastGood();
if (good) {
lastGoodTs = good.ts || Date.now();
try { renderAll(good.data); } catch (e) { console.error("Render cache error:", e); }
updateSyncChip("stale", lastGoodTs);
syncFresh(p);
startAutoRefresh();
} else {
hardLoad(p);
}
}
function renderAll(data) {
let trucks = Array.isArray(data.trucks) ? data.trucks : [];
let tanktrailers = Array.isArray(data.tanktrailers) ? data.tanktrailers : [];
// ⭐ SORTOWANIE ADR — obowiązuje wszędzie
trucks = sortVehiclesByADR(trucks);
tanktrailers = sortVehiclesByADR(tanktrailers);
updateCounters(trucks, tanktrailers);
updateADRStatus(trucks, tanktrailers);
updateADRExtraCounters(trucks, tanktrailers);
renderADRReminderCenter(trucks, tanktrailers);
renderADRFleetGrids(trucks, tanktrailers);
renderAllVehicles(trucks, tanktrailers);
initAllVehiclesSearch(trucks, tanktrailers);
}
/* Twarde ładowanie — tylko gdy brak danych w localStorage */
async function hardLoad(firstPromise) {
showSpinner();
for (let attempt = 1; attempt <= CFG.HARD_RETRIES; attempt++) {
try {
const data = (attempt === 1 && firstPromise)
? await firstPromise
: await fetchApiJson("getvehiclesdata", {
retries: 1,
timeoutMs: CFG.HARD_TIMEOUT_MS,
fallbackToLastGood: false
});
hideSpinner();
hideRetryBanner();
lastFetchTs = Date.now();
lastGoodTs = lastFetchTs;
renderAll(data);
updateSyncChip("fresh", lastFetchTs);
startAutoRefresh();
return;
} catch (err) {
console.warn("hardLoad próba " + attempt + "/" + CFG.HARD_RETRIES + ":", err);
if (attempt < CFG.HARD_RETRIES) await sleep(1500 * attempt);
}
}
hideSpinner();
showErrorState();
}
/* Sync w tle — nigdy nie blokuje UI, nigdy nie psuje widoku */
async function syncFresh(existingPromise) {
if (syncInProgress) return;
syncInProgress = true;
const hadData = !!lastGoodTs;
if (hadData) updateSyncChip("syncing", lastGoodTs);
try {
let data = null;
if (existingPromise) {
try { data = await existingPromise; } catch (e) { data = null; }
}
if (!data) {
data = await fetchApiJson("getvehiclesdata", {
retries: CFG.BG_RETRIES,
timeoutMs: CFG.BG_TIMEOUT_MS,
fallbackToLastGood: false
});
}
lastFetchTs = Date.now();
lastGoodTs = lastFetchTs;
renderAll(data);
updateSyncChip("fresh", lastFetchTs);
hideRetryBanner();
} catch (err) {
console.warn("Sync w tle nieudany (zostają dane z cache):", err);
if (hadData) updateSyncChip("stale", lastGoodTs);
} finally {
syncInProgress = false;
}
}
/* Auto‑odświeżanie: interval + powrót do karty */
function startAutoRefresh() {
if (autoRefreshTimer) return;
autoRefreshTimer = setInterval(() => syncFresh(null), CFG.AUTO_REFRESH_MS);
document.addEventListener("visibilitychange", () => {
if (document.visibilityState === "visible" &&
Date.now() - lastFetchTs > CFG.MIN_REFETCH_GAP_MS) {
syncFresh(null);
}
});
}
/* ============================================================
SPINNER CONTROLS
============================================================ */
function showSpinner() {
const spinner = document.getElementById("loading-spinner");
if (spinner) {
spinner.style.display = "flex";
spinner.style.opacity = "1";
}
}
function hideSpinner() {
const spinner = document.getElementById("loading-spinner");
if (spinner) {
spinner.style.opacity = "0";
setTimeout(() => {
spinner.style.display = "none";
}, 300);
}
}
/* ============================================================
GLOBAL SORTING FUNCTION — ADR ASCENDING + NO ADR LAST
============================================================ */
function sortVehiclesByADR(arr) {
const withDate = [];
const withoutDate = [];
arr.forEach(v => {
const adrDate = parseDate(getAdrRaw(v));
if (adrDate && !isNaN(adrDate.getTime())) {
withDate.push({ ...v, __adrDate: adrDate });
} else {
withoutDate.push({ ...v, __adrDate: null });
}
});
withDate.sort((a, b) => a.__adrDate - b.__adrDate);
return [...withDate, ...withoutDate];
}
/* ============================================================
SEKCJA 1 — VEHICLES OVERVIEW (kafle)
============================================================ */
function updateCounters(trucks, tanktrailers) {
setTileValue("vc-trucks", trucks.length);
setTileValue("vc-tanktrailers", tanktrailers.length);
const adrExpiring = countADRExpiring(trucks, tanktrailers, 90);
const adrExpired = countADRExpired(trucks, tanktrailers);
setTileValue("vc-adr-expiring", adrExpiring);
setTileValue("vc-adr-expired", adrExpired);
}
function setTileValue(id, value) {
const el = document.getElementById(id);
if (!el) return;
el.textContent = value;
}
/* ============================================================
SEKCJA 2 — PREMIUM ADR TERMIN LIST (prawa kolumna)
============================================================ */
function updateADRStatus(trucks, tanktrailers) {
const today = normalizeDate(new Date());
const adr21 = [];
const adr7 = [];
[...trucks, ...tanktrailers].forEach((item) => {
const adr = getAdrRaw(item);
const plates = getPlates(item);
const internal = getInternal(item);
const model = getModel(item);
if (!adr) return;
const adrDate = parseDate(adr);
if (!adrDate) return;
const diff = daysBetween(today, adrDate);
if (diff > 0 && diff <= 21) adr21.push({ plates, internal, model, adrDate, diff });
if (diff > 0 && diff <= 7) adr7.push({ plates, internal, model, adrDate, diff });
});
const combined = [...adr7, ...adr21];
const unique = combined.filter(
(item, index, self) =>
index === self.findIndex((t) => t.plates === item.plates)
);
const adr21El = document.getElementById("adr-21");
const adr7El = document.getElementById("adr-7");
if (adr21El) adr21El.textContent = adr21.length;
if (adr7El) adr7El.textContent = adr7.length;
const listContainer = document.getElementById("adr-list-container");
if (!listContainer) return;
listContainer.innerHTML = "";
unique.forEach((item) => {
const urgencyClass = item.diff <= 7 ? "badge-7" : item.diff <= 21 ? "badge-21" : "";
const urgencyText = item.diff === 1 ? "1 day" : `${item.diff} days`;
const row = document.createElement("div");
row.className = "adr-item";
row.innerHTML = `
<span class="adr-plates">${item.plates}</span>
<span class="adr-internal">${item.internal}</span>
<span class="adr-model">${item.model}</span>
<span class="adr-date">${fmtDate(item.adrDate)}</span>
<span class="adr-days-col">
<span class="adr-badge ${urgencyClass}"></span>
<span class="adr-badge-text">${urgencyText}</span>
</span>
`;
listContainer.appendChild(row);
});
}
/* ============================================================
ADR CALCULATIONS — stable & clean
============================================================ */
function countADRExpiring(trucks, tanktrailers, daysLimit) {
const today = normalizeDate(new Date());
let count = 0;
[...trucks, ...tanktrailers].forEach((item) => {
const adr = getAdrRaw(item);
if (!adr) return;
const adrDate = parseDate(adr);
if (!adrDate) return;
const diff = daysBetween(today, adrDate);
if (diff > 0 && diff <= daysLimit) count++;
});
return count;
}
function countADRExpired(trucks, tanktrailers) {
const today = normalizeDate(new Date());
let count = 0;
[...trucks, ...tanktrailers].forEach((item) => {
const adr = getAdrRaw(item);
if (!adr) return;
const adrDate = parseDate(adr);
if (!adrDate) return;
const diff = daysBetween(today, adrDate);
if (diff < 0) count++;
});
return count;
}
/* ============================================================
DATE HELPERS — stable & safe
============================================================ */
function normalizeDate(d) {
const x = new Date(d);
x.setHours(0, 0, 0, 0);
return x;
}
function daysBetween(dateA, dateB) {
const a = normalizeDate(dateA);
const b = normalizeDate(dateB);
return Math.round((b - a) / 86400000);
}
function parseDate(value) {
if (!value) return null;
if (value instanceof Date) return value;
if (typeof value === "number") {
const ms = Math.round((value - 25569) * 86400 * 1000);
return new Date(ms);
}
const parsed = new Date(value);
if (!isNaN(parsed.getTime())) return parsed;
return null;
}
function fmtDate(d) {
if (!d || !(d instanceof Date) || isNaN(d.getTime())) {
return "—";
}
return d.toLocaleDateString("pl-PL", {
day: "2-digit",
month: "2-digit",
year: "numeric",
});
}
/* ============================================================
SEKCJA 2 — DODATKOWE KAFELKI (ADR DOCUMENT MISSING + ALERTS)
============================================================ */
function updateADRExtraCounters(trucks, tanktrailers) {
const allVehicles = [...trucks, ...tanktrailers];
const missingVehicles = allVehicles.filter((v) => {
const key = Object.keys(v).find(
(k) => normKey_(k).replace(/_/g, " ") === "ADR DOCUMENT MISSING"
);
const val = key ? String(v[key] || "").trim().toUpperCase() : "";
return val === "YES";
});
const docMissingEl = document.getElementById("adr-doc-missing");
if (docMissingEl) {
docMissingEl.textContent = missingVehicles.length;
}
const docMissingListEl = document.getElementById("adr-doc-missing-list");
if (docMissingListEl) {
if (missingVehicles.length === 0) {
docMissingListEl.textContent = "NONE";
docMissingListEl.style.color = "#0f9d58";
} else {
const formattedList = missingVehicles
.map((v) => `${getPlates(v)} (${getInternal(v)})`)
.join(", ");
docMissingListEl.textContent = formattedList;
docMissingListEl.style.color = "#ff2a3f";
}
}
const alertsEl = document.getElementById("adr-alerts-active");
if (alertsEl) {
alertsEl.textContent = "ON";
alertsEl.style.color = "#0f9d58";
}
}
/* ============================================================
SEKCJA 3 — ADR REMINDER CENTER (FINAL FIXED)
============================================================ */
function renderADRReminderCenter(trucks, tanktrailers) {
const container = document.getElementById("adr-reminder-container");
if (!container) return;
container.innerHTML = "";
const today = normalizeDate(new Date());
const reminders = [];
function addVehicleReminder(item, type, diff) {
const plates = getPlates(item);
const internal = getInternal(item);
const model = getModel(item);
const adrDate = parseDate(getAdrRaw(item));
let badgeClass = "";
let remainingText = "";
if (type === "EXPIRED") {
badgeClass = "badge-expired";
remainingText = "Expired";
} else if (type === "7 DAYS") {
badgeClass = "badge-7";
remainingText = `${diff} days`;
} else if (type === "21 DAYS") {
badgeClass = "badge-21";
remainingText = `${diff} days`;
}
reminders.push({
type, badgeClass, plates, internal, model, adrDate, remainingText,
});
}
[...trucks, ...tanktrailers].forEach((item) => {
const adr = getAdrRaw(item);
if (!adr) return;
const adrDate = parseDate(adr);
if (!adrDate) return;
const diff = daysBetween(today, adrDate);
if (diff < 0) addVehicleReminder(item, "EXPIRED", diff);
else if (diff <= 7) addVehicleReminder(item, "7 DAYS", diff);
else if (diff <= 21) addVehicleReminder(item, "21 DAYS", diff);
});
const sorted = [
...reminders.filter((r) => r.type === "EXPIRED"),
...reminders.filter((r) => r.type === "21 DAYS"),
...reminders.filter((r) => r.type === "7 DAYS"),
];
if (sorted.length === 0) {
container.innerHTML = `
<div class="adr-ok-message">
All vehicles have current ADR - OK!
</div>
`;
return;
}
sorted.forEach((r) => {
const item = document.createElement("div");
item.className = "adr-reminder-item";
item.innerHTML = `
<div class="adr-tooltip">${r.remainingText}</div>
<span class="adr-reminder-badge ${r.badgeClass}">
🔔 ${r.type}
</span>
<div class="adr-reminder-main">
<span class="adr-reminder-plates">${r.plates}</span>
<span class="adr-reminder-internal">${r.internal}</span>
</div>
<div class="adr-reminder-model">${r.model}</div>
<div class="adr-reminder-meta">
<span>ADR VALID: ${fmtDate(r.adrDate)}</span><br>
<span>Remaining: ${r.remainingText}</span>
</div>
`;
container.appendChild(item);
});
}
/* ============================================================
SEKCJA 4 — ADR VEHICLES CENTER (TRUCKS + TANKTRAILERS)
============================================================ */
function renderADRFleetGrids(trucks, tanktrailers) {
const sortedTrucks = sortVehiclesByADR(trucks);
const sortedTrailers = sortVehiclesByADR(tanktrailers);
renderFleetColumn("adr-trucks-list", "adr-trucks-count", sortedTrucks, "TRUCK");
renderFleetColumn("adr-trailers-list", "adr-trailers-count", sortedTrailers, "TRAILER");
}
function renderFleetColumn(listId, counterId, vehicles, typeLabel) {
const listEl = document.getElementById(listId);
const counterEl = document.getElementById(counterId);
if (!listEl || !counterEl) return;
counterEl.textContent = `${vehicles.length} VEHICLES`;
listEl.innerHTML = "";
const today = normalizeDate(new Date());
vehicles.forEach((v) => {
const plates = getPlates(v);
const internal = getInternal(v);
const model = getModel(v);
const adrDate = parseDate(getAdrRaw(v));
let badgeClass = "";
let badgeText = "";
let statusText = "";
let statusClass = "";
if (!adrDate) {
badgeClass = "adr-badge-critical";
badgeText = "NO ADR";
statusText = "DOCUMENT MISSING";
statusClass = "adr-status-critical";
} else {
const diff = daysBetween(today, adrDate);
if (diff < 0) {
badgeClass = "adr-badge-critical";
badgeText = "EXPIRED";
statusText = "ADR EXPIRED";
statusClass = "adr-status-critical";
} else if (diff <= 7) {
badgeClass = "adr-badge-days";
badgeText = `${diff} DAYS`;
statusText = "URGENT";
statusClass = "adr-status-critical";
} else if (diff <= 21) {
badgeClass = "adr-badge-days";
badgeText = `${diff} DAYS`;
statusText = "PLANNING REQUIRED";
statusClass = "adr-status-warning";
} else {
badgeClass = "adr-badge-days";
badgeText = `${diff} DAYS`;
statusText = "OK";
statusClass = "";
}
}
const card = document.createElement("article");
card.className = "adr-vehicle-card";
card.setAttribute("data-plate", plates);
card.setAttribute("data-internal", internal);
card.setAttribute("data-model", model);
card.innerHTML = `
<header class="adr-vehicle-card-header">
<div class="adr-vehicle-main">
<span class="adr-vehicle-name">${typeLabel}</span>
<span class="adr-vehicle-plate">${plates}</span>
</div>
<div class="adr-vehicle-badges">
<span class="adr-badge ${badgeClass}">${badgeText}</span>
</div>
</header>
<div class="adr-vehicle-meta">
<div class="adr-meta-row">
<span class="adr-meta-label">Internal NR</span>
<span class="adr-meta-value">${internal}</span>
</div>
<div class="adr-meta-row">
<span class="adr-meta-label">Model</span>
<span class="adr-meta-value">${model}</span>
</div>
<div class="adr-meta-row">
<span class="adr-meta-label">ADR expiry</span>
<span class="adr-meta-value adr-expiry">${adrDate ? fmtDate(adrDate) : "—"}</span>
</div>
<div class="adr-meta-row">
<span class="adr-meta-label">Status</span>
<span class="adr-meta-value ${statusClass}">${statusText}</span>
</div>
</div>
`;
listEl.appendChild(card);
});
}
/* ============================================================
ERROR STATE — 🔧 2026-08-06: ZERO "ERR" dla kierowcy.
Kafle pokazują "--", a baner offline sam ponawia ładowanie.
============================================================ */
function showErrorState() {
["vc-trucks", "vc-tanktrailers", "vc-adr-expiring", "vc-adr-expired"].forEach(
(id) => {
const el = document.getElementById(id);
if (el) el.textContent = "--";
}
);
const listContainer = document.getElementById("adr-list-container");
if (listContainer) {
listContainer.innerHTML = "";
const row = document.createElement("div");
row.className = "adr-item";
row.textContent = "NO CONNECTION — retrying…";
listContainer.appendChild(row);
}
showRetryBanner();
}
/* ============================================================
MODULE STABILIZATION — safe guards
============================================================ */
function safeGet(obj, key, fallback = "—") {
if (!obj || typeof obj !== "object") return fallback;
const val = obj[key];
return val !== undefined && val !== null && val !== "" ? val : fallback;
}
function safeNumber(n, fallback = 0) {
return typeof n === "number" && !isNaN(n) ? n : fallback;
}
/* ============================================================
SEKCJA 5 — ALL VEHICLES (TWO COLUMNS, PREMIUM VERSION)
============================================================ */
function renderAllVehicles(trucks, tanktrailers) {
const sortedTrucks = sortVehiclesByADR(trucks);
const sortedTrailers = sortVehiclesByADR(tanktrailers);
const trucksEl = document.getElementById("adr-all-trucks-list");
const trailersEl = document.getElementById("adr-all-trailers-list");
if (!trucksEl || !trailersEl) return;
trucksEl.innerHTML = "";
trailersEl.innerHTML = "";
sortedTrucks.forEach(v => renderAllRow(v, trucksEl));
sortedTrailers.forEach(v => renderAllRow(v, trailersEl));
}
/* 🔧 FIX 2026-08-06: klucze czytane przez vGet (trim) — data-plate
zawsze zgodne z wyszukiwarką, nawet gdy nagłówki mają spacje */
function renderAllRow(v, container) {
const plates = getPlates(v);
const internal = getInternal(v);
const model = getModel(v);
const adrDate = parseDate(getAdrRaw(v));
const adrText = adrDate ? fmtDate(adrDate) : "—";
const row = document.createElement("div");
row.className = "adr-all-row";
row.setAttribute("data-plate", plates);
row.setAttribute("data-internal", internal);
row.innerHTML = `
<span>${plates}</span>
<span>${internal}</span>
<span>${model}</span>
<span class="adr-all-adr-cell">
<span class="adr-all-adr-icon">
<svg viewBox="0 0 32 32" class="adr-svg-icon">
<rect x="4" y="4" width="24" height="24" rx="6"
stroke="#ff2a6d" stroke-width="2.5" fill="none"/>
<text x="16" y="20" text-anchor="middle"
font-size="10" font-weight="700"
fill="#ff2a6d">ADR</text>
</svg>
</span>
<span class="adr-all-adr-text">${adrText}</span>
</span>
`;
container.appendChild(row);
}
/* ============================================================
PREMIUM SEARCH — SEKCJA 5 (🔧 bind tylko raz, index odświeżany)
============================================================ */
let allSearchIndex = [];
function initAllVehiclesSearch(trucks, tanktrailers) {
const input = document.getElementById("adr-search-input-all");
const suggestionsEl = document.getElementById("adr-search-suggestions-all");
const trucksEl = document.getElementById("adr-all-trucks-list");
const trailersEl = document.getElementById("adr-all-trailers-list");
if (!input || !suggestionsEl || !trucksEl || !trailersEl) return;
allSearchIndex = [...trucks, ...tanktrailers].map(v => ({
plates: getPlates(v),
internal: getInternal(v),
model: getModel(v),
isTruck: trucks.includes(v)
}));
if (input.dataset.bound) return; // listener już podpięty — tylko index się odświeżył
input.dataset.bound = "1";
function clearSuggestions() {
suggestionsEl.innerHTML = "";
suggestionsEl.classList.remove("adr-search-suggestions-visible");
}
function clearHighlight() {
document.querySelectorAll(".adr-all-highlight")
.forEach(el => el.classList.remove("adr-all-highlight"));
}
function scrollToRow(match) {
clearHighlight();
const selector = `.adr-all-row[data-plate="${CSS.escape(match.plates)}"][data-internal="${CSS.escape(match.internal)}"]`;
const row = document.querySelector(selector);
if (!row) {
console.warn("Nie znaleziono wiersza:", selector);
return;
}
row.classList.add("adr-all-highlight");
row.scrollIntoView({ behavior: "smooth", block: "center" });
}
input.addEventListener("input", () => {
const q = input.value.trim().toLowerCase();
clearSuggestions();
clearHighlight();
if (!q) return;
const matches = allSearchIndex
.filter(item => {
const haystack = (item.plates + " " + item.internal + " " + item.model).toLowerCase();
return haystack.includes(q);
})
.slice(0, 8);
if (!matches.length) return;
matches.forEach(m => {
const row = document.createElement("div");
row.className = "adr-search-suggestion-item";
row.innerHTML = `
<span class="adr-search-suggestion-type">${m.isTruck ? "TRUCK" : "TRAILER"}</span>
<span class="adr-search-suggestion-main">${m.plates}</span>
<span class="adr-search-suggestion-sub">${m.internal} · ${m.model}</span>
`;
row.addEventListener("click", e => {
e.stopPropagation();
scrollToRow(m);
clearSuggestions();
});
suggestionsEl.appendChild(row);
});
suggestionsEl.classList.add("adr-search-suggestions-visible");
});
document.addEventListener("click", e => {
if (
e.target === input ||
e.target.closest(".adr-search-inner") ||
e.target.closest(".adr-search-suggestions")
) return;
input.value = "";
clearSuggestions();
clearHighlight();
});
}
/* ============================================================
FINAL EXPORT (BASE MODULE)
============================================================ */
function loadVehiclesData() { bootstrapVehicles(); } // kompatybilność
const VehiclesModule = {
loadVehiclesData,
bootstrapVehicles,
updateCounters,
updateADRStatus,
updateADRExtraCounters,
renderADRReminderCenter,
renderADRFleetGrids,
countADRExpiring,
countADRExpired,
normalizeDate,
daysBetween,
parseDate,
fmtDate,
showErrorState,
};
try {
window.VehiclesModule = VehiclesModule;
} catch (e) { }
/* ============================================================
ADR VEHICLE SEARCH — sekcja 4 (🔧 bind tylko raz)
============================================================ */
let adrSearchIndex = [];
function buildADRSearchIndex(trucks, tanktrailers) {
adrSearchIndex = [];
trucks.forEach((v) => {
adrSearchIndex.push({
type: "TRUCK",
plates: getPlates(v),
internal: getInternal(v),
model: getModel(v),
});
});
tanktrailers.forEach((v) => {
adrSearchIndex.push({
type: "TRAILER",
plates: getPlates(v),
internal: getInternal(v),
model: getModel(v),
});
});
}
function initADRSearch(trucks, tanktrailers) {
buildADRSearchIndex(trucks, tanktrailers);
const input = document.getElementById("adr-search-input");
const suggestionsEl = document.getElementById("adr-search-suggestions");
const vehiclesCenter = document.querySelector(".adr-vehicles-center");
if (!input || !suggestionsEl || !vehiclesCenter) return;
if (input.dataset.bound) return;
input.dataset.bound = "1";
function clearSuggestions() {
suggestionsEl.innerHTML = "";
suggestionsEl.classList.remove("adr-search-suggestions-visible");
}
function clearHighlight() {
document
.querySelectorAll(".adr-vehicle-card.adr-card-highlight")
.forEach((card) => card.classList.remove("adr-card-highlight"));
}
function scrollToCard(match) {
clearHighlight();
const selector = `.adr-vehicle-card[data-plate="${CSS.escape(
match.plates
)}"][data-internal="${CSS.escape(match.internal)}"]`;
const card = document.querySelector(selector);
if (!card) {
console.warn("Nie znaleziono karty:", selector);
return;
}
card.classList.add("adr-card-highlight");
card.scrollIntoView({ behavior: "smooth", block: "center" });
}
input.addEventListener("input", () => {
const q = input.value.trim().toLowerCase();
clearSuggestions();
clearHighlight();
if (!q) return;
const matches = adrSearchIndex
.filter((item) => {
const haystack = (
item.plates + " " + item.internal + " " + item.model
).toLowerCase();
return haystack.includes(q);
})
.slice(0, 8);
if (!matches.length) return;
matches.forEach((m) => {
const row = document.createElement("div");
row.className = "adr-search-suggestion-item";
row.innerHTML = `
<span class="adr-search-suggestion-type">${m.type}</span>
<span class="adr-search-suggestion-main">${m.plates || "—"}</span>
<span class="adr-search-suggestion-sub">${m.internal || "—"} · ${m.model || "—"}</span>
`;
row.addEventListener("click", (e) => {
e.stopPropagation();
scrollToCard(m);
clearSuggestions();
});
suggestionsEl.appendChild(row);
});
suggestionsEl.classList.add("adr-search-suggestions-visible");
});
document.addEventListener("click", (e) => {
if (
e.target === input ||
e.target.closest(".adr-search-inner") ||
e.target.closest(".adr-search-suggestions")
) {
return;
}
input.value = "";
clearSuggestions();
clearHighlight();
});
}
/* ============================================================
Hook: odpal wyszukiwarkę po wyrenderowaniu sekcji 4
============================================================ */
const _origRenderADRFleetGrids = renderADRFleetGrids;
renderADRFleetGrids = function (trucks, tanktrailers) {
_origRenderADRFleetGrids(trucks, tanktrailers);
initADRSearch(trucks, tanktrailers);
};