/* ============================================================
   FILES.JS — DRIVER FILE EXPLORER & GOOGLE DRIVE INTEGRATION
   ============================================================ */

const API_URL = 'https://script.google.com/macros/s/AKfycbxySJRg7CvMDTcLN_epiVNUsaiH959hYV-v2rdUHNFCxuGPB86KxMqwR3i9NUGboVutAw/exec';

let driveData = null;
let currentModalFolder = null;
let modalFolderHistory = [];
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
                        <strong>Gaslogistik File Synchronization</strong>
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
    const allFolders = getAllFoldersFlat(data);

    setCounterValue('cnt-folders', allFolders.length);
    setCounterValue('cnt-access', '24/7');
    setCounterValue('cnt-live-repo', 'ACTIVE');
    setCounterValue('cnt-new-files', getRecentFilesCount(allFiles, 7));
    setCounterValue('cnt-updated-act', getLatestUpdateDate(allFiles));
    setCounterValue('cnt-status-mon', 'ONLINE');
    setCounterValue('cnt-repo-online', 'ONLINE');
    setCounterValue('cnt-files-total', allFiles.length);
    setCounterValue('cnt-ftp-cloud', 'ON');
}

function setCounterValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
function updateApiStatus(status) { setCounterValue('cnt-api-status', status); }
function updateCloudStatus(status) { setCounterValue('cnt-gdrive-status', status); }
function updateLastSyncTime() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setCounterValue('cnt-last-sync', dateStr);
}

/* ============================================================
   3. FOLDER CARDS & TREE NAVIGATION HELPERS
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
        if (countEl) countEl.textContent = `${count} items`;

        const cardEl = document.getElementById(`folder-card-${key.toLowerCase()}`);
        if (cardEl) {
            cardEl.style.pointerEvents = 'auto';
            cardEl.onclick = () => openFolderModal(key, folderObj, true);
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
            if (child.name.toUpperCase() === String(targetName).toUpperCase()) return child;
            let found = findFolderRecursive(child, targetName);
            if (found) return found;
        }
    }
    return null;
}

function findParentFolder(root, targetIdOrName) {
    if (!root || !root.children || !Array.isArray(root.children)) return null;

    for (let child of root.children) {
        if ((child.id && child.id === targetIdOrName) ||
            (child.name && child.name.toLowerCase() === String(targetIdOrName).toLowerCase())) {
            return root;
        }
        if (child.type === 'folder') {
            let foundParent = findParentFolder(child, targetIdOrName);
            if (foundParent) return foundParent;
        }
    }
    return null;
}

function getFolderAncestors(root, targetIdOrName) {
    let ancestors = [];
    let currentTarget = targetIdOrName;

    while (currentTarget) {
        let parent = findParentFolder(root, currentTarget);
        if (parent && parent !== root) {
            ancestors.unshift({ key: parent.name || 'Folder', obj: parent });
            currentTarget = parent.id || parent.name;
        } else {
            break;
        }
    }
    return ancestors;
}

/* ============================================================
   4. MODAL & IN-FOLDER SEARCH HANDLING (FILES & FOLDERS)
   ============================================================ */

