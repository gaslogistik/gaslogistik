/* ============================================================
CLOUD.JS — DRIVER FILE EXPLORER & GOOGLE DRIVE INTEGRATION
WITH SECURITY GATE (kompatybilny z auth.js)
============================================================ */
const API_URL = 'https://script.google.com/macros/s/AKfycbxWvqFwGKwKubI4HSczgf_bkXbNu0mbmaEb473C9uTUJSizO5IBez-m2wWW0TV4D-lW/exec';
const CACHE_KEY = 'kp_cloud_drive_data';
let driveData = [];
let parsedDriversData = [];
let currentModalFolder = null;
let modalFolderHistory = [];
let searchDebounceTimeout = null;
let highlightedItemId = null;
let currentModalSearchQuery = "";
let isCloudAppInitialized = false;

/* ============================================================
SECURITY GATE — sprawdza czy użytkownik jest zalogowany
Używa localStorage (tak jak auth.js)
============================================================ */
function checkCloudAuth() {
    const currentUser = localStorage.getItem('currentUser');
    const authPopup = document.getElementById('auth-popup');
    const mainWindow = document.querySelector('.main-window-area');

    if (!currentUser) {
        // Nie zalogowany - ukryj treść, pokaż popup
        if (mainWindow) mainWindow.style.display = 'none';
        if (authPopup) authPopup.style.display = 'flex';
        return false;
    } else {
        // Zalogowany - pokaż treść, ukryj popup
        if (mainWindow) mainWindow.style.display = 'block';
        if (authPopup) authPopup.style.display = 'none';
        return true;
    }
}

/* ============================================================
Nasłuchuj zmiany w localStorage (gdy auth.js zaloguje użytkownika)
============================================================ */
window.addEventListener('storage', (e) => {
    if (e.key === 'currentUser') {
        console.log('[CLOUD.JS] Wykryto zmianę currentUser w localStorage');
        if (e.newValue) {
            // Użytkownik się zalogował
            checkCloudAuth();
            if (!isCloudAppInitialized) {
                initCloudApp();
            }
        } else {
            // Użytkownik się wylogował
            location.reload();
        }
    }
});

/* ============================================================
INITIALIZATION
============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    console.log('[CLOUD.JS] DOMContentLoaded');

    // 1. Sprawdź autoryzację
    const isAuth = checkCloudAuth();

    // 2. Jeśli zalogowany, zainicjuj aplikację
    if (isAuth) {
        initCloudApp();
    } else {
        console.log('[CLOUD.JS] Nie zalogowany - czekam na logowanie...');
    }
});

function initCloudApp() {
    if (isCloudAppInitialized) return;
    isCloudAppInitialized = true;

    console.log('[CLOUD.JS] Inicjalizacja aplikacji cloud...');
    initGlobalSearch();
    initModalEvents();
    initDriversDetailsEvents();
    localStorage.removeItem(CACHE_KEY);
    showMainFullLoader('Gaslogistik File Synchronization...', '');
    fetchDriveData();
}

/* ============================================================
DATA FETCHING & PARSING
============================================================ */
async function fetchDriveData() {
    updateApiStatus('SYNCING...');
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const responseData = await response.json();

        if (responseData.files) {
            driveData = responseData.files || [];
            if (responseData.drivers && Array.isArray(responseData.drivers)) {
                parsedDriversData = parseRawDriversList(responseData.drivers);
            }
        } else if (Array.isArray(responseData)) {
            driveData = responseData;
        }

        updateCounters(driveData);
        updateFolderCards(driveData);
        updateApiStatus('ONLINE');
        updateCloudStatus('CONNECTED');
        updateLastSyncTime();
        hideMainFullLoader();

        if (currentModalFolder) renderModalContent();
        const driversModal = document.getElementById('drivers-modal');
        if (driversModal && driversModal.classList.contains('active')) {
            renderDriversTable("");
        }
    } catch (error) {
        console.error('Error fetching data from Google API:', error);
        updateApiStatus('OFFLINE');
        hideMainFullLoader();
        const tableBody = document.getElementById('drivers-table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr class="file-row"><td colspan="5" style="text-align:center; padding: 30px; color: #ff2a6d; font-weight: 700;">Connection error with Google Sheets / API.</td></tr>`;
        }
    }
}

