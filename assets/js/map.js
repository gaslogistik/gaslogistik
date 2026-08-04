/* =========================
LIVE MAP — JS (PREMIUM DROPDOWN VERSION)
========================= */

let map;
let markers = [];
let highlightCircle = null;
let locationsData = [];
let autocompleteDropdown;

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
LOAD DATA
========================= */

async function loadMapData() {
    try {
        const url =
            "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec?action=getmapdata";

        const res = await fetch(url);
        const json = await res.json();

        /*
          🔧 AKTUALIZACJA:
          Dane są teraz pobierane z arkusza POINTS.
          Backend zwraca points, ale dla bezpieczeństwa zostawiamy fallback na cities.
        */
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
        updateStatus(locationsData);
        populateCustomDropdowns(locationsData);

        /* =========================
           USTAWIAMY DOMYŚLNE WARTOŚCI FILTRÓW
           ========================= */
        document.querySelector("#filter-country-dropdown .live-map-filter-selected").textContent = "ALL";
        document.querySelector("#filter-type-dropdown .live-map-filter-selected").textContent = "ALL";

        /* =========================
           WYMUSZAMY DOMYŚLNE FILTROWANIE
           ========================= */
        applyFilters();

    } catch (err) {
        console.error("MAP API ERROR:", err);
        document.getElementById("map-status").textContent = "MAP STATUS: ERROR";
    }
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

function updateStatus(data) {
    const countries = new Set(data.map(l => l.country));
    const types = new Set(data.map(l => l.type));
    const pointsCount = data.filter(l => l.source === "point").length;

    document.getElementById("map-status").textContent = "MAP STATUS: READY";
    document.getElementById("map-countries").textContent = `COUNTRIES: ${countries.size}`;
    document.getElementById("map-types").textContent = `TYPES: ${types.size}`;

    /*
      🔧 AKTUALIZACJA:
      ID elementu zostaje bez zmian: map-cities.
      Zmieniamy tylko wyświetlany tekst na POINTS, aby nie dotykać CSS/layoutu.
    */
    document.getElementById("map-cities").textContent = `POINTS: ${pointsCount}`;
}

/* =========================
CUSTOM DROPDOWN — POPULATE
========================= */

function populateCustomDropdowns(data) {
    const countryList = document.getElementById("filter-country-list");
    const typeList = document.getElementById("filter-type-list");

    /* =========================
       USUWAMY N/A oraz ADDRESS
       ========================= */
    const rawCountries = [...new Set(data.map(l => l.country))];
    const rawTypes = [...new Set(data.map(l => l.type))];

    const countries = ["ALL", ...rawCountries.filter(c => c !== "N/A")];
    const types = ["ALL", ...rawTypes.filter(t => t !== "Address")];

    /* =========================
       GENEROWANIE OPCJI
       ========================= */
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

/* =========================
DROPDOWN — OPEN/CLOSE
========================= */

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
    updateStatus(filtered);
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
🔧 NOWE:
Wyszukiwanie "bez ogonków" — polskie znaki diakrytyczne
i niemieckie litery są normalizowane po obu stronach
(zapytanie AND dane), więc:
  Kłobuczyn  -> klobuczyn
  kąty       -> katy
  Straße     -> strasse
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

/* =========================
SEARCH + GO TO LOCATION
🔧 AKTUALIZACJA:
Wyszukiwarka sprawdza teraz LOCATION **oraz** ADDRESS,
z normalizacją PL/DE (można pisać bez ogonków).
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
🔧 AKTUALIZACJA:
Autocomplete również szuka po LOCATION **oraz** ADDRESS,
z normalizacją PL/DE (bez polskich i niemieckich znaków).
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

        /*
          🔧 AKTUALIZACJA:
          Autocomplete używa danych z POINTS (source = "point"),
          dopasowanie po nazwie LUB adresie, z normalizacją PL/DE.
        */
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

    // NIE resetujemy, jeśli kliknięto w dropdown filtrów
    if (clickedInsideFilterDropdown) return;

    // NIE resetujemy, jeśli kliknięto w wyszukiwarkę
    if (clickedInsideSearch) return;

    // NIE resetujemy, jeśli kliknięto w autocomplete
    if (clickedInsideAutocomplete) return;

    // NIE resetujemy, jeśli kliknięto na mapę (map.on('click') obsługuje to osobno)
    if (clickedInsideMap) return;

    /* =========================
       1. RESET MAPY DO WIDOKU STARTOWEGO
       ========================= */
    map.setView([52.1, 11.6], 6);

    /* =========================
       2. POKAŻ WSZYSTKIE LOKALIZACJE
       ========================= */
    renderMarkers(locationsData);
    updateStatus(locationsData);

    /* =========================
       3. WYCZYŚĆ SEARCH LOCATION
       ========================= */
    const searchInput = document.getElementById("location-search");
    searchInput.value = "";

    /* =========================
       4. ZAMKNIJ AUTOCOMPLETE
       ========================= */
    if (autocompleteDropdown) {
        autocompleteDropdown.style.display = "none";
    }

    /* =========================
       5. USUŃ HTML HIGHLIGHT
       ========================= */
    const htmlHighlight = document.querySelector(".location-highlight");
    if (htmlHighlight) htmlHighlight.remove();

    /* =========================
       6. USUŃ LEAFLET CIRCLE
       ========================= */
    if (highlightCircle) {
        map.removeLayer(highlightCircle);
        highlightCircle = null;
    }

    /* =========================
       7. ZAMKNIJ POPUPY MARKERÓW
       ========================= */
    markers.forEach(m => {
        if (m.marker && m.marker.closePopup) {
            m.marker.closePopup();
        }
    });

    /* =========================
       8. ZAMKNIJ DROPDOWNY FILTRÓW
       ========================= */
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