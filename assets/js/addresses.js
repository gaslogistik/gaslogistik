/* ============================================================
ADDRESSES MODULE — PREMIUM, STABLE, WYŁĄCZNIE Z ARKUSZA POINTS
============================================================ */

/*
  ⭐ PRAWIDŁOWY ENDPOINT Z KOD.GS ⭐
  getAddressesData() → { points: [...] }

  🔧 AKTUALIZACJA:
  Strona Addresses pobiera teraz dane tylko z arkusza POINTS.
  Matrix pozostaje na CITIES + RELATIONS.
*/
const ADDRESSES_API_URL =
    "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec?action=getaddressesdata";

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

        /*
          🔧 AKTUALIZACJA:
          Pobieramy dane z POINTS.
          Backend zwraca points, ale zostawiamy fallback na cities,
          bo cities w tym endpoincie również pochodzi z POINTS.
        */
        const cities = Array.isArray(data.points)
            ? data.points
            : (Array.isArray(data.cities) ? data.cities : []);

        /*
          🔧 FIX: PEŁNA lista danych z POINTS.
          Jest ustawiana TYLKO tutaj i NIGDY nie jest nadpisywana
          przez filtry — dzięki temu zmiana typu działa zawsze,
          wielokrotnie, bez odświeżania strony.
        */
        allCitiesData = cities.slice();

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
        console.error("POINTS API ERROR:", err);
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
SEKCJA 1 — GASLOGISTIK DELIVERY LOCATIONS (POINTS)
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
SEKCJA 3 — ALL ADDRESSES (POINTS)
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

        const coords = (lat !== "—" && lng !== "—")
            ? `${lat},${lng}`
            : "—";

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

                /* 🔧 NOWE: przekazujemy przycisk, żeby tooltip wiedział gdzie się pokazać */
                handleCoordsAction(c, action, target);
            }
        });

        listEl.appendChild(row);
    });
}

/* ============================================================
COORDS ACTIONS + 🔧 NOWE: TOOLTIP "OK!" PO SKOPIOWANIU
============================================================ */

function handleCoordsAction(coords, action, btn) {
    if (!coords || coords === "—") return;

    if (action === "maps") {
        const url = `https://www.google.com/maps?q=${encodeURIComponent(coords)}`;
        window.open(url, "_blank");
    } else if (action === "copy") {
        copyCoordsWithFeedback(coords, btn);
    }
}

/*
  🔧 NOWE:
  Kopiowanie współrzędnych z potwierdzeniem dla użytkownika.
  - navigator.clipboard (nowoczesne przeglądarki),
  - fallback execCommand (starsze przeglądarki / brak uprawnień),
  - po sukcesie zielony tooltip "OK!" nad przyciskiem,
  - po niepowodzeniu czerwony tooltip "ERROR!".
*/
async function copyCoordsWithFeedback(coords, btn) {
    let ok = false;

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(coords);
            ok = true;
        } else {
            ok = legacyCopy(coords);
        }
    } catch (err) {
        ok = legacyCopy(coords);
    }

    showCopyFeedback(btn, ok);
}

/* Awaryjne kopiowanie, gdy clipboard API niedostępne */
function legacyCopy(text) {
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const success = document.execCommand("copy");
        document.body.removeChild(ta);
        return success;
    } catch (e) {
        return false;
    }
}

/* Style tooltipa wstrzykiwane raz (nie dotykamy plików CSS) */
function injectCopyTooltipStyles() {
    if (document.getElementById("addr-copy-tooltip-styles")) return;

    const style = document.createElement("style");
    style.id = "addr-copy-tooltip-styles";
    style.innerHTML = `
    .addr-copy-tooltip {
      position: fixed;
      z-index: 99999;
      transform: translate(-50%, -100%);
      background: #009A44;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.4px;
      padding: 5px 12px;
      border-radius: 999px;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
      pointer-events: none;
      opacity: 0;
      margin-top: 0;
      transition: opacity 0.15s ease, margin-top 0.15s ease;
      font-family: inherit;
      white-space: nowrap;
    }
    .addr-copy-tooltip.visible {
      opacity: 1;
      margin-top: -6px;
    }
  `;
    document.head.appendChild(style);
}

/* Pokazuje mały tooltip "OK!" / "ERROR!" nad klikniętym przyciskiem */
let copyTooltipEl = null;
let copyTooltipTimer = null;

function showCopyFeedback(btn, ok = true) {
    if (!btn) return;

    injectCopyTooltipStyles();

    if (!copyTooltipEl) {
        copyTooltipEl = document.createElement("div");
        copyTooltipEl.className = "addr-copy-tooltip";
        document.body.appendChild(copyTooltipEl);
    }

    const rect = btn.getBoundingClientRect();

    copyTooltipEl.textContent = ok ? "OK!" : "ERROR!";
    copyTooltipEl.style.background = ok ? "#009A44" : "#ff4d4d";
    copyTooltipEl.style.left = (rect.left + rect.width / 2) + "px";
    copyTooltipEl.style.top = (rect.top - 6) + "px";

    /* restart animacji */
    copyTooltipEl.classList.remove("visible");
    void copyTooltipEl.offsetWidth;
    copyTooltipEl.classList.add("visible");

    if (copyTooltipTimer) clearTimeout(copyTooltipTimer);
    copyTooltipTimer = setTimeout(() => {
        if (copyTooltipEl) copyTooltipEl.classList.remove("visible");
    }, 1200);
}