function parseRawDriversList(rawJson) {
    return rawJson.map((row, index) => {
        const getVal = (possibleNames) => {
            if (!row || typeof row !== 'object') return " ";
            const keys = Object.keys(row);
            for (let name of possibleNames) {
                const foundKey = keys.find(k => k.trim().toLowerCase() === name.toLowerCase());
                if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
                    const val = String(row[foundKey]).trim();
                    if (val !== '' && val.toLowerCase() !== 'nan' && val.toLowerCase() !== 'null' && val.toLowerCase() !== 'undefined') {
                        return row[foundKey];
                    }
                }
            }
            return " ";
        };
        const id = getVal(['id', 'nr', 'no', 'lp']) || (index + 1);
        const name = String(getVal(['name', 'driver name', 'kierowca', 'nazwisko', 'imie i nazwisko', 'imię i nazwisko', ' driver']) || 'N/A').trim();
        let phone = String(getVal(['phone', 'telefon', 'whatsapp', 'phone / whatsapp', 'nr telefonu', 'tel'])).trim();
        let email = String(getVal(['email', 'e-mail', 'mail'])).trim();
        let exp = getVal(['driving licence exp', 'exp', 'licence expiration', 'data waznosci', 'data ważności', 'expiration', 'waznosc', 'ważność', 'prawo jazdy']);
        exp = formatExcelDate(exp);
        if (!email) email = '--';
        if (!exp) exp = '--';
        if (!phone) phone = '--';
        return { id, name, phone, email, exp };
    });
}

function formatExcelDate(val) {
    if (!val || val === '--') return '--';
    if (val instanceof Date) return val.toISOString().split('T')[0];
    const strVal = String(val).trim();
    if (strVal.includes('-') || strVal.includes('.')) return strVal;
    const num = Number(val);
    if (!isNaN(num) && num > 20000) {
        const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return strVal;
}

/* ============================================================
UI RENDERING & EVENTS
============================================================ */
function initDriversDetailsEvents() {
    const triggerBtn = document.getElementById('open-drivers-details-btn');
    const closeBtn = document.getElementById('close-drivers-modal-btn');
    const modal = document.getElementById('drivers-modal');
    const searchInput = document.getElementById('drivers-search-input');

    const resetDriversSearch = () => {
        if (searchInput) searchInput.value = '';
        renderDriversTable("");
    };

    if (triggerBtn) {
        triggerBtn.addEventListener('click', () => {
            resetDriversSearch();
            if (modal) modal.classList.add('active');
        });
    }
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
            resetDriversSearch();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                resetDriversSearch();
            }
        });
    }
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderDriversTable(e.target.value.trim());
        });
    }
}

