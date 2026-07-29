import { openModalWithContent } from './modal.js';

let debounceTimeout = null;
let currentSelectedIndex = -1;

/**
 * Inicjalizuje globalną wyszukiwarkę (Global Search Live Dropdown) w panelu admina.
 * @param {Function} getSearchDataCallback - Funkcja zwracająca cały globalState (z docs i drive).
 */
export function initAdminSearch(getSearchDataCallback) {
    const searchInput = document.getElementById('admin-search-input');
    const clearBtn = document.querySelector('.search-clear-btn');

    if (!searchInput) return;

    // Tworzenie lub pobranie kontenera dropdown na wyniki
    let dropdown = document.querySelector('.search-results-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'search-results-dropdown';
        searchInput.parentElement.appendChild(dropdown);
    }

    // Obsługa wpisywania tekstu z debouncem
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();

        clearTimeout(debounceTimeout);
        currentSelectedIndex = -1;

        if (query.length < 2) {
            hideDropdown(dropdown);
            return;
        }

        showLoadingState(dropdown);

        debounceTimeout = setTimeout(() => {
            const globalState = getSearchDataCallback();
            const results = performGlobalSearch(query.toLowerCase(), globalState);
            renderDropdownResults(dropdown, query, results);
        }, 250);
    });

    // Nawigacja klawiaturą (Góra / Dół / Enter / Escape)
    searchInput.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.search-result-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (items.length === 0) return;
            currentSelectedIndex = (currentSelectedIndex + 1) % items.length;
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (items.length === 0) return;
            currentSelectedIndex = (currentSelectedIndex - 1 + items.length) % items.length;
            updateSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentSelectedIndex >= 0 && items[currentSelectedIndex]) {
                items[currentSelectedIndex].click();
            }
        } else if (e.key === 'Escape') {
            searchInput.value = '';
            hideDropdown(dropdown);
        }
    });

    // Obsługa czyszczenia pola wyszukiwania
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            hideDropdown(dropdown);
            searchInput.focus();
        });
    }

    // Zamknięcie dropdownu po kliknięciu poza obszarem wyszukiwarki
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            hideDropdown(dropdown);
        }
    });

    // Ponowne pokazanie wyników przy powrocie do inputa
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length >= 2 && dropdown.children.length > 0) {
            dropdown.style.display = 'block';
        }
    });
}

/**
 * Aktualizuje klasę .selected dla elementu wskazywanego przez klawiaturę
 */
function updateSelection(items) {
    items.forEach((item, idx) => {
        if (idx === currentSelectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            item.classList.remove('selected');
        }
    });
}

/**
 * Pokazuje stan ładowania w rozwijanej liście
 */
function showLoadingState(dropdown) {
    dropdown.innerHTML = `
        <div class="search-loading-state">
            <div class="search-spinner"></div>
            <span>Przeszukiwanie bazy danych i Google Drive...</span>
        </div>`;
    dropdown.style.display = 'block';
}

/**
 * Ukrywa rozwijaną listę
 */
function hideDropdown(dropdown) {
    if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    }
}

/**
 * Przeszukuje dane z obu API (Google Sheets/Docs oraz Google Drive)
 */
function performGlobalSearch(query, globalState) {
    if (!globalState) return { sheetResults: [], driveResults: [] };

    const sheetResults = [];
    const driveResults = [];

    // 1. WYSZUKIWANIE W GOOGLE DOCS / SHEETS API
    if (globalState.docs) {
        searchInObjectOrArray(globalState.docs, query, sheetResults, 'Arkusz', 'Sheet');
    }

    // 2. WYSZUKIWANIE W GOOGLE DRIVE API
    if (globalState.drive) {
        searchInObjectOrArray(globalState.drive, query, driveResults, 'Dysk Drive', 'Drive');
    }

    return { sheetResults, driveResults };
}

/**
 * Przeszukiwanie obiektów/tablic z kategoryzacją
 */
function searchInObjectOrArray(data, query, results, sourceName, contextName = '') {
    if (!data) return;

    if (Array.isArray(data)) {
        data.forEach((item, index) => {
            searchInObjectOrArray(item, query, results, sourceName, contextName || `Wiersz ${index + 1}`);
        });
    } else if (typeof data === 'object') {
        const valuesString = Object.values(data)
            .filter(val => val !== null && val !== undefined)
            .map(val => (typeof val === 'object' ? JSON.stringify(val) : String(val)))
            .join(' ')
            .toLowerCase();

        if (valuesString.includes(query)) {
            const category = data.type || data.category || contextName || sourceName;
            const isPlainData = Object.values(data).some(v => typeof v !== 'object');

            if (isPlainData) {
                results.push({
                    source: sourceName,
                    category: category,
                    data: data
                });
            }
        }

        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'object' && data[key] !== null) {
                searchInObjectOrArray(data[key], query, results, sourceName, key.toUpperCase());
            }
        });
    }
}