function openFolderModal(folderKey, folderObj, resetHistory = false, historyOverride = null) {
    if (!folderKey || folderKey === '---') return;

    if (resetHistory) {
        modalFolderHistory = Array.isArray(historyOverride) ? [...historyOverride] : [];
    } else if (historyOverride === true) {
    } else {
        if (currentModalFolder && currentModalFolder !== folderObj) {
            modalFolderHistory.push({ key: currentModalFolder.name || 'Folder', obj: currentModalFolder });
        }
    }

    currentModalFolder = folderObj;
    const modal = document.getElementById('files-modal');
    const modalTitle = document.getElementById('modal-folder-title');
    const modalSearchInput = document.getElementById('modal-search-input');

    let items = [];
    if (['WORD', 'EXCEL', 'PDF', 'TXT', 'PICTURES', 'VIDEO'].includes(folderKey) && driveData && resetHistory && (!historyOverride || historyOverride.length === 0)) {
        items = filterFilesByType(getAllFilesFlat(driveData), folderKey);
    } else {
        if (folderObj && folderObj.children) {
            items = folderObj.children;
        } else {
            items = [];
        }
    }

    if (modalTitle) {
        let backBtnHtml = modalFolderHistory.length > 0 ?
            `<button class="modal-back-nav-btn" onclick="goBackModalFolder()" type="button" title="Back to previous folder">← Back</button>` : '';
        modalTitle.innerHTML = `${backBtnHtml} Folder: ${escapeHtml(folderKey)} (${items.length} items)`;
    }

    if (modalSearchInput) {
        modalSearchInput.value = '';
        modalSearchInput.placeholder = 'Search item in this folder...';
        let parentWrapper = modalSearchInput.parentElement;

        if (parentWrapper) {
            parentWrapper.removeAttribute('style');
            parentWrapper.className = 'modal-search-wrapper-isolated';
        }
    }

    renderModalItemList(items);
    initModalSearch(items);

    const filesListContainer = document.getElementById('modal-files-list');
    if (filesListContainer && filesListContainer.previousElementSibling) {
        filesListContainer.previousElementSibling.classList.add('modal-dynamic-header-fix');
    }

    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function goBackModalFolder() {
    if (modalFolderHistory.length > 0) {
        const prev = modalFolderHistory.pop();
        openFolderModal(prev.key, prev.obj, false, true);
    }
}

function closeModal() {
    const modal = document.getElementById('files-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    modalFolderHistory = [];
    clearHighlights();
}

function renderModalItemList(items) {
    const container = document.getElementById('modal-files-list');
    if (!container) return;
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="file-row-empty" style="text-align:center; padding: 15px; color: #666;">No items in this folder.</div>';
        return;
    }

    const sortedItems = [...items].sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });

    container.innerHTML = sortedItems.map((item) => {
        if (item.type === 'folder') {
            const subCount = item.children ? item.children.length : 0;
            return `
                <div class="file-row folder-row-item" id="folder-row-${escapeHtml(item.name)}" style="cursor: pointer;" onclick='openFolderModal(${JSON.stringify(item.name)}, ${JSON.stringify(item)}, false)'>
                    <div class="file-name-cell">
                        <svg class="file-icon-svg" viewBox="0 0 24 24" fill="#ff2d55" style="width: 20px; height: 20px; margin-right: 8px;">
                            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                        </svg>
                        <strong style="color: #ff2d55;">${escapeHtml(item.name)}</strong> <span style="font-size: 11px; color: #718096; margin-left: 6px;">(${subCount} items)</span>
                    </div>
                    <div class="file-date-cell">Subfolder</div>
                    <div class="file-actions-cell">
                        <button class="file-action-btn file-action-primary" type="button">Open Folder</button>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="file-row" id="file-row-${escapeHtml(item.id)}">
                    <div class="file-name-cell">
                        <svg class="file-icon-svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                        </svg>
                        <span>${escapeHtml(item.name)}</span>
                    </div>
                    <div class="file-date-cell">${formatDate(item.updated)}</div>
                    <div class="file-actions-cell">
                        <a href="${item.previewUrl || '#'}" target="_blank" class="file-action-btn">Preview</a>
                        <a href="${item.downloadUrl || '#'}" target="_blank" class="file-action-btn file-action-primary">Download</a>
                    </div>
                </div>
            `;
        }
    }).join('');
}

