// MATRIX — WERSJA Z CACHE DWUWARSTWOWYM (serwer + klient)
const MATRIX_API_URL =
    "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec?action=getMatrixData";
const SYSTEM_DATA_URL =
    "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec?action=getSystemData";

// 🔧 FIX: Konfiguracja cache klienta
const MATRIX_CACHE_KEY = "kp_matrix_cache";
const MATRIX_CACHE_TTL = 10 * 60 * 1000; // 10 minut w ms
const MATRIX_CACHE_TIME_KEY = "kp_matrix_cache_time";
const SYSTEM_CACHE_KEY = "kp_system_cache";
const SYSTEM_CACHE_TTL = 10 * 60 * 1000;
const SYSTEM_CACHE_TIME_KEY = "kp_system_cache_time";

document.addEventListener("DOMContentLoaded", () => {
    loadMatrix();
    initRefreshButton();
});

// 🔧 FIX: Przycisk wymuszonego odświeżenia cache
function initRefreshButton() {
    const btn = document.getElementById("matrix-refresh-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        // Wyczyść cache klienta
        localStorage.removeItem(MATRIX_CACHE_KEY);
        localStorage.removeItem(MATRIX_CACHE_TIME_KEY);
        localStorage.removeItem(SYSTEM_CACHE_KEY);
        localStorage.removeItem(SYSTEM_CACHE_TIME_KEY);
        // Wyczyść cache serwera (opcjonalnie — wywołuje action=clearcache)
        fetch(SYSTEM_DATA_URL.replace("getSystemData", "clearCache")).catch(() => { });
        // Przeładuj
        loadMatrix(true);
    });
}

// 🔥 Normalizacja nazw
function normalize(name) {
    if (!name) return "";
    return String(name)
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\u00A0/g, " ")
        .toUpperCase();
}

// Zarządzanie widocznością spinnera
function showSpinner() {
    const spinner = document.getElementById("matrix-loading-spinner");
    const container = document.getElementById("matrix-container");
    if (spinner) {
        spinner.classList.add("matrix-spinner-wrapper");
        spinner.style.display = "flex";
    }
    if (container) container.style.display = "none";
}

function hideSpinner() {
    const spinner = document.getElementById("matrix-loading-spinner");
    const container = document.getElementById("matrix-container");
    if (spinner) spinner.style.display = "none";
    if (container) container.style.display = "inline-grid";
}

// 🔧 FIX: Helper do cache klienta
function getCachedData(key, timeKey, ttl) {
    try {
        const cached = localStorage.getItem(key);
        const timestamp = parseInt(localStorage.getItem(timeKey) || "0", 10);
        if (cached && timestamp && (Date.now() - timestamp) < ttl) {
            return JSON.parse(cached);
        }
    } catch (e) {
        console.warn("Cache read error:", e);
    }
    return null;
}

function setCachedData(key, timeKey, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(timeKey, String(Date.now()));
    } catch (e) {
        console.warn("Cache write error:", e);
    }
}

// 🔧 FIX: Fetch z cache'em — stale-while-revalidate pattern
async function fetchWithCache(url, cacheKey, timeKey, ttl, forceRefresh = false) {
    // 1. Sprawdź cache klienta
    if (!forceRefresh) {
        const cached = getCachedData(cacheKey, timeKey, ttl);
        if (cached) {
            console.log(`[CACHE HIT] ${cacheKey} — z localStorage`);
            return { data: cached, fromCache: true };
        }
    }

    // 2. Brak cache — pobierz z serwera
    console.log(`[CACHE MISS] ${cacheKey} — fetch z API`);
    const res = await fetch(url);

    // 🔧 FIX: Sprawdzenie czy odpowiedź jest poprawna (nie HTML z błędem Google)
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
    }

    // Sprawdź content-type, żeby uniknąć błędu parsowania HTML
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Odpowiedź serwera (nie JSON):", text.substring(0, 200));
        throw new Error("Serwer zwrócił dane w formacie innym niż JSON (prawdopodobnie błąd Google Apps Script). Sprawdź czy wdrożyłeś nową wersję skryptu!");
    }

    const data = await res.json();

    // 3. Zapisz do cache klienta
    setCachedData(cacheKey, timeKey, data);
    return { data, fromCache: false };
}