/* ============================================================
SEKCJA 2 — SEARCH + TYPE FILTER (POINTS)
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

/* =========================
SEARCH NORMALIZATION (PL / DE)
🔧 NOWE — IDENTYCZNIE JAK W MAP.JS:
Wyszukiwanie "bez ogonków" — polskie znaki diakrytyczne
i niemieckie litery są normalizowane po obu stronach
(zapytanie I dane), więc:
  Kłobuczyn    -> klobuczyn
  kąty         -> katy
  Straße       -> strasse
  Fürstenwalde -> furstenwalde
========================= */

function normalizeSearchText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/ß/g, "ss")   // niemieckie ß -> ss
        .replace(/ł/g, "l")    // polskie ł (NFD go nie rozbija)
        .normalize("NFD")      // rozkład znaków (ą -> a + ogonek, ä -> a + kropki itd.)
        .replace(/[\u0300-\u036f]/g, "") // usuwamy znaki diakrytyczne
        .replace(/[^a-z0-9]+/g, " ")     // tylko litery i cyfry
        .replace(/\s+/g, " ")
        .trim();
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
        /* 🔧 NOWE: zapytanie normalizowane (bez PL/DE znaków) */
        const q = normalizeSearchText(input.value);

        clearSuggestions();
        clearHighlight();

        if (!q) return;

        const matches = citiesSearchIndex
            .filter(item => {
                /* 🔧 NOWE: haystack też normalizowany — LOCATION+TYPE+COUNTRY+ADDRESS */
                const haystack = normalizeSearchText(
                    item.location +
                    " " +
                    item.type +
                    " " +
                    item.country +
                    " " +
                    item.address
                );
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

🔧 AKTUALIZACJA:
Opcje dropdowna są BUDOWANE DYNAMICZNIE z kolumny TYPE (POINTS).

🔧 FIX (NAPRAWA WIELOKROTNEGO FILTROWANIA):
Filtry liczą ZAWSZE od pełnej listy allCitiesData,
a NIE od citiesCache (które renderAddressesList nadpisuje
przefiltrowaną listą). Dzięki temu można zmieniać typ
dowolną liczbę razy bez odświeżania strony.
============================================================ */

let typeFilterBound = false;

/* 🔧 FIX: PEŁNA lista z POINTS — nigdy nienadpisywana przez filtry */
let allCitiesData = [];

/* 🔧 NOWE: dynamiczna lista typów z kolumny TYPE */
function buildTypeDropdownOptions(typeDropdown, cities) {
    const typesSet = new Set(); // Set zachowuje kolejność pojawiania się

    cities.forEach(c => {
        const t = String(safeGet(c, "TYPE", "")).trim();
        if (t) typesSet.add(t);
    });

    typeDropdown.innerHTML = "";

    const allLi = document.createElement("li");
    allLi.setAttribute("data-value", "");
    allLi.textContent = "TYPE: ALL";
    typeDropdown.appendChild(allLi);

    typesSet.forEach(t => {
        const li = document.createElement("li");
        li.setAttribute("data-value", t);
        li.textContent = t;
        typeDropdown.appendChild(li);
    });
}

function initTypeFilter(cities) {
    const typeButton = document.getElementById("adr-type-button");
    const typeDropdown = document.getElementById("adr-type-dropdown");
    const searchInput = document.getElementById("addresses-search-input");

    if (!typeButton || !typeDropdown) return;

    /* 🔧 NOWE: za każdym załadowaniem danych przebudowujemy listę typów */
    buildTypeDropdownOptions(typeDropdown, cities);

    /* Zdarzenia pinamy tylko RAZ (delegacja działa dla dynamicznych li) */
    if (typeFilterBound) return;
    typeFilterBound = true;

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

    /* 🔥 2 — WYBÓR OPCJI (delegacja zdarzeń na dropdownie) */
    typeDropdown.addEventListener("click", (e) => {
        const item = e.target.closest("li");
        if (!item || !typeDropdown.contains(item)) return;

        e.stopPropagation();

        const val = item.getAttribute("data-value");
        const label = item.textContent;

        typeButton.textContent = label;
        typeDropdown.classList.remove("visible");
        if (searchInput) searchInput.value = "";

        /* 🔧 FIX: TYPE: ALL wraca do PEŁNEJ listy */
        if (!val) {
            renderAddressesList(allCitiesData);
            return;
        }

        /* 🔧 FIX: filtr liczymy ZAWSZE od PEŁNEJ listy allCitiesData */
        const filtered = allCitiesData.filter(c => {
            const type = safeGet(c, "TYPE", "");
            return String(type).trim() === val;
        });

        renderAddressesList(filtered);
    });

    /* 🔥 3 — KLIK POZA DROPDOWNEM = RESET */
    document.addEventListener("click", () => {
        typeDropdown.classList.remove("visible");
        typeButton.textContent = "TYPE: ALL";
        if (searchInput) searchInput.value = "";
        /* 🔧 FIX: reset wraca do PEŁNEJ listy */
        renderAddressesList(allCitiesData);
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

/* ============================================================
POMOCNICZE FUNKCJE UTILS
============================================================ */

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