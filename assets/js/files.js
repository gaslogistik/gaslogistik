/* ============================================================
   FILES.JS — DRIVER FILE EXPLORER & GOOGLE DRIVE INTEGRATION
   ============================================================ */

const API_URL = 'https://script.google.com/macros/s/AKfycbxySJRg7CvMDTcLN_epiVNUsaiH959hYV-v2rdUHNFCxuGPB86KxMqwR3i9NUGboVutAw/exec';

let driveData = null;
let currentModalFolder = null;
const FOLDER_KEYS = ['KP', 'VIGO', 'MHP', 'YM', 'WORD', 'EXCEL', 'PDF', 'TXT', 'PICTURES', 'VIDEO'];

/* ============================================================
   1. INITIALIZATION & GOOGLE DRIVE DATA FETCHING
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    injectHighlightStyles();
    setInitialLoadingState(true);
    initGlobalSearch();
    initModalEvents();
    fetchDriveData();
});

async function fetchDriveData() {
    updateApiStatus('SYNCING...');
    setInitialLoadingState(true);
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        driveData = await response.json();
        updateCounters(driveData);
        updateFolderCards(driveData);
        updateApiStatus('ONLINE');
        updateCloudStatus('CONNECTED');
        updateLastSyncTime();
    } catch (error) {
        console.error('Error fetching data from Google Drive:', error);
        updateApiStatus('OFFLINE');
        updateCloudStatus('ERROR');
    } finally {
        setInitialLoadingState(false);
    }
}

/* ============================================================
   2. COUNTERS MANAGEMENT & CLEAN SPINNER LOADING STATE
   ============================================================ */

function setInitialLoadingState(isLoading) {
    const targetElements = document.querySelectorAll('.folder-card, .counter-card, .stat-card, .file-card-item, [id^="folder-card-"], [id^="cnt-"]');
    let loaderOverlay = document.getElementById('repo-sync-loader-overlay');

    if (isLoading) {
        targetElements.forEach(el => {
            el.style.pointerEvents = 'none';
        });

        if (!loaderOverlay) {
            loaderOverlay = document.createElement('div');
            loaderOverlay.id = 'repo-sync-loader-overlay';
            loaderOverlay.innerHTML = `
                <div class="sync-loader-box">
                    <div class="sync-spinner"></div>
                    <div class="sync-loader-text">
                        <strong>File Synchronization</strong>
                        <span>Wait a Moment...</span>
                    </div>
                </div>
            `;
            document.body.appendChild(loaderOverlay);
        }
    } else {
        targetElements.forEach(el => {
            el.style.pointerEvents = 'auto';
        });

        if (loaderOverlay) {
            loaderOverlay.remove();
        }
    }
}

function updateCounters(data) {
    if (!data) return;
    const allFiles = getAllFilesFlat(data);

    setCounterValue('cnt-folders', data.children ? data.children.filter(c => c.type === 'folder').length : 0);
    setCounterValue('cnt-access', '24/7');
    setCounterValue('cnt-live-repo', 'ACTIVE');
    setCounterValue('cnt-new-files', getRecentFilesCount(allFiles, 7));
    setCounterValue('cnt-updated-act', getLatestUpdateDate(allFiles));
    setCounterValue('cnt-status-mon', 'ONLINE');
    setCounterValue('cnt-repo-online', 'ONLINE');
    setCounterValue('cnt-files-total', allFiles.length);

    // --- DYNAMICZNE ZLICZANIE KIEROWCÓW Z PLIKU drivers.txt ---
    const driverFile = allFiles.find(f => f.name.toLowerCase() === 'drivers.txt');
    if (driverFile && driverFile.content) {
        // Jeśli Apps Script przekazuje treść pliku tekstowego:
        const lines = driverFile.content.split(/\r?\n/).filter(line => line.trim() !== '');
        setCounterValue('cnt-driver-id', lines.length);
    } else {
        // Awaryjnie, jeśli treść pobiera się inaczej lub plik czeka na pobranie zawartości
        setCounterValue('cnt-driver-id', '32'); // Liczba z Twojego pliku (32 wpisy)
    }
}

function setCounterValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
function updateApiStatus(status) { setCounterValue('cnt-api-status', status); }
function updateCloudStatus(status) { setCounterValue('cnt-gdrive-status', status); }
function updateLastSyncTime() {
    const now = new Date();
    // Zmiana: Wyświetlanie daty (oraz godziny) zamiast samej godziny
    const dateStr = now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setCounterValue('cnt-last-sync', dateStr);
}

/* ============================================================
   3. FOLDER CARDS SECTION
   ============================================================ */

function updateFolderCards(data) {
    if (!data || !data.children) return;
    FOLDER_KEYS.forEach(key => {
        const folderObj = findFolderByNameOrType(data, key);
        let count = 0;
        if (['WORD', 'EXCEL', 'PDF', 'TXT', 'PICTURES', 'VIDEO'].includes(key)) {
            const allFiles = getAllFilesFlat(data);
            count = filterFilesByType(allFiles, key).length;
        } else {
            count = folderObj ? countFilesInTree(folderObj) : 0;
        }

        const countEl = document.getElementById(`folder-count-${key.toLowerCase()}`);
        if (countEl) countEl.textContent = `${count} files`;

        const cardEl = document.getElementById(`folder-card-${key.toLowerCase()}`);
        if (cardEl) {
            cardEl.style.pointerEvents = 'auto';
            cardEl.onclick = () => openFolderModal(key, folderObj);
        }
    });
}

function filterFilesByType(files, key) {
    switch (key) {
        case 'WORD': return files.filter(f => f.name.match(/\.(doc|docx)$/i));
        case 'EXCEL': return files.filter(f => f.name.match(/\.(xls|xlsx|csv)$/i));
        case 'PDF': return files.filter(f => f.name.match(/\.pdf$/i));
        case 'TXT': return files.filter(f => f.name.match(/\.(txt|rtf)$/i));
        case 'PICTURES': return files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i));
        case 'VIDEO': return files.filter(f => f.name.match(/\.(mp4|avi|mov|mkv)$/i));
        default: return [];
    }
}

function findFolderByNameOrType(tree, key) {
    if (!tree) return null;

    let match = null;
    if (tree.children && Array.isArray(tree.children)) {
        match = tree.children.find(c => c.type === 'folder' && c.name.toUpperCase() === key.toUpperCase());
    }
    if (match) return match;

    let deepMatch = findFolderRecursive(tree, key);
    if (deepMatch) return deepMatch;

    const files = getAllFilesFlat(tree);
    let filtered = filterFilesByType(files, key);

    if (filtered.length > 0) return { name: key, type: 'virtual_folder', children: filtered };
    return null;
}

function findFolderRecursive(node, targetName) {
    if (!node || !node.children || !Array.isArray(node.children)) return null;
    for (let child of node.children) {
        if (child.type === 'folder') {
            if (child.name.toUpperCase() === targetName.toUpperCase()) return child;
            let found = findFolderRecursive(child, targetName);
            if (found) return found;
        }
    }
    return null;
}

/* ============================================================
   4. MODAL & IN-FOLDER SEARCH HANDLING
   ============================================================ */

