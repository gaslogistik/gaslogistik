/* ============================================================
   VEHICLES.JS — PREMIUM ADR MODULE (STABLE, CLEAN, EXTENDED)
   ============================================================ */

const API_URL =
    "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec?action=getvehiclesdata";

/* ============================================================
   API RESILIENCE — 3 próby + ostatnie dobre dane zamiast ERR
   ============================================================ */
const API_BASE_URL =
    "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec";

async function fetchApiJson(action, opts) {
    opts = opts || {};
    const retries = opts.retries || 3;
    const timeoutMs = opts.timeoutMs || 25000;
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
            try { localStorage.setItem("lastgood_" + action, JSON.stringify({ ts: Date.now(), data: data })); } catch (e) { }
            return data;
        } catch (err) {
            clearTimeout(timer);
            lastError = err;
            console.warn("API próba " + attempt + "/" + retries + " (" + action + "):", err);
            if (attempt < retries) await new Promise(r => setTimeout(r, 1200 * attempt));
        }
    }

    // Wszystkie próby padły → pokaż OSTATNIE DOBRE dane zamiast ERR
    try {
        const raw = localStorage.getItem("lastgood_" + action);
        if (raw) {
            const p = JSON.parse(raw);
            if (p && p.data) { console.warn("Ostatnie dobre dane: " + action); return p.data; }
        }
    } catch (e) { }

    throw lastError || new Error("API niedostępne: " + action);
}

/* ============================================================
   MAIN LOADER
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    loadVehiclesData();
});

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
   FETCH VEHICLES DATA
   ============================================================ */

async function loadVehiclesData() {
    showSpinner();
    try {
        const data = await fetchApiJson("getvehiclesdata");

        let trucks = Array.isArray(data.trucks) ? data.trucks : [];
        let tanktrailers = Array.isArray(data.tanktrailers) ? data.tanktrailers : [];

        // ⭐ SORTOWANIE ADR — obowiązuje wszędzie
        trucks = sortVehiclesByADR(trucks);
        tanktrailers = sortVehiclesByADR(tanktrailers);

        // SEKCJA 1 — overview tiles
        updateCounters(trucks, tanktrailers);

        // SEKCJA 2 — ADR list + extra tiles
        updateADRStatus(trucks, tanktrailers);
        updateADRExtraCounters(trucks, tanktrailers);

        // SEKCJA 3 — reminder center
        renderADRReminderCenter(trucks, tanktrailers);

        // SEKCJA 4 — premium fleet grids (TRUCKS / TANKTRAILERS)
        renderADRFleetGrids(trucks, tanktrailers);

        // SEKCJA 5 — ALL VEHICLES (FULL FLEET SUMMARY)
        renderAllVehicles(trucks, tanktrailers);
        initAllVehiclesSearch(trucks, tanktrailers);

    } catch (err) {
        console.error("API ERROR:", err);
        showErrorState();
    } finally {
        hideSpinner();
    }
}

/* ============================================================
   GLOBAL SORTING FUNCTION — ADR ASCENDING + NO ADR LAST
   ============================================================ */