// 🔧 FIX: Ciche odświeżenie w tle (stale-while-revalidate)
async function silentRefresh() {
    try {
        const [sysRes, matRes] = await Promise.all([
            fetch(SYSTEM_DATA_URL),
            fetch(MATRIX_API_URL)
        ]);
        const sysData = await sysRes.json();
        const matData = await matRes.json();
        setCachedData(SYSTEM_CACHE_KEY, SYSTEM_CACHE_TIME_KEY, sysData);
        setCachedData(MATRIX_CACHE_KEY, MATRIX_CACHE_TIME_KEY, matData);
        console.log("[SILENT REFRESH] Cache odświeżony w tle");
    } catch (e) {
        console.warn("[SILENT REFRESH] Error:", e);
    }
}

async function loadMatrix(forceRefresh = false) {
    const container = document.getElementById("matrix-container");
    if (!container) return;

    showSpinner();

    try {
        // 🔧 FIX: Równoległe fetch'e z cache'em (Promise.all)
        const [systemResult, matrixResult] = await Promise.all([
            fetchWithCache(SYSTEM_DATA_URL, SYSTEM_CACHE_KEY, SYSTEM_CACHE_TIME_KEY, SYSTEM_CACHE_TTL, forceRefresh),
            fetchWithCache(MATRIX_API_URL, MATRIX_CACHE_KEY, MATRIX_CACHE_TIME_KEY, MATRIX_CACHE_TTL, forceRefresh)
        ]);

        const systemData = systemResult.data;
        const matrixData = matrixResult.data;
        const wasFromCache = systemResult.fromCache || matrixResult.fromCache;

        // 1. Przetwórz systemCities i systemRelations
        let systemCities = [];
        let systemRelations = [];

        if (Array.isArray(systemData.cities)) {
            systemCities = systemData.cities.map(item => {
                if (typeof item === 'string') return item;
                if (Array.isArray(item)) return item[1] || item[0];
                if (typeof item === 'object' && item !== null) {
                    return item.CITY || item.City || item.city || item.NAME || item.Name || Object.values(item)[1] || Object.values(item)[0];
                }
                return String(item);
            }).filter(Boolean);
        }

        if (Array.isArray(systemData.relations)) {
            systemRelations = systemData.relations;
        }

        // 2. Ładowanie macierzy
        const relations = (matrixData.relations && matrixData.relations.length > 0)
            ? matrixData.relations
            : systemRelations;

        const locations = getAllLocations(systemCities, relations);
        const matrix = buildMatrixObject(locations, relations);
        const totalCitiesCount = Math.max(systemCities.length, locations.length);
        const totalRelationsCount = relations.length;

        updateUIStats(totalCitiesCount, totalRelationsCount);
        renderMatrix(locations, matrix);
        initDropdownCities(locations);
        initHeaderClickHighlights();
        hideSpinner();
        updateLastUpdateLabel(wasFromCache);

        // 🔧 FIX: Ciche odświeżenie w tle, jeśli dane były z cache (stale-while-revalidate)
        if (wasFromCache && !forceRefresh) {
            setTimeout(() => silentRefresh(), 100);
        }

    } catch (err) {
        hideSpinner();
        // 🔧 FIX: Wyświetl szczegółowy błąd, żeby wiedzieć co poszło nie tak
        container.innerHTML = `<div style="color: red; padding: 20px;">
      <strong>Błąd ładowania macierzy:</strong><br>
      ${err.message}<br><br>
      <small>Sprawdź konsolę przeglądarki (F12) oraz czy wdrożyłeś nową wersję skryptu w Google Apps Script (Deploy -> Manage deployments -> New version).</small>
    </div>`;
        container.style.display = "block";
        console.error("Matrix load error:", err);
    }
}

// 🔧 FIX: Aktualizacja etykiety LAST UPDATE z informacją o cache
function updateLastUpdateLabel(wasFromCache) {
    const el = document.getElementById("matrix-last-update");
    if (!el) return;
    const today = new Date();
    const formatted = today.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
    const cacheTag = wasFromCache ? " (cached)" : "";
    el.textContent = `LAST UPDATE ${formatted}${cacheTag}`;
}