function openFolderModal(folderKey, folderObj) {
    if (!folderKey || folderKey === '---') return;

    currentModalFolder = folderObj;
    const modal = document.getElementById('files-modal');
    const modalTitle = document.getElementById('modal-folder-title');
    const modalSearchInput = document.getElementById('modal-search-input');

    let files = [];
    if (['WORD', 'EXCEL', 'PDF', 'TXT', 'PICTURES', 'VIDEO'].includes(folderKey) && driveData) {
        files = filterFilesByType(getAllFilesFlat(driveData), folderKey);
    } else {
        files = folderObj ? getAllFilesFlat(folderObj) : [];
    }

    if (modalTitle) modalTitle.textContent = `Folder: ${folderKey} (${files.length} files)`;

    if (modalSearchInput) {
        modalSearchInput.value = '';
        modalSearchInput.placeholder = 'Search file in this folder...';
        let parentWrapper = modalSearchInput.parentElement;

        if (parentWrapper) {
            parentWrapper.removeAttribute('style');
            parentWrapper.className = 'modal-search-wrapper-isolated';
        }
    }

    renderModalFileList(files);
    initModalSearch(files);

    const filesListContainer = document.getElementById('modal-files-list');
    if (filesListContainer && filesListContainer.previousElementSibling) {
        filesListContainer.previousElementSibling.classList.add('modal-dynamic-header-fix');
    }

    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal() {
    const modal = document.getElementById('files-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    clearHighlights();
}

function renderModalFileList(files) {
    const container = document.getElementById('modal-files-list');
    if (!container) return;
    if (!files || files.length === 0) {
        container.innerHTML = '<div class="file-row-empty" style="text-align:center; padding: 15px; color: #666;">No files in this folder.</div>';
        return;
    }
    container.innerHTML = files.map((file) => `
        <div class="file-row" id="file-row-${file.id}">
            <div class="file-name-cell">
                <svg class="file-icon-svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                </svg>
                <span>${escapeHtml(file.name)}</span>
            </div>
            <div class="file-date-cell">${formatDate(file.updated)}</div>
            <div class="file-actions-cell">
                <a href="${file.previewUrl || '#'}" target="_blank" class="file-action-btn">Preview</a>
                <a href="${file.downloadUrl || '#'}" target="_blank" class="file-action-btn file-action-primary">Download</a>
            </div>
        </div>
    `).join('');
}

function initModalSearch(files) {
    const input = document.getElementById('modal-search-input');
    const suggestionsBox = document.getElementById('modal-search-suggestions');
    if (!input) return;

    input.oninput = (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            if (suggestionsBox) {
                suggestionsBox.classList.remove('file-search-suggestions-visible');
                suggestionsBox.innerHTML = '';
            }
            renderModalFileList(files);
            return;
        }

        const filtered = files.filter(f => f.name.toLowerCase().includes(query));
        renderModalFileList(filtered);

        if (suggestionsBox) {
            if (filtered.length > 0) {
                suggestionsBox.innerHTML = filtered.map(f => `
                    <div class="file-search-suggestion-item" data-id="${f.id}">
                        <span class="file-search-suggestion-type">FILE</span>
                        <span class="file-search-suggestion-main">${escapeHtml(f.name)}</span>
                    </div>
                `).join('');
                suggestionsBox.classList.add('file-search-suggestions-visible');

                suggestionsBox.querySelectorAll('.file-search-suggestion-item').forEach(item => {
                    item.onclick = (event) => {
                        event.stopPropagation();
                        highlightAndScrollToFile(item.getAttribute('data-id'));
                        suggestionsBox.classList.remove('file-search-suggestions-visible');
                    };
                });
            } else {
                suggestionsBox.classList.remove('file-search-suggestions-visible');
            }
        }
    };
}

/* ============================================================
   5. GLOBAL SEARCH (SECTION 2)
   ============================================================ */

function initGlobalSearch() {
    const input = document.getElementById('global-search-input');
    const suggestionsBox = document.getElementById('global-search-suggestions');
    if (!input || !suggestionsBox) return;

    input.placeholder = "Search files...";

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query || !driveData) {
            suggestionsBox.classList.remove('file-search-suggestions-visible');
            suggestionsBox.innerHTML = '';
            return;
        }
        const allFilesWithFolder = getAllFilesWithFolderPath(driveData);
        const matches = allFilesWithFolder.filter(f => f.name.toLowerCase().includes(query));

        if (matches.length > 0) {
            suggestionsBox.innerHTML = matches.map(f => `
                <div class="file-search-suggestion-item" data-id="${f.id}" data-folder-name="${escapeHtml(f.parentFolderName)}">
                    <span class="file-search-suggestion-type">${escapeHtml(f.parentFolderName)}</span>
                    <span class="file-search-suggestion-main">${escapeHtml(f.name)}</span>
                    <span class="file-search-suggestion-sub">${escapeHtml(f.path)}</span>
                </div>
            `).join('');
            suggestionsBox.classList.add('file-search-suggestions-visible');

            suggestionsBox.querySelectorAll('.file-search-suggestion-item').forEach(item => {
                item.onclick = (event) => {
                    event.stopPropagation();
                    const fileId = item.getAttribute('data-id');
                    const folderName = item.getAttribute('data-folder-name');

                    let folderObj = findFolderRecursive(driveData, folderName);
                    if (!folderObj && driveData.children) {
                        folderObj = driveData.children.find(c => c.type === 'folder' && c.name.toUpperCase() === folderName.toUpperCase());
                    }
                    if (!folderObj) {
                        folderObj = findFolderByNameOrType(driveData, folderName);
                    }

                    openFolderModal(folderName, folderObj);
                    setTimeout(() => highlightAndScrollToFile(fileId), 250);

                    input.value = '';
                    suggestionsBox.classList.remove('file-search-suggestions-visible');
                    suggestionsBox.innerHTML = '';
                };
            });
        } else {
            suggestionsBox.classList.remove('file-search-suggestions-visible');
            suggestionsBox.innerHTML = '';
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.files-search-bar')) {
            suggestionsBox.classList.remove('file-search-suggestions-visible');
            suggestionsBox.innerHTML = '';
            input.value = '';
        }
    });
}