function renderDriversTable(filterQuery = "") {
    const tableBody = document.getElementById('drivers-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    const q = filterQuery.toLowerCase();

    const filtered = parsedDriversData.filter(d => {
        if (!q) return true;
        return (d.name || '').toLowerCase().includes(q) ||
            (d.phone || '').toLowerCase().includes(q) ||
            (d.email || '').toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr class="file-row"><td colspan="5" style="text-align:center; padding: 25px; color: #727a8e; font-weight: 700;">${parsedDriversData.length === 0 ? 'Loading driver data...' : 'No matching drivers found.'}</td></tr>`;
        return;
    }

    const now = new Date();
    filtered.forEach(driver => {
        const tr = document.createElement('tr');
        tr.className = 'file-row';
        let licenceBadgeHtml = '<span class="licence-badge" style="opacity: 0.5;">--</span>';

        if (driver.exp && driver.exp !== '--') {
            const expDate = new Date(driver.exp);
            if (!isNaN(expDate.getTime())) {
                const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    licenceBadgeHtml = `<span class="licence-badge expired"><i class="fa-solid fa-circle-exclamation"></i> EXPIRED (${driver.exp})</span>`;
                } else if (diffDays <= 60) {
                    licenceBadgeHtml = `<span class="licence-badge expiring"><i class="fa-solid fa-triangle-exclamation"></i> EXPIRING (${driver.exp})</span>`;
                } else {
                    licenceBadgeHtml = `<span class="licence-badge valid"><i class="fa-solid fa-circle-check"></i> VALID (${driver.exp})</span>`;
                }
            } else {
                licenceBadgeHtml = `<span class="licence-badge valid">${escapeHtml(driver.exp)}</span>`;
            }
        }

        const phoneClean = (driver.phone || '').replace(/[\s'`]/g, '');
        const phoneDisplay = escapeHtml(driver.phone).replace(/`/g, '');
        const phoneHtml = driver.phone && driver.phone !== '--' ?
            `<a href="tel:${phoneClean}" class="driver-contact-link"><i class="fa-solid fa-phone" style="color: #ff2a6d; font-size: 11px;"></i> ${phoneDisplay}</a>` :
            '<span style="color: #999;">--</span>';

        const emailHtml = driver.email && driver.email !== '--' ?
            `<a href="mailto:${driver.email}" class="driver-contact-link"><i class="fa-solid fa-envelope" style="color: #ff2a6d; font-size: 11px;"></i> ${escapeHtml(driver.email)}</a>` :
            '<span style="color: #999;">--</span>';

        tr.innerHTML = `
            <td style="text-align: center; font-weight: 800; color: #ff2a6d; white-space: nowrap;">#${escapeHtml(String(driver.id))}</td>
            <td style="font-weight: 800; color: #1a1e29;"><div class="file-name-wrapper"><i class="fa-solid fa-user-gear" style="margin-right: 10px; color: #1a1e29; font-size: 13px;"></i><span>${escapeHtml(driver.name)}</span></div></td>
            <td>${phoneHtml}</td>
            <td>${emailHtml}</td>
            <td style="text-align: center;">${licenceBadgeHtml}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function initModalEvents() {
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalOverlay = document.getElementById('cloud-modal');
    if (closeModalBtn && modalOverlay) {
        closeModalBtn.addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }
    const backBtn = document.getElementById('modal-back-btn');
    if (backBtn) backBtn.addEventListener('click', navigateBack);

    document.querySelectorAll('.folder-card').forEach(card => {
        card.addEventListener('click', () => {
            const folderKey = card.getAttribute('data-folder');
            if (folderKey) openFolderModal(folderKey);
        });
    });
}

function openFolderModal(folderPath, targetItemId = null) {
    currentModalFolder = folderPath;
    modalFolderHistory = [folderPath];
    highlightedItemId = targetItemId;
    currentModalSearchQuery = "";
    ensureModalSearchBar();
    const modal = document.getElementById('cloud-modal');
    if (modal) modal.classList.add('active');
    renderModalContent();
}

function closeModal() {
    const modal = document.getElementById('cloud-modal');
    if (modal) modal.classList.remove('active');
    highlightedItemId = null;
    currentModalSearchQuery = "";
}

function navigateBack() {
    currentModalSearchQuery = "";
    const searchInput = document.getElementById('modal-file-search-input');
    if (searchInput) searchInput.value = "";
    if (modalFolderHistory.length > 1) {
        modalFolderHistory.pop();
        currentModalFolder = modalFolderHistory[modalFolderHistory.length - 1];
        renderModalContent();
    } else {
        closeModal();
    }
}

function ensureModalSearchBar() {
    const modalHeader = document.querySelector('#cloud-modal .modal-header');
    if (!modalHeader) return;
    let searchWrapper = document.getElementById('modal-file-search-wrapper');
    if (!searchWrapper) {
        searchWrapper = document.createElement('div');
        searchWrapper.id = 'modal-file-search-wrapper';
        searchWrapper.className = 'modal-search-wrapper';
        searchWrapper.innerHTML = `<div style="position: relative; width: 100%;"><input type="text" id="modal-file-search-input" placeholder="Search folder..." style="width: 100%; padding: 8px 12px 8px 32px; border-radius: 12px; border: 1px solid #8a8a8a; background: #fff; font-size: 13px; font-weight: 600; outline: none; box-sizing: border-box;"><i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 12px; color: #888;"></i></div>`;
        modalHeader.parentNode.insertBefore(searchWrapper, modalHeader.nextSibling);
        const inputEl = document.getElementById('modal-file-search-input');
        if (inputEl) {
            inputEl.addEventListener('input', (e) => {
                currentModalSearchQuery = e.target.value.trim();
                renderModalContent();
            });
        }
    } else {
        const inputEl = document.getElementById('modal-file-search-input');
        if (inputEl) inputEl.value = currentModalSearchQuery;
    }
}

function renderModalContent() {
    const modalTitle = document.getElementById('modal-folder-name');
    const breadcrumb = document.getElementById('modal-breadcrumb');
    const tableBody = document.getElementById('modal-file-list');
    const backBtn = document.getElementById('modal-back-btn');

    if (backBtn) backBtn.style.display = 'inline-flex';
    if (modalTitle) modalTitle.textContent = (currentModalFolder || 'EXPLORER').toUpperCase();
    if (breadcrumb) breadcrumb.textContent = `gas / ${currentModalFolder || ''}`;
    if (!tableBody) return;

    tableBody.innerHTML = '';
    const targetFolderLower = (currentModalFolder || '').trim().toLowerCase();

    let currentItems = driveData.filter(item => {
        const itemPath = (item.path || '').trim().toLowerCase();
        const itemFullPath = (item.fullPath || '').trim().toLowerCase();
        const matchesFolder = (itemPath === targetFolderLower) || (itemFullPath === targetFolderLower);
        const isSystemFile = (item.name || '').toLowerCase().includes('thumbs.db') || (item.name || '').toLowerCase().includes('.ds_store');
        return matchesFolder && !isSystemFile;
    });

    if (currentModalSearchQuery) {
        const q = currentModalSearchQuery.toLowerCase();
        currentItems = currentItems.filter(item => (item.name || '').toLowerCase().includes(q));
    }

    if (currentItems.length === 0) {
        tableBody.innerHTML = `<tr class="file-row"><td colspan="4" style="text-align:center; padding: 25px; color: #727a8e; font-weight: 700;">${currentModalSearchQuery ? 'No matching files found.' : 'No files in this directory.'}</td></tr>`;
        return;
    }

    let elementToHighlight = null;
    const highlightStr = String(highlightedItemId || '').trim();
    const highlightStrLower = highlightStr.toLowerCase();

    currentItems.forEach(item => {
        const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
        const iconClass = isFolder ? 'fa-folder' : getFileIcon(item.name);
        const sizeFormatted = isFolder ? '--' : formatBytes(item.size);

        // 🔧 FIX: podgląd budowany z ID pliku (nowy skan nie zwraca pola url)
        const previewUrl = item.url || (item.id ? `https://drive.google.com/file/d/${item.id}/view` : '#');
        const downloadUrl = item.id ? `https://drive.google.com/uc?export=download&id=${item.id}` : previewUrl;

        const tr = document.createElement('tr');
        tr.className = 'file-row';

        const itemIdStr = String(item.id || '').trim();
        const itemNameStr = String(item.name || '').trim();
        const itemNameLower = itemNameStr.toLowerCase();

        const isMatch = highlightStr && (
            (itemIdStr && itemIdStr === highlightStr) ||
            (itemNameStr === highlightStr) ||
            (itemNameLower === highlightStrLower) ||
            itemNameLower.includes(highlightStrLower) ||
            highlightStrLower.includes(itemNameLower)
        );

        if (isMatch && !elementToHighlight) {
            elementToHighlight = tr;
        }

        tr.innerHTML = `
            <td><div class="file-name-wrapper"><i class="fa-solid ${iconClass}" style="margin-right: 10px; color: ${isFolder ? '#ff2a6d' : '#666'};"></i><span>${escapeHtml(item.name)}</span></div></td>
            <td><span style="font-size: 11px;">${isFolder ? 'Folder' : escapeHtml(item.path || 'gas')}</span></td>
            <td>${sizeFormatted}</td>
            <td style="text-align: right;">
                <div class="file-actions-group">
                    ${isFolder ?
                `<button class="btn-action open-sub" data-path="${escapeHtml(item.fullPath || item.name)}"><i class="fa-solid fa-folder-open"></i> Open</button>` :
                `<a href="${previewUrl}" target="_blank" class="btn-action preview-btn"><i class="fa-solid fa-eye"></i> Preview</a>
                         <a href="${downloadUrl}" download class="btn-action download"><i class="fa-solid fa-download"></i> Download</a>`
            }
                </div>
            </td>
        `;

        if (isFolder) {
            const openBtn = tr.querySelector('.open-sub');
            if (openBtn) {
                openBtn.addEventListener('click', () => {
                    const newPath = item.fullPath || item.path || item.name;
                    modalFolderHistory.push(newPath);
                    currentModalFolder = newPath;
                    currentModalSearchQuery = "";
                    const inputEl = document.getElementById('modal-file-search-input');
                    if (inputEl) inputEl.value = "";
                    renderModalContent();
                });
            }
        }
        tableBody.appendChild(tr);
    });

    if (elementToHighlight) {
        requestAnimationFrame(() => {
            setTimeout(() => {
                elementToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                elementToHighlight.classList.add('highlight-pulsing');
                setTimeout(() => {
                    if (elementToHighlight) elementToHighlight.classList.remove('highlight-pulsing');
                    highlightedItemId = null;
                }, 6000);
            }, 350);
        });
    }
}

/* ============================================================
SEARCH & UTILS
============================================================ */
function initGlobalSearch() {
    const searchInput = document.getElementById('global-cloud-search');
    const clearBtn = document.getElementById('clear-search-btn');
    if (!searchInput) return;

    const searchInnerBox = searchInput.closest('.file-search-inner') || searchInput.parentElement;
    let dropdown = document.getElementById('search-dropdown-results');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'search-dropdown-results';
        dropdown.className = 'search-dropdown-menu';
        searchInnerBox.appendChild(dropdown);
    }

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = query.length > 0 ? 'block' : 'none';
        clearTimeout(searchDebounceTimeout);
        if (query.length >= 2) {
            searchDebounceTimeout = setTimeout(() => renderSearchDropdown(query, dropdown), 200);
        } else {
            hideSearchDropdown();
        }
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            hideSearchDropdown();
        });
    }

    document.addEventListener('click', (e) => {
        if (!searchInnerBox.contains(e.target)) {
            searchInput.value = '';
            if (clearBtn) clearBtn.style.display = 'none';
            hideSearchDropdown();
        }
    });
}