function initModalSearch(items) {
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
            renderModalItemList(items);
            return;
        }

        const filtered = items.filter(i => i.name.toLowerCase().includes(query));
        renderModalItemList(filtered);

        if (suggestionsBox) {
            if (filtered.length > 0) {
                suggestionsBox.innerHTML = filtered.map(i => `
                    <div class="file-search-suggestion-item" data-id="${i.id || i.name}" data-type="${i.type}">
                        <span class="file-search-suggestion-type">${i.type === 'folder' ? 'FOLDER' : 'FILE'}</span>
                        <span class="file-search-suggestion-main">${escapeHtml(i.name)}</span>
                    </div>
                `).join('');
                suggestionsBox.classList.add('file-search-suggestions-visible');

                suggestionsBox.querySelectorAll('.file-search-suggestion-item').forEach(item => {
                    item.onclick = (event) => {
                        event.stopPropagation();
                        const type = item.getAttribute('data-type');
                        const name = item.querySelector('.file-search-suggestion-main').textContent;

                        if (type === 'folder') {
                            const subFolderObj = items.find(i => i.name === name && i.type === 'folder');
                            if (subFolderObj) openFolderModal(subFolderObj.name, subFolderObj, false);
                        } else {
                            highlightAndScrollToFile(item.getAttribute('data-id'));
                        }
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
   5. GLOBAL SEARCH (SECTION 2 - INCLUDES FOLDERS & FILES)
   ============================================================ */

function initGlobalSearch() {
    const input = document.getElementById('global-search-input');
    const suggestionsBox = document.getElementById('global-search-suggestions');
    if (!input || !suggestionsBox) return;

    input.placeholder = "Search folders or files...";

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query || !driveData) {
            suggestionsBox.classList.remove('file-search-suggestions-visible');
            suggestionsBox.innerHTML = '';
            return;
        }
        const allItemsWithFolder = getAllItemsWithFolderPath(driveData);
        const matches = allItemsWithFolder.filter(i => i.name.toLowerCase().includes(query));

        if (matches.length > 0) {
            suggestionsBox.innerHTML = matches.map(i => `
                <div class="file-search-suggestion-item" data-id="${i.id || ''}" data-type="${i.type}" data-folder-name="${escapeHtml(i.parentFolderName)}" data-item-name="${escapeHtml(i.name)}">
                    <span class="file-search-suggestion-type">${i.type === 'folder' ? 'FOLDER' : escapeHtml(i.parentFolderName)}</span>
                    <span class="file-search-suggestion-main">${escapeHtml(i.name)}</span>
                    <span class="file-search-suggestion-sub">${escapeHtml(i.path)}</span>
                </div>
            `).join('');
            suggestionsBox.classList.add('file-search-suggestions-visible');

            suggestionsBox.querySelectorAll('.file-search-suggestion-item').forEach(item => {
                item.onclick = (event) => {
                    event.stopPropagation();
                    const itemType = item.getAttribute('data-type');
                    const itemId = item.getAttribute('data-id');
                    const folderName = item.getAttribute('data-folder-name');
                    const itemName = item.getAttribute('data-item-name');

                    if (itemType === 'folder') {
                        let targetFolder = findFolderRecursive(driveData, itemName);
                        if (!targetFolder && driveData.children) {
                            targetFolder = driveData.children.find(c => c.type === 'folder' && c.name.toUpperCase() === itemName.toUpperCase());
                        }
                        let ancestors = getFolderAncestors(driveData, itemName);
                        openFolderModal(itemName, targetFolder, true, ancestors);
                    } else {
                        let parentFolder = findParentFolder(driveData, itemId) || findParentFolder(driveData, itemName);
                        let actualFolderName = parentFolder ? parentFolder.name : folderName;
                        let folderObj = parentFolder || findFolderRecursive(driveData, actualFolderName);

                        if (!folderObj) {
                            folderObj = findFolderByNameOrType(driveData, actualFolderName);
                        }

                        let ancestors = getFolderAncestors(driveData, actualFolderName);
                        openFolderModal(actualFolderName, folderObj, true, ancestors);
                        setTimeout(() => highlightAndScrollToFile(itemId), 250);
                    }

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
   6. ISOLATED CSS STRUCTURE & STYLES
   ============================================================ */

function injectHighlightStyles() {
    if (document.getElementById('custom-modal-fixes-style')) return;

    setTimeout(() => {
        document.querySelectorAll('.counter-card, .stat-card, div[class*="card"]:not(.folder-card), .tile:not(.folder-card)').forEach(card => {
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

        .modal-back-nav-btn {
            background: #ff2d55 !important;
            color: #ffffff !important;
            border: none !important;
            padding: 6px 14px !important;
            border-radius: 8px !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            margin-right: 12px !important;
            transition: background 0.2s ease !important;
            display: inline-flex !important;
            align-items: center !important;
            box-shadow: 0 2px 6px rgba(255, 45, 85, 0.3) !important;
        }
        .modal-back-nav-btn:hover {
            background: #e02448 !important;
        }

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

        .folder-row-item {
            background: rgba(255, 45, 85, 0.03);
            border-radius: 8px;
            transition: background 0.2s ease;
        }
        .folder-row-item:hover {
            background: rgba(255, 45, 85, 0.08);
        }

        .counter-card span, .stat-card span, 
        .counter-card p, .stat-card p, 
        .counter-card small, .stat-card small, 
        div[class*="card"]:not(.folder-card) *:first-child, div[class*="card"]:not(.folder-card) *:last-child,
        .tile:not(.folder-card) *:first-child, .tile:not(.folder-card) *:last-child {
            font-size: 13px !important;
            font-weight: 600 !important;
        }

        .counter-card *:nth-child(2), .stat-card *:nth-child(2) {
            font-size: 22px !important;
            font-weight: 700 !important;
        }

        /* ========================================================
           SEKCJA FOLDERS / FTP — W TYM MIEJSCU ZMIANIASZ CZCIONKĘ
           ======================================================== */
        .folder-card span, 
        .folder-card p, 
        .folder-card small, 
        .folder-card *:first-child, 
        .folder-card *:last-child {
            font-size: 20px !important; /* <--- TUTAJ zmień rozmiar czcionki dla etykiet/tytułóW */
            font-weight: 600 !important; /* <--- TUTAJ waga czcionki */
        }

        .folder-card *:nth-child(2) {
            font-size: 15px !important; /* <--- TUTAJ zmień rozmiar głównej wartości/licznika w kafelku */
            font-weight: 700 !important; /* <--- TUTAJ waga głównej wartości */
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

function getAllFoldersFlat(node) {
    let folders = [];
    if (!node) return folders;
    if (node.type === 'folder') {
        folders.push(node);
    }
    if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => {
            folders = folders.concat(getAllFoldersFlat(child));
        });
    }
    return folders;
}

function getAllItemsWithFolderPath(node, currentPath = '', parentFolderObj = null) {
    let items = [];
    if (!node) return items;

    const nodeName = node.name || 'Root';
    const newPath = currentPath ? `${currentPath}/${nodeName}` : nodeName;

    if (node.type === 'folder' && currentPath !== '') {
        let parentName = parentFolderObj ? parentFolderObj.name : 'Main';
        items.push({
            ...node,
            path: currentPath,
            parentFolderName: parentName,
            parentFolderKey: parentName
        });
    }

    if (node.type === 'file') {
        let parentName = parentFolderObj ? parentFolderObj.name : 'Main';
        items.push({
            ...node,
            path: currentPath || 'Main Directory',
            parentFolderName: parentName,
            parentFolderKey: parentName
        });
    }

    if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => {
            const currentParent = node.type === 'folder' ? node : parentFolderObj;
            items = items.concat(getAllItemsWithFolderPath(child, newPath, currentParent));
        });
    }
    return items;
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