/**
 * Renderuje podgląd wyników w rozwijanym dropdownie z podziałem na API
 */
function renderDropdownResults(dropdown, query, { sheetResults, driveResults }) {
    const totalCount = sheetResults.length + driveResults.length;

    if (totalCount === 0) {
        dropdown.innerHTML = `
            <div class="search-empty-state">
                <span>Brak wyników dla frazy "${escapeHtml(query)}"</span>
            </div>`;
        dropdown.style.display = 'block';
        return;
    }

    let html = '';

    // Sekcja 1: Wyniki z Bazy / Arkusza
    if (sheetResults.length > 0) {
        html += `
            <div class="search-result-group-title">
                <span>Baza danych (Sheets)</span>
                <span class="count-tag">${sheetResults.length}</span>
            </div>`;

        sheetResults.slice(0, 15).forEach(res => {
            const title = extractTitle(res.data);
            const sub = extractDetails(res.data);
            const badgeClass = getBadgeClassForCategory(res.category);

            html += `
                <div class="search-result-item" data-source="sheet">
                    <div class="search-item-icon">📋</div>
                    <span class="search-result-badge ${badgeClass}">${escapeHtml(res.category)}</span>
                    <span class="search-result-main">${escapeHtml(title)}</span>
                    <span class="search-result-sub">${escapeHtml(sub)}</span>
                </div>`;
        });
    }

    // Sekcja 2: Wyniki z Google Drive
    if (driveResults.length > 0) {
        html += `
            <div class="search-result-group-title">
                <span>Pliki i Foldery (Google Drive)</span>
                <span class="count-tag">${driveResults.length}</span>
            </div>`;

        driveResults.slice(0, 15).forEach(res => {
            const title = extractTitle(res.data);
            const sub = extractDetails(res.data);
            const badgeClass = res.data.mimeType?.includes('folder') ? 'badge-folder' : 'badge-drive';

            html += `
                <div class="search-result-item" data-source="drive">
                    <div class="search-item-icon">${res.data.mimeType?.includes('folder') ? '📁' : '📄'}</div>
                    <span class="search-result-badge ${badgeClass}">${escapeHtml(res.category)}</span>
                    <span class="search-result-main">${escapeHtml(title)}</span>
                    <span class="search-result-sub">${escapeHtml(sub)}</span>
                </div>`;
        });
    }

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    // Obsługa kliknięcia w poszczególny wynik
    const items = dropdown.querySelectorAll('.search-result-item');
    const allResults = [...sheetResults.slice(0, 15), ...driveResults.slice(0, 15)];

    items.forEach((itemEl, idx) => {
        itemEl.addEventListener('click', () => {
            const resData = allResults[idx];
            hideDropdown(dropdown);
            openResultModal(resData);
        });
    });
}

/**
 * Dobiera odpowiednią klasę odznaki CSS na podstawie kategorii
 */
function getBadgeClassForCategory(category) {
    const cat = String(category).toLowerCase();
    if (cat.includes('driver') || cat.includes('kierowc')) return 'badge-driver';
    if (cat.includes('truck') || cat.includes('trailer') || cat.includes('pojazd')) return 'badge-vehicle';
    return 'badge-sheet';
}

/**
 * Otwiera modal ze szczegółami wybranego wyniku
 */
function openResultModal(res) {
    const title = extractTitle(res.data);
    let detailsHtml = '<table style="width:100%; border-collapse:collapse; font-size:13px; margin-top:10px;">';

    if (typeof res.data === 'object' && res.data !== null) {
        Object.entries(res.data).forEach(([key, val]) => {
            if (typeof val !== 'object' && val !== null && val !== '') {
                detailsHtml += `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:6px; font-weight:bold; color:#ff2a6d; width:35%;">${escapeHtml(key)}:</td>
                        <td style="padding:6px; color:#222;">${escapeHtml(String(val))}</td>
                    </tr>`;
            }
        });
    }
    detailsHtml += '</table>';

    openModalWithContent(`Szczegóły: ${title}`, detailsHtml);
}

function extractTitle(item) {
    if (typeof item !== 'object' || item === null) return String(item);
    return item.NAME || item.Name || item.name || item.title || item.TITLE || item.fileName || item.ID || item.id || 'Rekord / Plik';
}

function extractDetails(item) {
    if (typeof item !== 'object' || item === null) return '';
    const entries = Object.entries(item).filter(([k, v]) => typeof v !== 'object' && v !== null && v !== '');
    if (entries.length === 0) return '';
    return entries.slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' | ');
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}