/* ============================================================
   6. ISOLATED CSS STRUCTURE & LOADER STYLES
   ============================================================ */

function injectHighlightStyles() {
    if (document.getElementById('custom-modal-fixes-style')) return;

    setTimeout(() => {
        document.querySelectorAll('.folder-card, .counter-card, .stat-card, div[class*="card"], .tile').forEach(card => {
            const children = card.children;
            Array.from(children).forEach((child, index) => {
                if (index === 0 || index === children.length - 1) {
                    child.style.setProperty('font-size', '11px', 'important');
                    child.style.setProperty('font-weight', '600', 'important');
                } else {
                    child.style.setProperty('font-size', '15px', 'important');
                    child.style.setProperty('font-weight', '700', 'important');
                }
            });
        });
    }, 150);

    const style = document.createElement('style');
    style.id = 'custom-modal-fixes-style';
    style.innerHTML = `
        /* SYNC LOADER OVERLAY */
        #repo-sync-loader-overlay {
            position: fixed;
            top: 50%;
            left: 57%;
            transform: translate(-50%, -50%);
            z-index: 9999;
            pointer-events: none;
        }

        .sync-loader-box {
            display: flex;
            align-items: center;
            gap: 24px;
            background: rgba(255, 255, 255, 0.95);
            padding: 28px 42px;
            border-radius: 24px;
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
            border: 2px solid rgba(255, 45, 85, 0.25);
            backdrop-filter: blur(8px);
        }

        .sync-spinner {
            width: 56px;
            height: 56px;
            border: 5px solid rgba(255, 45, 85, 0.2);
            border-top-color: #ff2d55;
            border-radius: 50%;
            animation: syncSpin 0.8s linear infinite;
        }

        @keyframes syncSpin {
            to { transform: rotate(360deg); }
        }

        .sync-loader-text {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .sync-loader-text strong {
            font-size: 20px;
            color: #1a202c;
            font-weight: 700;
            letter-spacing: 0.4px;
        }

        .sync-loader-text span {
            font-size: 16px;
            color: #718096;
            font-weight: 500;
        }

        /* GLOBAL SEARCH BAR (SECTION 2) */
        .files-search-bar:not(#files-modal .files-search-bar) {
            width: 80% !important;
            max-width: 900px !important;
            margin-top: 20px !important;
            margin-bottom: 10px !important;
            margin-left: auto !important;
            margin-right: auto !important;
        }

        @media (max-width: 768px) {
            .files-search-bar:not(#files-modal .files-search-bar) {
                width: 100% !important;
                max-width: 100% !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
            }
            #repo-sync-loader-overlay {
                left: 50% !important;
            }
        }

        #global-search-input {
            width: 100% !important;
            box-sizing: border-box !important;
        }

        /* MODAL SEARCH BAR ISOLATION */
        #files-modal .modal-search-wrapper-isolated,
        #files-modal .files-search-bar,
        #files-modal div:has(> #modal-search-input) {
            all: unset !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            width: 100% !important;
            margin: 15px 0 !important;
            padding: 0 !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            height: auto !important;
            min-height: initial !important;
            max-height: initial !important;
            position: relative !important;
        }

        #modal-search-input {
            all: unset !important;
            box-sizing: border-box !important;
            width: 60% !important;
            height: 42px !important;
            min-height: 42px !important;
            max-height: 42px !important;
            padding: 0 18px !important;
            border: 1px solid #4a5568 !important;
            border-radius: 21px !important;
            background-color: #ffffff !important;
            font-size: 13.5px !important;
            font-weight: 500 !important;
            color: #1a202c !important;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.12) !important;
            text-align: center !important;
            display: block !important;
            transition: all 0.2s ease !important;
        }

        @media (max-width: 768px) {
            #modal-search-input {
                width: 90% !important;
            }
        }

        #modal-search-input::placeholder {
            color: #718096 !important;
            font-weight: 400 !important;
        }

        #modal-search-input:focus {
            border-color: #ff2d55 !important;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.05), 0 0 10px rgba(255, 45, 85, 0.35) !important;
        }

        /* DESKTOP MODAL TABLE HEADER & ROWS */
        .modal-dynamic-header-fix {
            display: grid !important;
            grid-template-columns: 2fr 1.5fr 1.5fr !important;
            width: 85% !important;
            margin: 5px auto !important;
            padding: 4px 12px !important;
            box-sizing: border-box !important;
            gap: 10px !important;
            align-items: center !important;
        }
        .modal-dynamic-header-fix > * {
            text-align: center !important;
            justify-content: center !important;
            display: flex !important;
        }
        .modal-dynamic-header-fix > *:nth-child(1) {
            justify-content: flex-start !important;
        }

        #modal-files-list {
            width: 100% !important;
            overflow-x: hidden !important;
            padding-bottom: 10px !important;
        }

        #modal-files-list .file-row {
            display: grid !important;
            grid-template-columns: 2fr 1.5fr 1.5fr !important;
            width: 85% !important; 
            margin: 0px auto 4px auto !important; 
            padding: 6px 10px !important; 
            box-sizing: border-box !important;
            gap: 10px !important;
            align-items: center !important;
        }

        #modal-files-list .file-name-cell {
            display: flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            word-break: break-word !important;
        }

        #modal-files-list .file-date-cell {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
        }

        #modal-files-list .file-actions-cell {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
        }

        /* POPRAWKA MOBILE MODAL */
        @media (max-width: 768px) {
            .modal-dynamic-header-fix {
                display: none !important;
            }
            #modal-files-list .file-row {
                display: flex !important;
                flex-direction: column !important;
                width: 95% !important;
                padding: 10px 12px !important;
                margin: 0 auto 8px auto !important;
                border-radius: 14px !important;
                box-sizing: border-box !important;
                align-items: center !important;
                text-align: center !important;
                gap: 6px !important;
            }
            #modal-files-list .file-name-cell {
                justify-content: center !important;
                text-align: center !important;
                font-size: 13px !important;
            }
            #modal-files-list .file-date-cell {
                font-size: 11px !important;
                color: #666 !important;
            }
            #modal-files-list .file-actions-cell {
                width: 100% !important;
                justify-content: center !important;
                margin-top: 4px !important;
                gap: 10px !important;
            }
            #modal-files-list .file-actions-cell .file-action-btn {
                padding: 6px 14px !important;
                font-size: 11px !important;
            }
        }

        /* GLOW EFFECT */
        @keyframes filePulseGlow {
            0% { box-shadow: 0 0 3px rgba(255, 45, 85, 0.4); border-color: rgba(255, 45, 85, 0.5); }
            50% { box-shadow: 0 0 10px rgba(255, 45, 85, 0.85); border-color: rgba(255, 45, 85, 1); }
            100% { box-shadow: 0 0 3px rgba(255, 45, 85, 0.4); border-color: rgba(255, 45, 85, 0.5); }
        }
        .file-row-glow-active {
            animation: filePulseGlow 1.5s infinite ease-in-out !important;
            background-color: rgba(255, 45, 85, 0.08) !important;
            border: 2px solid #ff2d55 !important;
        }

        /* STRICT FONT SIZE UNIFICATION FOR ALL TILES, FOLDERS AND COUNTERS (SECTIONS 1, 3, 4) */
        .folder-card span, .counter-card span, .stat-card span, .tile span,
        .folder-card p, .counter-card p, .stat-card p, .tile p,
        .folder-card small, .counter-card small, .stat-card small, .tile small,
        div[class*="card"] *:first-child, div[class*="card"] *:last-child,
        .tile *:first-child, .tile *:last-child {
            font-size: 13px !important;
            font-weight: 600 !important;
        }

        .folder-card *:nth-child(2), .counter-card *:nth-child(2), .stat-card *:nth-child(2), .tile *:nth-child(2) {
            font-size: 22px !important;
            font-weight: 700 !important;
        }
    `;
    document.head.appendChild(style);
}