// 🔥 Zbieranie PEŁNEJ listy lokalizacji
function getAllLocations(citiesList, relations) {
    const set = new Set();
    if (Array.isArray(citiesList)) {
        citiesList.forEach(c => {
            const norm = normalize(c);
            if (norm) set.add(norm);
        });
    }
    if (Array.isArray(relations)) {
        relations.forEach(r => {
            if (r.FROM) set.add(normalize(r.FROM));
            if (r.TO) set.add(normalize(r.TO));
        });
    }
    return Array.from(set).sort();
}

// 🔥 Wpisywanie wartości do liczników
function updateUIStats(citiesCount, relationsCount) {
    const locText = `${citiesCount} LOCATIONS`;
    const routeText = `${relationsCount} ROUTES`;

    const locById = document.getElementById("locations-count") ||
        document.getElementById("btn-locations") ||
        document.getElementById("locations-btn");
    const routeById = document.getElementById("routes-count") ||
        document.getElementById("btn-routes") ||
        document.getElementById("routes-btn");

    if (locById) locById.textContent = locText;
    if (routeById) routeById.textContent = routeText;

    const allElements = document.querySelectorAll("button, div, a, span");
    allElements.forEach(el => {
        if (el.children.length > 0) return;
        const txt = el.textContent.trim();
        if (txt.includes("LOCATIONS") || txt.includes("CITIES")) {
            el.textContent = locText;
        }
        if (txt.includes("ROUTES") || txt.includes("RELATIONS")) {
            el.textContent = routeText;
        }
    });
}

// 🔥 Budowa macierzy — DWUKIERUNKOWO
function buildMatrixObject(locations, relations) {
    const matrix = {};
    locations.forEach(a => {
        matrix[a] = {};
        locations.forEach(b => {
            matrix[a][b] = null;
        });
    });

    relations.forEach(r => {
        const from = normalize(r.FROM);
        const to = normalize(r.TO);
        const km = Math.round(Number(r.KM || 0));
        if (matrix[from] && matrix[from][to] !== undefined) {
            matrix[from][to] = km;
        }
        if (matrix[to] && matrix[to][from] !== undefined) {
            matrix[to][from] = km;
        }
    });
    return matrix;
}

// 🔧 FIX: Optymalizacja renderowania — DocumentFragment dla batch DOM updates
function renderMatrix(locations, matrix) {
    const container = document.getElementById("matrix-container");
    if (!container) return;
    container.innerHTML = "";
    container.classList.add("matrix-grid");

    const cols = locations.length + 1;
    container.style.setProperty("--cols", cols);

    if (window.innerWidth <= 768) {
        container.style.setProperty("--firstColWidth", `85px`);
        container.style.setProperty("--firstColFont", `9px`);
    } else {
        const longestName = locations.reduce((a, b) => a.length > b.length ? a : b, "");
        const width = longestName.length * 8 + 6;
        const fontSize = 12;
        container.style.setProperty("--firstColWidth", `${width}px`);
        container.style.setProperty("--firstColFont", `${fontSize}px`);
    }

    // 🔧 FIX: Używamy DocumentFragment — jeden reflow zamiast N reflowów
    const fragment = document.createDocumentFragment();
    fragment.appendChild(makeCell("", "matrix-header"));

    locations.forEach(loc => {
        const header = makeCell("", "matrix-header");
        const span = document.createElement("span");
        span.textContent = loc;
        header.appendChild(span);
        header.setAttribute("data-city", loc);
        if (window.innerWidth <= 768) {
            header.style.height = "85px";
            header.style.minHeight = "85px";
            header.style.maxHeight = "85px";
        }
        fragment.appendChild(header);
    });

    locations.forEach((rowLoc, rowIndex) => {
        const rowHeader = makeCell(rowLoc, "matrix-col-header");
        rowHeader.style.height = "24px";
        rowHeader.style.minHeight = "24px";
        rowHeader.style.maxHeight = "24px";
        rowHeader.style.width = `var(--firstColWidth)`;
        rowHeader.style.fontSize = `var(--firstColFont)`;
        rowHeader.style.padding = "2px";
        rowHeader.setAttribute("data-city", rowLoc);
        fragment.appendChild(rowHeader);

        locations.forEach((colLoc, colIndex) => {
            const km = matrix[rowLoc][colLoc];
            const cell = makeCell("", "matrix-cell");
            cell.setAttribute("data-from", rowLoc);
            cell.setAttribute("data-to", colLoc);
            if (km != null) {
                cell.setAttribute("data-km", km);
            }
            if (rowIndex === colIndex) {
                cell.classList.add("matrix-diagonal");
                cell.textContent = "—";
            } else if (rowIndex < colIndex) {
                cell.classList.add("matrix-upper");
                cell.textContent = km != null ? km : "";
            } else {
                cell.classList.add("matrix-lower");
                cell.textContent = km != null ? km : "";
            }
            fragment.appendChild(cell);
        });
    });

    // 🔧 FIX: Jeden append zamiast N — ogromna różnica przy 1000+ komórkach
    container.appendChild(fragment);
}