function hideSearchDropdown() {
    const dropdown = document.getElementById('search-dropdown-results');
    if (dropdown) dropdown.classList.remove('active');
}

function renderSearchDropdown(query, dropdown) {
    const matches = driveData.filter(item => {
        const name = (item.name || '').toLowerCase();
        const isMatch = name.includes(query);
        const isSystemFile = name.includes('thumbs.db') || name.includes('.ds_store');
        return isMatch && !isSystemFile;
    });

    if (matches.length === 0) {
        dropdown.innerHTML = `<div class="dropdown-no-results" style="padding: 10px; font-size: 12px; color: #727a8e; text-align: center;">No results for: "${escapeHtml(query)}"</div>`;
    } else {
        dropdown.innerHTML = '';
        matches.slice(0, 10).forEach(item => {
            const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
            const div = document.createElement('div');
            div.className = 'dropdown-item-row';
            div.innerHTML = `
                <div class="dropdown-item-left">
                    <i class="fa-solid ${isFolder ? 'fa-folder' : getFileIcon(item.name)} dropdown-item-icon" style="color: ${isFolder ? '#ff2a6d' : '#666'};"></i>
                    <div class="dropdown-item-info">
                        <span class="dropdown-item-title">${escapeHtml(item.name)}</span>
                        <span class="dropdown-item-path">gas / ${escapeHtml(item.path || item.fullPath || 'Root')}</span>
                    </div>
                </div>
            `;
            div.addEventListener('click', () => {
                let targetFolder = '';
                if (isFolder) {
                    targetFolder = item.fullPath || item.path || item.name;
                } else {
                    targetFolder = item.path || (item.fullPath ? item.fullPath.substring(0, item.fullPath.lastIndexOf('/')) : '');
                }
                const targetId = item.id || item.name;
                openFolderModal(targetFolder, targetId);
                hideSearchDropdown();
            });
            dropdown.appendChild(div);
        });
    }
    dropdown.classList.add('active');
}

