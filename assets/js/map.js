/* =========================
LIVE MAP — JS (PREMIUM DROPDOWN VERSION)
v2 2026-08-13: + cache klienta (localStorage) + retry x3 + fallback na stare dane
(te same poduszki co matrix.js — koniec porannych "MAP STATUS: ERROR")
========================= */
let map;
let markers = [];
let highlightCircle = null;
let locationsData = [];
let autocompleteDropdown;
/* 🔧 FIX 2026-08-13: cache klienta + retry */
const MAP_URL = "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec?action=getmapdata";
const MAP_CACHE_KEY = "kp_map_cache";
const MAP_CACHE_TIME_KEY = "kp_map_cache_time";
const MAP_CACHE_TTL = 10 * 60 * 1000; // 10 minut
/* =========================
INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
    initMap();
    loadMapData();
    setupSearch();
    setupAutocompleteDropdown();
    setupCustomDropdowns();
});
/* =========================
LEAFLET MAP
========================= */
function initMap() {
    map = L.map("live-map", {
        zoomControl: true
    }).setView([52.1, 11.6], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap"
    }).addTo(map);
}
/* =========================
🔧 CACHE KLIENTA + FETCH Z RETRY
========================= */
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
function getStaleData(key) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) return JSON.parse(cached);
    } catch (e) { }
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
async function fetchJsonWithRetry(url, attempts) {
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const ct = res.headers.get("content-type") || "";
            if (!ct.includes("application/json")) {
                const text = await res.text();
                throw new Error("Non-JSON response (Google cold start?): " + text.substring(0, 120));
            }
            return await res.json();
        } catch (e) {
            lastErr = e;
            console.warn("[MAP] fetch attempt " + (i + 1) + "/" + attempts + " failed: " + e.message);
            if (i < attempts - 1) await new Promise(r => setTimeout(r, 1500));
        }
    }
    throw lastErr;
}
/* =========================
LOAD DATA (cache-first + retry + stale fallback)
========================= */
async function loadMapData(forceRefresh) {
    if (!forceRefresh) {
        const cached = getCachedData(MAP_CACHE_KEY, MAP_CACHE_TIME_KEY, MAP_CACHE_TTL);
        if (cached) {
            console.log("[MAP] CACHE HIT — render z localStorage");
            applyMapData(cached, true);
            setTimeout(() => silentRefreshMap(), 150);
            return;
        }
    }
    try {
        const json = await fetchJsonWithRetry(MAP_URL, 3);
        setCachedData(MAP_CACHE_KEY, MAP_CACHE_TIME_KEY, json);
        applyMapData(json, false);
    } catch (err) {
        console.error("MAP API ERROR:", err);
        const stale = getStaleData(MAP_CACHE_KEY);
        if (stale) {
            console.warn("[MAP] wszystkie próby nieudane — render ze STARYCH danych");
            applyMapData(stale, true);
        } else {
            document.getElementById("map-status").textContent = "MAP STATUS: ERROR";
        }
    }
}
async function silentRefreshMap() {
    try {
        const json = await fetchJsonWithRetry(MAP_URL, 2);
        setCachedData(MAP_CACHE_KEY, MAP_CACHE_TIME_KEY, json);
        applyMapData(json, false);
        console.log("[MAP] silent refresh OK");
    } catch (e) {
        console.warn("[MAP] silent refresh failed:", e.message);
    }
}
function applyMapData(json, fromCache) {
    const points = json.points || json.cities || [];
    const addresses = json.addresses || [];
    locationsData = [
        ...points.map(c => ({
            name: c.LOCATION,
            type: c.TYPE,
            country: c.COUNTRY,
            lat: Number(c.LATITUDE),
            lng: Number(c.LONGITUDE),
            address: c.ADDRESS,
            source: "point"
        })),
        ...addresses.map(a => ({
            name: a.LOCATION,
            type: "Address",
            country: "N/A",
            lat: Number(a.LATITUDE),
            lng: Number(a.LONGITUDE),
            address: a.ADDRESS,
            source: "address"
        }))
    ];
    renderMarkers(locationsData);
    updateStatus(locationsData, fromCache);
    populateCustomDropdowns(locationsData);
    document.querySelector("#filter-country-dropdown .live-map-filter-selected").textContent = "ALL";
    document.querySelector("#filter-type-dropdown .live-map-filter-selected").textContent = "ALL";
    applyFilters();
}
/* =========================
RENDER MARKERS
========================= */
function renderMarkers(data) {
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
    data.forEach(loc => {
        const marker = L.marker([loc.lat, loc.lng]).addTo(map);
        marker.bindPopup(`
  <strong>${loc.name}</strong><br>
  ${loc.type}<br>
  ${loc.country}<br>
  <small>${loc.address || ""}</small>
`);
        marker.on("click", () => {
            marker.openPopup();
            highlightLocation(loc);
            animatedHighlight(loc);
        });
        markers.push({ marker, loc });
    });
}
/* =========================
STATUS COUNTERS
========================= */
function updateStatus(data, fromCache) {
    const countries = new Set(data.map(l => l.country));
    const types = new Set(data.map(l => l.type));
    const pointsCount = data.filter(l => l.source === "point").length;
    document.getElementById("map-status").textContent = fromCache ? "MAP STATUS: READY (CACHED)" : "MAP STATUS: READY";
    document.getElementById("map-countries").textContent = `COUNTRIES: ${countries.size}`;
    document.getElementById("map-types").textContent = `TYPES: ${types.size}`;
    document.getElementById("map-cities").textContent = `POINTS: ${pointsCount}`;
}
/* =========================
CUSTOM DROPDOWN — POPULATE (🔧 FIX: czyszczenie list przed populate)
========================= */
function populateCustomDropdowns(data) {
    const countryList = document.getElementById("filter-country-list");
    const typeList = document.getElementById("filter-type-list");
    countryList.innerHTML = "";
    typeList.innerHTML = "";
    const rawCountries = [...new Set(data.map(l => l.country))];
    const rawTypes = [...new Set(data.map(l => l.type))];
    const countries = ["ALL", ...rawCountries.filter(c => c !== "N/A")];
    const types = ["ALL", ...rawTypes.filter(t => t !== "Address")];
    countries.forEach(c => {
        const opt = document.createElement("div");
        opt.className = "live-map-filter-option";
        opt.textContent = c;
        opt.dataset.value = c;
        countryList.appendChild(opt);
    });
    types.forEach(t => {
        const opt = document.createElement("div");
        opt.className = "live-map-filter-option";
        opt.textContent = t;
        opt.dataset.value = t;
        typeList.appendChild(opt);
    });
}
/* =========================
CUSTOM DROPDOWN — SETUP
========================= */
function setupCustomDropdowns() {
    const selectedCountry = document.querySelector("#filter-country-dropdown .live-map-filter-selected");
    const selectedType = document.querySelector("#filter-type-dropdown .live-map-filter-selected");
    const listCountry = document.getElementById("filter-country-list");
    const listType = document.getElementById("filter-type-list");
    selectedCountry.addEventListener("click", () => toggleDropdown(listCountry, selectedCountry));
    selectedType.addEventListener("click", () => toggleDropdown(listType, selectedType));
    listCountry.addEventListener("click", e => {
        if (e.target.classList.contains("live-map-filter-option")) {
            selectedCountry.textContent = e.target.dataset.value;
            closeDropdown(listCountry, selectedCountry);
            applyFilters();
        }
    });
    listType.addEventListener("click", e => {
        if (e.target.classList.contains("live-map-filter-option")) {
            selectedType.textContent = e.target.dataset.value;
            closeDropdown(listType, selectedType);
            applyFilters();
        }
    });
}
function toggleDropdown(list, selected) {
    const isOpen = list.style.display === "block";
    document.querySelectorAll(".live-map-filter-list").forEach(l => (l.style.display = "none"));
    document.querySelectorAll(".live-map-filter-selected").forEach(s => s.classList.remove("active"));
    if (!isOpen) {
        list.style.display = "block";
        selected.classList.add("active");
    }
}
function closeDropdown(list, selected) {
    list.style.display = "none";
    selected.classList.remove("active");
}
/* =========================
APPLY FILTERS
========================= */
function applyFilters() {
    const country = document.querySelector("#filter-country-dropdown .live-map-filter-selected").textContent;
    const type = document.querySelector("#filter-type-dropdown .live-map-filter-selected").textContent;
    const filtered = locationsData.filter(loc => {
        const countryOk = (country === "ALL" || loc.country === country);
        const typeOk = (type === "ALL" || loc.type === type);
        return countryOk && typeOk;
    });
    renderMarkers(filtered);
    updateStatus(filtered, false);
}
/* =========================
HIGHLIGHTS
========================= */
function highlightLocation(loc) {
    if (highlightCircle) {
        map.removeLayer(highlightCircle);
    }
    highlightCircle = L.circle([loc.lat, loc.lng], {
        radius: 5000,
        color: "#ff2a6d",
        weight: 2,
        fillColor: "#ff2a6d",
        fillOpacity: 0.15
    }).addTo(map);
}
function animatedHighlight(loc) {
    const mapContainer = document.getElementById("live-map");
    const old = document.querySelector(".location-highlight");
    if (old) old.remove();
    const hl = document.createElement("div");
    hl.className = "location-highlight";
    mapContainer.appendChild(hl);
    const point = map.latLngToContainerPoint([loc.lat, loc.lng]);
    hl.style.left = point.x + "px";
    hl.style.top = point.y + "px";
    setTimeout(() => hl.remove(), 2200);
}
/* =========================
SEARCH NORMALIZATION (PL / DE)
========================= */
function normalizeSearchText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/ß/g, "ss")
        .replace(/ł/g, "l")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
