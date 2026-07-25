// MATRIX — FINALNA WERSJA (bez starego projektu, pełne KM, jedno API)

const MATRIX_API_URL =
    "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec?action=getMatrixData";

document.addEventListener("DOMContentLoaded", () => {
    loadMatrix();
});

// 🔥 Normalizacja nazw — klucz do pełnej macierzy
function normalize(name) {
    return String(name)
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\u00A0/g, " ")
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .toUpperCase();
}

async function loadMatrix() {
    const container = document.getElementById("matrix-container");
    if (!container) return;

    container.innerHTML = "Loading matrix...";
    container.classList.remove("matrix-grid");

    // 🔥 Pobieramy liczniki CITIES i RELATIONS z Excela
    try {
        const systemRes = await fetch(
            "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec?action=getSystemData"
        );
        const systemData = await systemRes.json();

        const citiesCount = systemData.cities?.length || 0;
        const relationsCount = systemData.relations?.length || 0;

        document.querySelector("#matrix-stats-row .matrix-stat-tile:nth-child(1)").textContent =
            `${citiesCount} CITIES`;

        document.querySelector("#matrix-stats-row .matrix-stat-tile:nth-child(2)").textContent =
            `${relationsCount} RELATIONS`;

    } catch (err) {
        console.error("Counters load error:", err);
    }

    // 🔥 Ładowanie macierzy
    try {
        const res = await fetch(MATRIX_API_URL);
        const data = await res.json();

        const relations = data.relations || [];

        const locations = getLocations(relations);
        const matrix = buildMatrixObject(locations, relations);

        renderMatrix(locations, matrix);
        initDropdownCities(locations);

        // po wyrenderowaniu podpinamy kliknięcia w nagłówki
        initHeaderClickHighlights();

    } catch (err) {
        container.innerHTML = "Error loading matrix data.";
        console.error("Matrix load error:", err);
    }
}

// 🔥 Zbieranie lokalizacji z relations
function getLocations(relations) {
    const set = new Set();
    relations.forEach(r => {
        if (r.FROM) set.add(normalize(r.FROM));
        if (r.TO) set.add(normalize(r.TO));
    });
    return Array.from(set).sort();
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

function renderMatrix(locations, matrix) {
    const container = document.getElementById("matrix-container");
    if (!container) return;

    container.innerHTML = "";
    container.classList.add("matrix-grid");

    const cols = locations.length + 1;
    container.style.setProperty("--cols", cols);

    // 🔥 JEDEN KROK — MOBILE MA SZTYWNĄ SZEROKOŚĆ - 
    // TU USTAWIAM SZEROKOSC komorek z miastami PIERWSZEJ KOLUMNY W MACIERZY
    if (window.innerWidth <= 768) {
        container.style.setProperty("--firstColWidth", `85px`);
        container.style.setProperty("--firstColFont", `9px`);
    } else {
        // DESKTOP — liczymy normalnie
        const longestName = locations.reduce((a, b) => a.length > b.length ? a : b, "");
        const width = longestName.length * 8 + 6;
        const fontSize = 12;

        container.style.setProperty("--firstColWidth", `${width}px`);
        container.style.setProperty("--firstColFont", `${fontSize}px`);
    }

    // lewy górny róg
    container.appendChild(makeCell("", "matrix-header"));

    // 🔥 MOBILE — SZTYWNA WYSOKOŚĆ NAGŁÓWKÓW (bo są obrócone o 90°)
    let headerHeight = "120px"; // desktop default

    if (window.innerWidth <= 768) {
        headerHeight = "85px";   // tu regulujesz wysokość nagłówków na mobile
    }

    // nagłówki górne
    locations.forEach(loc => {
        const header = makeCell("", "matrix-header");
        const span = document.createElement("span");
        span.textContent = loc;
        header.appendChild(span);
        header.setAttribute("data-city", loc);

        // 🔥 MOBILE — zmniejszamy wysokość nagłówków
        if (window.innerWidth <= 768) {
            header.style.height = "85px";
            header.style.minHeight = "85px";
            header.style.maxHeight = "85px";
        }

        // 🔥 DESKTOP — NIE USTAWIAMY NIC, wraca pełna wysokość
        container.appendChild(header);
    });

    // wiersze
    locations.forEach((rowLoc, rowIndex) => {
        const rowHeader = makeCell(rowLoc, "matrix-col-header");
        rowHeader.style.height = "24px";
        rowHeader.style.minHeight = "24px";
        rowHeader.style.maxHeight = "24px";
        rowHeader.style.width = `var(--firstColWidth)`;
        rowHeader.style.fontSize = `var(--firstColFont)`;
        rowHeader.style.padding = "2px";
        rowHeader.setAttribute("data-city", rowLoc);
        container.appendChild(rowHeader);

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

            container.appendChild(cell);
        });
    });
}

function makeCell(content, cls) {
    const div = document.createElement("div");
    div.className = cls;
    div.textContent = content;
    return div;
}

// ===============================
// KROK 5 — Autocomplete dropdowns
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

// ===============================
// EVENTY DROPDOWNÓW
// ===============================

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

// Ukrywanie dropdownów po kliknięciu poza nimi
document.addEventListener("click", (e) => {
    if (fromDropdown && !fromDropdown.contains(e.target) && !fromInput.contains(e.target)) {
        fromDropdown.style.display = "none";
    }
    if (toDropdown && !toDropdown.contains(e.target) && !toInput.contains(e.target)) {
        toDropdown.style.display = "none";
    }
});

// ===============================
// KROK 6 — Obliczanie dystansu KM
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

// Aktualizacja po zmianie inputów
if (fromInput) {
    fromInput.addEventListener("change", updateDistanceBox);
}
if (toInput) {
    toInput.addEventListener("change", updateDistanceBox);
}

// ===============================
// AUTO-CLEAR: kliknięcie poza matrix = reset
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

    document.getElementById("fromCity").value = "";
    document.getElementById("toCity").value = "";
    document.getElementById("distanceBox").textContent = "— km";

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

// 🔥 Podświetlanie na podstawie FROM / TO (z inputów)
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

// 🔥 Podpinamy pod updateDistanceBox (zachowujemy puls + auto-scroll)
const _oldUpdateDistanceBox = updateDistanceBox;
updateDistanceBox = function () {
    _oldUpdateDistanceBox();

    const fromCity = document.getElementById("fromCity")?.value;
    const toCity = document.getElementById("toCity")?.value;

    highlightMatrix(fromCity, toCity);
};

// ===============================
// NOWE: KLIK W MIASTO / NAGŁÓWEK = HIGHLIGHT
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
// LAST UPDATE — zawsze bieżąca data
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
