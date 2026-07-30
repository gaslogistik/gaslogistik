/* ============================================================
   ADDRESSES MODULE — PREMIUM, STABLE, WYŁĄCZNIE Z ARKUSZA CITIES
   ============================================================ */

/* ⭐ PRAWIDŁOWY ENDPOINT Z TWOJEGO KODU.GS ⭐
   getMapData() → { cities: [...] }
*/
const ADDRESSES_API_URL =
    "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec?action=getmapdata";

/* ============================================================
   MAIN LOADER
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    initAddressLoader();
    loadCitiesData();
});

/* ============================================================
   FETCH + ROUTING
   ============================================================ */

async function loadCitiesData() {
    showAddressesSpinner("Gaslogistik DATA Synchronization - Wait a moment please...");

    /* ⭐ DODAJEMY ANIMACJĘ GLOW NA START ⭐ */
    document.querySelectorAll(".addr-tile, .address-row").forEach(el => {
        el.classList.add("loading-glow");
    });

    try {
        const response = await fetch(ADDRESSES_API_URL);
        const data = await response.json();

        const cities = Array.isArray(data.cities) ? data.cities : [];

        updateAddressCounters(cities);
        renderAddressesList(cities);
        initAddressesSearch(cities);
        initTypeFilter(cities);

        /* ⭐ USUWAMY GLOW I DODAJEMY FADE-IN PO WCZYTANIU DANYCH ⭐ */
        setTimeout(() => {
            document.querySelectorAll(".addr-tile, .address-row").forEach(el => {
                el.classList.remove("loading-glow");
                el.classList.add("fade-in");
            });
        }, 400);

    } catch (err) {
        console.error("CITIES API ERROR:", err);
        showAddressesErrorState();
    } finally {
        hideAddressesSpinner();
    }
}

/* ============================================================
   SPINNER LOADER LOGIC
   ============================================================ */

function initAddressLoader() {
    window.showAddressesSpinner = function (message = "Gaslogistik DATA Synchronization - Wait a moment please...") {
        let spinner = document.getElementById("addresses-loading-spinner");
        if (!spinner) {
            spinner = document.createElement("div");
            spinner.id = "addresses-loading-spinner";
            spinner.className = "addresses-spinner-wrapper";
            spinner.innerHTML = `
                <div class="addresses-spinner-card">
                    <div class="addresses-spinner-circle"></div>
                    <p class="addresses-spinner-text" id="addresses-spinner-msg">${escapeHtml(message)}</p>
                </div>
            `;
            document.body.appendChild(spinner);
        } else {
            const msgEl = document.getElementById("addresses-spinner-msg");
            if (msgEl) msgEl.textContent = message;
            spinner.style.display = "flex";
        }
    };

    window.hideAddressesSpinner = function () {
        const spinner = document.getElementById("addresses-loading-spinner");
        if (spinner) {
            spinner.style.display = "none";
        }
    };
}

/* ============================================================
   SAFE GET
   ============================================================ */

function safeGet(obj, key, fallback = "—") {
    if (!obj || typeof obj !== "object") return fallback;
    const val = obj[key];
    return val !== undefined && val !== null && val !== "" ? val : fallback;
}

/* ============================================================
   SEKCJA 1 — GASLOGISTIK DELIVERY LOCATIONS (CITIES)
   ============================================================ */

function updateAddressCounters(cities) {
    const allowedCountries = ["BE", "NL", "DE", "UA", "PL"];

    let totalLocations = 0;
    const countrySet = new Set();
    let vigoDE = 0;
    let hubsAll = 0;

    cities.forEach(c => {
        const country = String(safeGet(c, "COUNTRY", "")).trim().toUpperCase();
        const type = String(safeGet(c, "TYPE", "")).trim();

        if (allowedCountries.includes(country)) {
            totalLocations++;
            countrySet.add(country);
        }

        if (country === "DE" && type === "Vigo FuelStation") {
            vigoDE++;
        }

        if (type.toUpperCase().includes("HUB")) {
            hubsAll++;
        }
    });

    setCounter("addr-total-locations", totalLocations);
    setCounter("addr-total-countries", countrySet.size);
    setCounter("addr-vigo-de", vigoDE);
    setCounter("addr-hubs-all", hubsAll);
}

function setCounter(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
}

/* ============================================================
   SEKCJA 3 — ALL ADDRESSES (CITIES)
   ============================================================ */

let citiesCache = [];

function renderAddressesList(cities) {
    citiesCache = cities.slice();

    const listEl = document.getElementById("addresses-list");
    if (!listEl) return;

    listEl.innerHTML = "";

    cities.forEach(c => {
        const location = safeGet(c, "LOCATION");
        const type = safeGet(c, "TYPE");
        const country = safeGet(c, "COUNTRY");
        const address = safeGet(c, "ADDRESS");
        const lat = safeGet(c, "LATITUDE");
        const lng = safeGet(c, "LONGITUDE");
        const coords = lat && lng ? `${lat},${lng}` : "—";

        const row = document.createElement("div");
        row.className = "address-row";
        row.setAttribute("data-location", location);
        row.setAttribute("data-type", type);
        row.setAttribute("data-country", country);
        row.setAttribute("data-address", address);
        row.setAttribute("data-coords", coords);

        const coordsHtml = coords !== "—"
            ? `
            <div class="address-coords-cell">
                <button class="addr-coord-btn" data-coords="${coords}" data-action="maps">Google Maps</button>
                <button class="addr-coord-btn" data-coords="${coords}" data-action="copy">Copy</button>
            </div>
        `
            : `<span>—</span>`;

        row.innerHTML = `
            <span>${location}</span>
            <span>${type}</span>
            <span>${country}</span>
            <span>${address}</span>
            ${coordsHtml}
        `;

        row.addEventListener("click", e => {
            const target = e.target;
            if (target.classList.contains("addr-coord-btn")) {
                e.stopPropagation();
                const c = target.getAttribute("data-coords") || "";
                const action = target.getAttribute("data-action");
                handleCoordsAction(c, action);
            }
        });

        listEl.appendChild(row);
    });
}