/* =========================
SEARCH + GO TO LOCATION
========================= */
function setupSearch() {
    const input = document.getElementById("location-search");
    const btn = document.getElementById("go-to-location");
    btn.addEventListener("click", () => {
        const query = normalizeSearchText(input.value);
        if (!query) return;
        const match = locationsData.find(loc =>
            normalizeSearchText(loc.name).includes(query) ||
            normalizeSearchText(loc.address).includes(query)
        );
        if (match) {
            goToLocation(match);
        }
    });
}
function goToLocation(loc) {
    map.flyTo([loc.lat, loc.lng], 10, {
        animate: true,
        duration: 1.2,
        easeLinearity: 0.25
    });
    highlightLocation(loc);
    animatedHighlight(loc);
    const m = markers.find(m => m.loc === loc);
    if (m) m.marker.openPopup();
}
/* =========================
AUTOCOMPLETE DROPDOWN
========================= */
function setupAutocompleteDropdown() {
    const input = document.getElementById("location-search");
    const parent = input.parentElement;
    autocompleteDropdown = document.createElement("div");
    autocompleteDropdown.className = "live-map-dropdown";
    autocompleteDropdown.style.display = "none";
    parent.appendChild(autocompleteDropdown);
    input.addEventListener("input", () => {
        const query = normalizeSearchText(input.value);
        if (!query) {
            autocompleteDropdown.style.display = "none";
            return;
        }
        const matches = locationsData.filter(loc =>
            loc.source === "point" &&
            (normalizeSearchText(loc.name).includes(query) ||
                normalizeSearchText(loc.address).includes(query))
        );
        renderAutocomplete(matches);
    });
}
function renderAutocomplete(matches) {
    autocompleteDropdown.innerHTML = "";
    const unique = [];
    const seen = new Set();
    matches.forEach(loc => {
        if (!seen.has(loc.name)) {
            seen.add(loc.name);
            unique.push(loc);
        }
    });
    if (!unique.length) {
        autocompleteDropdown.style.display = "none";
        return;
    }
    unique.forEach(loc => {
        const item = document.createElement("div");
        item.className = "live-map-dropdown-item";
        item.textContent = loc.name;
        item.addEventListener("click", () => {
            document.getElementById("location-search").value = loc.name;
            autocompleteDropdown.style.display = "none";
            goToLocation(loc);
        });
        autocompleteDropdown.appendChild(item);
    });
    autocompleteDropdown.style.display = "block";
}
/* =========================
GLOBAL CLICK — RESET MAP + CLEAR SEARCH + CLOSE EVERYTHING
========================= */
document.addEventListener("click", e => {
    const clickedInsideFilterDropdown = e.target.closest(".live-map-filter-dropdown");
    const clickedInsideSearch = e.target.closest(".live-map-search");
    const clickedInsideAutocomplete = e.target.closest(".live-map-dropdown");
    const clickedInsideMap = e.target.closest("#live-map");
    if (clickedInsideFilterDropdown) return;
    if (clickedInsideSearch) return;
    if (clickedInsideAutocomplete) return;
    if (clickedInsideMap) return;
    map.setView([52.1, 11.6], 6);
    renderMarkers(locationsData);
    updateStatus(locationsData, false);
    const searchInput = document.getElementById("location-search");
    searchInput.value = "";
    if (autocompleteDropdown) {
        autocompleteDropdown.style.display = "none";
    }
    const htmlHighlight = document.querySelector(".location-highlight");
    if (htmlHighlight) htmlHighlight.remove();
    if (highlightCircle) {
        map.removeLayer(highlightCircle);
        highlightCircle = null;
    }
    markers.forEach(m => {
        if (m.marker && m.marker.closePopup) {
            m.marker.closePopup();
        }
    });
    document.querySelectorAll(".live-map-filter-list").forEach(list => {
        list.style.display = "none";
    });
    document.querySelectorAll(".live-map-filter-selected").forEach(sel => {
        sel.classList.remove("active");
    });
});
/* =========================
WINDOW RESIZE — FIX HIGHLIGHT POSITION
========================= */
window.addEventListener("resize", () => {
    const hl = document.querySelector(".location-highlight");
    if (!hl) return;
    const name = document.getElementById("location-search").value.trim();
    if (!name) return;
    const loc = locationsData.find(l => l.name === name);
    if (!loc) return;
    const point = map.latLngToContainerPoint([loc.lat, loc.lng]);
    hl.style.left = point.x + "px";
    hl.style.top = point.y + "px";
});
/* =========================
MAP CLICK — CLOSE AUTOCOMPLETE
========================= */
document.addEventListener("DOMContentLoaded", () => {
    map.on("click", () => {
        if (autocompleteDropdown) {
            autocompleteDropdown.style.display = "none";
        }
    });
});