function makeCell(content, cls) {
    const div = document.createElement("div");
    div.className = cls;
    div.textContent = content;
    return div;
}

// ===============================
// Autocomplete dropdowns
// ===============================
let allCities = [];
function initDropdownCities(locations) {
    allCities = locations.slice();
}

const fromInput = document.getElementById("fromCity");
const toInput = document.getElementById("toCity");
const fromDropdown = document.getElementById("fromDropdown");
const toDropdown = document.getElementById("toDropdown");

function showDropdown(inputElement, dropdownElement) {
    if (!inputElement || !dropdownElement) return;
    const query = inputElement.value.toLowerCase();
    dropdownElement.innerHTML = "";
    const filtered = allCities.filter(city =>
        city.toLowerCase().includes(query)
    );
    filtered.forEach(city => {
        const item = document.createElement("div");
        item.classList.add("dropdown-item");
        item.textContent = city;
        item.onclick = () => {
            inputElement.value = city;
            dropdownElement.style.display = "none";
            updateDistanceBox();
        };
        dropdownElement.appendChild(item);
    });
    dropdownElement.style.display = filtered.length ? "block" : "none";
    dropdownElement.style.position = "absolute";
    dropdownElement.style.left = "0px";
    dropdownElement.style.top = `${inputElement.offsetHeight}px`;
}

if (fromInput && fromDropdown) {
    fromInput.addEventListener("input", () => {
        showDropdown(fromInput, fromDropdown);
    });
}
if (toInput && toDropdown) {
    toInput.addEventListener("input", () => {
        showDropdown(toInput, toDropdown);
    });
}

document.addEventListener("click", (e) => {
    if (fromDropdown && !fromDropdown.contains(e.target) && !fromInput.contains(e.target)) {
        fromDropdown.style.display = "none";
    }
    if (toDropdown && !toDropdown.contains(e.target) && !toInput.contains(e.target)) {
        toDropdown.style.display = "none";
    }
});

// ===============================
// Obliczanie dystansu KM
// ===============================
function calculateDistance(fromCity, toCity) {
    if (!fromCity || !toCity) return null;
    const cell = document.querySelector(
        `.matrix-cell[data-from="${fromCity}"][data-to="${toCity}"]`
    );
    if (!cell) return null;
    const km = cell.getAttribute("data-km");
    return km ? parseInt(km) : null;
}

function updateDistanceBox() {
    const fromCity = document.getElementById("fromCity")?.value;
    const toCity = document.getElementById("toCity")?.value;
    const km = calculateDistance(fromCity, toCity);
    const box = document.getElementById("distanceBox");
    if (!box) return;
    box.textContent = km ? `${km} km` : "— km";
}

if (fromInput) {
    fromInput.addEventListener("change", updateDistanceBox);
}
if (toInput) {
    toInput.addEventListener("change", updateDistanceBox);
}

// ===============================
// AUTO-CLEAR
// ===============================
document.addEventListener("pointerup", (e) => {
    const clickedInsideMatrix =
        e.target.closest("#matrix-container") ||
        e.target.closest("#matrix-scroll-wrapper");
    const clickedInsideDropdown =
        e.target.closest("#fromDropdown") ||
        e.target.closest("#toDropdown");
    const clickedInsideInputs =
        e.target.closest("#fromCity") ||
        e.target.closest("#toCity");
    const clickedOnHeaderOrCell =
        e.target.closest(".matrix-col-header") ||
        e.target.closest(".matrix-header") ||
        e.target.closest(".matrix-cell");

    if (clickedInsideMatrix ||
        clickedInsideDropdown ||
        clickedInsideInputs ||
        clickedOnHeaderOrCell) {
        return;
    }
    if (document.getElementById("fromCity")) document.getElementById("fromCity").value = "";
    if (document.getElementById("toCity")) document.getElementById("toCity").value = "";
    if (document.getElementById("distanceBox")) document.getElementById("distanceBox").textContent = "— km";
    clearMatrixHighlights();
});