function handleCoordsAction(coords, action) {
    if (!coords || coords === "—") return;
    if (action === "maps") {
        const url = `https://www.google.com/maps?q=${encodeURIComponent(coords)}`;
        window.open(url, "_blank");
    } else if (action === "copy") {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(coords).catch(() => { });
        }
    }
}

/* ============================================================
   SEKCJA 2 — SEARCH + TYPE FILTER (CITIES)
   ============================================================ */

let citiesSearchIndex = [];

function buildCitiesSearchIndex(cities) {
    citiesSearchIndex = cities.map(c => ({
        location: safeGet(c, "LOCATION"),
        type: safeGet(c, "TYPE"),
        country: safeGet(c, "COUNTRY"),
        address: safeGet(c, "ADDRESS")
    }));
}

function initAddressesSearch(cities) {
    buildCitiesSearchIndex(cities);

    const input = document.getElementById("addresses-search-input");
    const suggestionsEl = document.getElementById("addresses-search-suggestions");

    if (!input || !suggestionsEl) return;

    function clearSuggestions() {
        suggestionsEl.innerHTML = "";
        suggestionsEl.classList.remove("adr-search-suggestions-visible");
    }

    function clearHighlight() {
        document
            .querySelectorAll(".address-row.address-highlight")
            .forEach(row => row.classList.remove("address-highlight"));
    }

    function scrollToRow(match) {
        clearHighlight();

        const selector = `.address-row[data-location="${CSS.escape(
            match.location
        )}"][data-type="${CSS.escape(match.type)}"][data-country="${CSS.escape(
            match.country
        )}"][data-address="${CSS.escape(match.address)}"]`;

        const row = document.querySelector(selector);
        if (!row) return;

        row.classList.add("address-highlight");
        row.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        clearSuggestions();
        clearHighlight();

        if (!q) return;

        const matches = citiesSearchIndex
            .filter(item => {
                const haystack = (
                    item.location +
                    " " +
                    item.type +
                    " " +
                    item.country +
                    " " +
                    item.address
                ).toLowerCase();
                return haystack.includes(q);
            })
            .slice(0, 8);

        if (!matches.length) return;

        matches.forEach(m => {
            const row = document.createElement("div");
            row.className = "adr-search-suggestion-item";

            row.innerHTML = `
                <span class="adr-search-suggestion-type">${m.type || "ADDR"}</span>
                <span class="adr-search-suggestion-main">${m.location || "—"}</span>
                <span class="adr-search-suggestion-sub">${m.country || "—"} · ${m.address || "—"}</span>
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
        ) {
            return;
        }

        input.value = "";
        clearSuggestions();
        clearHighlight();
    });
}

/* ============================================================
   PREMIUM TYPE FILTER — CUSTOM DROPDOWN
   ============================================================ */
function initTypeFilter(cities) {
    const typeButton = document.getElementById("adr-type-button");
    const typeDropdown = document.getElementById("adr-type-dropdown");
    const searchInput = document.getElementById("addresses-search-input");

    if (!typeButton || !typeDropdown) return;

    /* 🔥 1 — ROZWIJANIE DROPDOWNA + RESET ANIMACJI */
    typeButton.addEventListener("click", (e) => {
        e.stopPropagation();

        typeDropdown.querySelectorAll("li").forEach(li => {
            li.classList.remove("animate");
        });

        typeDropdown.classList.toggle("visible");

        if (typeDropdown.classList.contains("visible")) {
            typeDropdown.querySelectorAll("li").forEach(li => {
                setTimeout(() => {
                    li.classList.add("animate");
                }, 10);
            });
        }
    });

    /* 🔥 2 — WYBÓR OPCJI */
    typeDropdown.querySelectorAll("li").forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();

            const val = item.getAttribute("data-value");
            const label = item.textContent;

            typeButton.textContent = label;
            typeDropdown.classList.remove("visible");

            searchInput.value = "";

            if (!val) {
                renderAddressesList(cities);
                return;
            }

            const filtered = cities.filter(c => {
                const type = safeGet(c, "TYPE", "");
                return String(type).trim() === val;
            });

            renderAddressesList(filtered);
        });
    });

    /* 🔥 3 — KLIK POZA DROPDOWNEM = RESET */
    document.addEventListener("click", () => {
        typeDropdown.classList.remove("visible");
        typeButton.textContent = "TYPE: ALL";
        searchInput.value = "";
        renderAddressesList(cities);
    });
}

/* ============================================================
   ERROR STATE
   ============================================================ */

function showAddressesErrorState() {
    setCounter("addr-total-locations", "ERR");
    setCounter("addr-total-countries", "ERR");
    setCounter("addr-vigo-de", "ERR");
    setCounter("addr-hubs-all", "ERR");

    const listEl = document.getElementById("addresses-list");
    if (listEl) {
        listEl.innerHTML = "";
        const row = document.createElement("div");
        row.className = "address-row";
        row.innerHTML = `<span>API ERROR</span><span>—</span><span>—</span><span>—</span><span>—</span>`;
        listEl.appendChild(row);
    }
}

/* POMOCNICZE FUNKCJE UTILS */
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ============================================================
   EXPORT
   ============================================================ */

const AddressesModule = {
    loadCitiesData,
    updateAddressCounters,
    renderAddressesList,
    initAddressesSearch,
    initTypeFilter,
};

try {
    window.AddressesModule = AddressesModule;
} catch (e) { }