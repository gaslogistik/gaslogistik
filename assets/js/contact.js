/* ============================================================
   CONTACT.JS — CZYSTY SKRYPT DLA CONTACT.HTML
   Współpracuje bezpośrednio z globalnym auth.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    initQuickCopy();
    initContactCategoryDropdown();
    initContactSearch();
    initMapSwitching();
});

/* ============================================================
   1. SZYBKIE KOPIOWANIE ADRESU EMAIL I NUMERÓW TELEFONU
   ============================================================ */

function initQuickCopy() {
    const links = document.querySelectorAll('.contact-card a[href^="tel:"], a[href^="mailto:"], .contact-card h3');

    links.forEach(link => {
        link.style.cursor = 'pointer';

        link.addEventListener('click', () => {
            const textToCopy = link.textContent.trim();

            if (navigator.clipboard) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showCopyNotification(link, textToCopy);
                }).catch(err => {
                    console.warn('Nie udało się skopiować tekstu: ', err);
                });
            }
        }, { passive: true });
    });
}

function showCopyNotification(element, copiedText) {
    let toast = document.getElementById('contact-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'contact-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 25px;
            right: 25px;
            background: #0284c7;
            color: #ffffff;
            padding: 10px 18px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 800;
            box-shadow: 0 8px 20px rgba(2, 132, 199, 0.4);
            z-index: 99999;
            transition: opacity 0.3s ease, transform 0.3s ease;
            opacity: 0;
            transform: translateY(10px);
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = `✓ Copied: ${copiedText}`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
    }, 2000);
}

/* ============================================================
   2. DROPDOWN KATEGORII
   ============================================================ */

function initContactCategoryDropdown() {
    const btn = document.querySelector('#contact-type-button');
    const dropdown = document.querySelector('#contact-type-dropdown');

    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('visible');
    }, { passive: true });

    const items = dropdown.querySelectorAll('li');
    items.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const cat = item.getAttribute('data-cat') || item.textContent.trim().toLowerCase();
            btn.textContent = `CAT: ${item.textContent.trim().toUpperCase()}`;
            dropdown.classList.remove('visible');

            filterCards(cat);
        }, { passive: true });
    });

    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('visible');
        }
    }, { passive: true });
}

/* ============================================================
   3. WYSZUKIWARKA LOKALNA
   ============================================================ */

function initContactSearch() {
    const input = document.querySelector('#contact-search-input');
    if (!input) return;

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        filterCardsByQuery(query);
    });
}

function filterCardsByQuery(query) {
    const cards = document.querySelectorAll('.contact-card');
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? 'flex' : 'none';
    });
}

function filterCards(category) {
    const cards = document.querySelectorAll('.contact-card');
    cards.forEach(card => {
        const cardCat = (card.getAttribute('data-category') || '').toLowerCase();
        if (category === 'all' || cardCat.includes(category)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

/* ============================================================
   4. OBSŁUGA PRZEŁĄCZANIA MAP
   ============================================================ */

function initMapSwitching() {
    const buttons = document.querySelectorAll('.map-tab-btn');
    if (!buttons.length) return;

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mapTarget = btn.getAttribute('data-map-target');
            if (mapTarget) {
                switchMapTab(mapTarget, btn);
            }
        }, { passive: true });
    });
}

window.switchContactMap = function (targetKey) {
    const targetId = 'iframe-' + targetKey;
    const activeBtn = document.getElementById('btn-map-' + targetKey);
    switchMapTab(targetId, activeBtn);
};

function switchMapTab(targetId, activeBtn) {
    const buttons = document.querySelectorAll('.map-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    const iframes = document.querySelectorAll('.location-map-iframe');
    iframes.forEach(iframe => {
        if (iframe.id === targetId) {
            iframe.classList.add('active');
        } else {
            iframe.classList.remove('active');
        }
    });
}