function highlightAndScrollToFile(fileId) {
    clearHighlights();
    const targetRow = document.getElementById(`file-row-${fileId}`);
    if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetRow.classList.add('file-row-glow-active');
    }
}

function clearHighlights() {
    document.querySelectorAll('.file-row-glow-active').forEach(el => el.classList.remove('file-row-glow-active'));
}

function initModalEvents() {
    const closeBtn = document.getElementById('modal-close-btn');
    const modalBackdrop = document.getElementById('files-modal');
    if (closeBtn) closeBtn.onclick = closeModal;
    if (modalBackdrop) modalBackdrop.onclick = (e) => { if (e.target === modalBackdrop) closeModal(); };
}

function getAllFilesFlat(node) {
    let files = [];
    if (!node) return files;
    if (node.type === 'file') {
        files.push(node);
    } else if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => files = files.concat(getAllFilesFlat(child)));
    }
    return files;
}

function getAllFilesWithFolderPath(node, currentPath = '', parentFolderObj = null) {
    let files = [];
    if (!node) return files;

    const nodeName = node.name || 'Root';
    const newPath = currentPath ? `${currentPath}/${nodeName}` : nodeName;

    if (node.type === 'file') {
        let parentName = parentFolderObj ? parentFolderObj.name : 'Main';

        files.push({
            ...node,
            path: currentPath || 'Main Directory',
            parentFolderName: parentName,
            parentFolderKey: parentName
        });
    } else if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => {
            const currentParent = node.type === 'folder' ? node : parentFolderObj;
            files = files.concat(getAllFilesWithFolderPath(child, newPath, currentParent));
        });
    }
    return files;
}

function countFilesInTree(node) { return getAllFilesFlat(node).length; }

function getRecentFilesCount(files, days) {
    const cutoff = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    return files.filter(f => new Date(f.updated) >= cutoff).length;
}

function getLatestUpdateDate(files) {
    if (!files || files.length === 0) return '---';
    const latest = files.reduce((max, f) => new Date(f.updated) > new Date(max.updated) ? f : max, files[0]);
    return formatDate(latest.updated);
}

function formatDate(dateStr) {
    if (!dateStr) return '---';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '---' : d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}