function sortVehiclesByADR(arr) {
    const withDate = [];
    const withoutDate = [];

    arr.forEach(v => {
        const adrRaw = v["ADR VALID"];
        const adrDate = parseDate(adrRaw);

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

        const adr = item["ADR VALID"];
        const plates = item["PLATES"] || item["REG"] || "UNKNOWN";
        const internal = item["INTERNAL NR."] || "—";
        const model = item["MODEL"] || item["TYPE"] || "—";

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

        // POPRAWIONO: Dynamiczne obliczanie pozostałych dni
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
        const adr = item["ADR VALID"];
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
        const adr = item["ADR VALID"];
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

    // 1. Filtrujemy pojazdy z brakiem dokumentu ADR
    const missingVehicles = allVehicles.filter((v) => {
        const key = Object.keys(v).find(
            (k) => k.replace(/\s+/g, " ").trim().toUpperCase() === "ADR DOCUMENT MISSING"
        );
        const val = key ? (v[key] || "").toString().trim().toUpperCase() : "";
        return val === "YES";
    });

    // 2. Aktualizacja głównego licznika liczbowego
    const docMissingEl = document.getElementById("adr-doc-missing");
    if (docMissingEl) {
        docMissingEl.textContent = missingVehicles.length;
    }

    // 3. Budujemy listę pojazdów w formacie: PLATES (INTERNAL NR.)
    const docMissingListEl = document.getElementById("adr-doc-missing-list");
    if (docMissingListEl) {
        if (missingVehicles.length === 0) {
            docMissingListEl.textContent = "NONE";
            docMissingListEl.style.color = "#0f9d58";
        } else {
            const formattedList = missingVehicles
                .map((v) => {
                    const plate = v["PLATES"] || v["REG"] || "N/A";
                    const internal = v["INTERNAL NR."] || "N/A";
                    return `${plate} (${internal})`;
                })
                .join(", ");

            docMissingListEl.textContent = formattedList;
            docMissingListEl.style.color = "#ff2a3f";
        }
    }

    // 4. Status dla alertów
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

        const plates = item["PLATES"] || item["REG"] || "UNKNOWN";
        const internal = item["INTERNAL NR."] || "—";
        const model = item["MODEL"] || item["TYPE"] || "—";
        const adrRaw = item["ADR VALID"];
        const adrDate = parseDate(adrRaw);

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
            type,
            badgeClass,
            plates,
            internal,
            model,
            adrDate,
            remainingText,
        });
    }

    [...trucks, ...tanktrailers].forEach((item) => {
        const adr = item["ADR VALID"];
        if (!adr) return;

        const adrDate = parseDate(adr);
        if (!adrDate) return;

        const diff = daysBetween(today, adrDate);

        if (diff < 0) {
            addVehicleReminder(item, "EXPIRED", diff);
        } else if (diff <= 7) {
            addVehicleReminder(item, "7 DAYS", diff);
        } else if (diff <= 21) {
            addVehicleReminder(item, "21 DAYS", diff);
        }
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

    // ⭐ SORTOWANIE ADR — obowiązuje również tutaj
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

        const plates = v["PLATES"] || v["REG"] || "UNKNOWN";
        const internal = v["INTERNAL NR."] || "—";
        const model = v["MODEL"] || v["TYPE"] || "—";
        const adrRaw = v["ADR VALID"];
        const adrDate = parseDate(adrRaw);

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
   ERROR STATE — clean fallback
   ============================================================ */

function showErrorState() {
    ["vc-trucks", "vc-tanktrailers", "vc-adr-expiring", "vc-adr-expired"].forEach(
        (id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = "ERR";
        }
    );

    const listContainer = document.getElementById("adr-list-container");
    if (listContainer) {
        listContainer.innerHTML = "";
        const row = document.createElement("div");
        row.className = "adr-item";
        row.textContent = "API ERROR";
        listContainer.appendChild(row);
    }
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

    // ⭐ SORTOWANIE ADR — obowiązuje również tutaj
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

function renderAllRow(v, container) {
    const plates = v["PLATES"] || v["REG"] || "UNKNOWN";
    const internal = v["INTERNAL NR."] || "—";
    const model = v["MODEL"] || v["TYPE"] || "—";

    const adrRaw =
        v["ADR VALID"] ||
        v["ADR"] ||
        v["ADR_VALID"] ||
        v["ADR DATE"] ||
        v["ADR_VALID_DATE"] ||
        v["ADR EXPIRATION"] ||
        "—";

    const adrDate = parseDate(adrRaw);
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
   PREMIUM SEARCH — SEKCJA 5 (identyczna jak sekcja 4)
   ============================================================ */

function initAllVehiclesSearch(trucks, tanktrailers) {

    const input = document.getElementById("adr-search-input-all");
    const suggestionsEl = document.getElementById("adr-search-suggestions-all");

    const trucksEl = document.getElementById("adr-all-trucks-list");
    const trailersEl = document.getElementById("adr-all-trailers-list");

    if (!input || !suggestionsEl || !trucksEl || !trailersEl) return;

    const index = [...trucks, ...tanktrailers].map(v => ({
        plates: v["PLATES"] || v["REG"] || "",
        internal: v["INTERNAL NR."] || "",
        model: v["MODEL"] || v["TYPE"] || "",
        isTruck: trucks.includes(v)
    }));

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

        if (!row) return;

        row.classList.add("adr-all-highlight");
        row.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        clearSuggestions();
        clearHighlight();

        if (!q) return;

        const matches = index
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
                scrollToRow(match);
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

const VehiclesModule = {
    loadVehiclesData,
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
   ADR VEHICLE SEARCH — sekcja 4
   ============================================================ */

let adrSearchIndex = [];

function buildADRSearchIndex(trucks, tanktrailers) {
    adrSearchIndex = [];

    trucks.forEach((v) => {
        adrSearchIndex.push({
            type: "TRUCK",
            plates: v["PLATES"] || v["REG"] || "",
            internal: v["INTERNAL NR."] || "",
            model: v["MODEL"] || v["TYPE"] || "",
        });
    });

    tanktrailers.forEach((v) => {
        adrSearchIndex.push({
            type: "TRAILER",
            plates: v["PLATES"] || v["REG"] || "",
            internal: v["INTERNAL NR."] || "",
            model: v["MODEL"] || v["TYPE"] || "",
        });
    });
}

function initADRSearch(trucks, tanktrailers) {
    buildADRSearchIndex(trucks, tanktrailers);

    const input = document.getElementById("adr-search-input");
    const suggestionsEl = document.getElementById("adr-search-suggestions");
    const vehiclesCenter = document.querySelector(".adr-vehicles-center");

    if (!input || !suggestionsEl || !vehiclesCenter) return;

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

        if (!card) return;

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
                    item.plates +
                    " " +
                    item.internal +
                    " " +
                    item.model
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