function showMainFullLoader(titleText, subtitleText) {
    let loader = document.getElementById('global-cloud-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'global-cloud-loader';
        loader.className = 'main-cloud-overlay-loader';
        document.body.appendChild(loader);
    }
    loader.innerHTML = `<div class="loader-card-neumorphic"><div class="loader-ring-spinner"></div><div class="loader-text-wrapper"><div class="loader-title">${titleText}</div><div class="loader-subtitle">${subtitleText}</div></div></div>`;
    setTimeout(() => loader.classList.add('visible'), 10);
}

function hideMainFullLoader() {
    const loader = document.getElementById('global-cloud-loader');
    if (loader) {
        loader.classList.remove('visible');
        setTimeout(() => loader.remove(), 300);
    }
}

function updateCounters(items) {
    if (!Array.isArray(items)) return;
    const allFiles = items.filter(item => {
        const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
        const isSystemFile = (item.name || '').toLowerCase().includes('thumbs.db') || (item.name || '').toLowerCase().includes('.ds_store');
        return !isFolder && !isSystemFile;
    });
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setVal('stat-total-files', allFiles.length);
    setVal('stat-drivers-count', allFiles.filter(i => (i.fullPath || '').toLowerCase().startsWith('drivers')).length);
    setVal('stat-trucks-count', allFiles.filter(i => (i.fullPath || '').toLowerCase().startsWith('trucks')).length);
    setVal('stat-trailers-count', allFiles.filter(i => (i.fullPath || '').toLowerCase().startsWith('tanktrailers')).length);
    setVal('stat-excel-count', parsedDriversData.length);
}

function updateFolderCards(items) {
    ['drivers', 'trucks', 'tanktrailers'].forEach(key => {
        const count = items.filter(i => {
            const isFolder = i.mimeType === 'application/vnd.google-apps.folder';
            const isSystemFile = (i.name || '').toLowerCase().includes('thumbs.db') || (i.name || '').toLowerCase().includes('.ds_store');
            return !isFolder && !isSystemFile && (i.fullPath || '').toLowerCase().startsWith(key);
        }).length;
        const el = document.getElementById(`badge-${key}-count`);
        if (el) el.textContent = `${count} files`;
    });
}

function updateApiStatus(status) {
    const el = document.getElementById('api-status-badge');
    if (el) el.textContent = status;
}

function updateCloudStatus(status) {
    const el = document.getElementById('cloud-status-badge');
    if (el) el.textContent = status;
}

function updateLastSyncTime() {
    const el = document.getElementById('last-sync-time');
    if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024, i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
}

function getFileIcon(filename) {
    if (!filename) return 'fa-file';
    const ext = filename.split('.').pop().toLowerCase();
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'fa-file-excel';
    if (['pdf'].includes(ext)) return 'fa-file-pdf';
    return 'fa-file';
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