// ===============================
// HIGHLIGHT — wiersz, kolumna, komórka + AUTO SCROLL
// ===============================
function clearMatrixHighlights() {
    document.querySelectorAll(".matrix-highlight-row").forEach(el => {
        el.classList.remove("matrix-highlight-row");
    });
    document.querySelectorAll(".matrix-highlight-col").forEach(el => {
        el.classList.remove("matrix-highlight-col");
    });
    document.querySelectorAll(".matrix-pulse").forEach(el => {
        el.classList.remove("matrix-pulse");
    });
}

function highlightMatrix(fromCity, toCity) {
    if (!fromCity || !toCity) return;
    clearMatrixHighlights();
    document.querySelectorAll(`.matrix-cell[data-from="${fromCity}"]`)
        .forEach(el => el.classList.add("matrix-highlight-row"));
    document.querySelectorAll(`.matrix-cell[data-to="${toCity}"]`)
        .forEach(el => el.classList.add("matrix-highlight-col"));
    document.querySelectorAll(`.matrix-col-header[data-city="${fromCity}"]`)
        .forEach(el => el.classList.add("matrix-highlight-row"));
    document.querySelectorAll(`.matrix-header[data-city="${toCity}"]`)
        .forEach(el => el.classList.add("matrix-highlight-col"));

    const cell = document.querySelector(
        `.matrix-cell[data-from="${fromCity}"][data-to="${toCity}"]`
    );
    if (cell) {
        cell.classList.add("matrix-pulse");
        const wrapper = document.getElementById("matrix-scroll-wrapper");
        if (wrapper) {
            const rect = cell.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();
            const offsetX = rect.left - wrapperRect.left - wrapper.clientWidth / 2 + rect.width / 2;
            const offsetY = rect.top - wrapperRect.top - wrapper.clientHeight / 2 + rect.height / 2;
            wrapper.scrollBy({
                top: offsetY,
                left: offsetX,
                behavior: "smooth"
            });
        }
    }
}

const _oldUpdateDistanceBox = updateDistanceBox;
updateDistanceBox = function () {
    _oldUpdateDistanceBox();
    const fromCity = document.getElementById("fromCity")?.value;
    const toCity = document.getElementById("toCity")?.value;
    highlightMatrix(fromCity, toCity);
};

// ===============================
// KLIK W MIASTO / NAGŁÓWEK = HIGHLIGHT
// ===============================
function initHeaderClickHighlights() {
    const rowHeaders = document.querySelectorAll(".matrix-col-header");
    const colHeaders = document.querySelectorAll(".matrix-header");
    const events = ["touchend", "pointerup", "click"];

    rowHeaders.forEach(header => {
        events.forEach(ev => {
            header.addEventListener(ev, (e) => {
                e.stopPropagation();
                const city = header.dataset.city;
                if (!city) return;
                clearMatrixHighlights();
                document.querySelectorAll(`.matrix-cell[data-from="${city}"]`)
                    .forEach(el => el.classList.add("matrix-highlight-row"));
                header.classList.add("matrix-highlight-row");
            }, { passive: true });
        });
    });

    colHeaders.forEach(header => {
        events.forEach(ev => {
            header.addEventListener(ev, (e) => {
                e.stopPropagation();
                const city = header.dataset.city;
                if (!city) return;
                clearMatrixHighlights();
                document.querySelectorAll(`.matrix-cell[data-to="${city}"]`)
                    .forEach(el => el.classList.add("matrix-highlight-col"));
                header.classList.add("matrix-highlight-col");
            }, { passive: true });
        });
    });
}

// ===============================
// LAST UPDATE — bieżąca data
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("matrix-last-update");
    if (!el) return;
    const today = new Date();
    const formatted = today.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
    el.textContent = `LAST UPDATE ${formatted}`;
});