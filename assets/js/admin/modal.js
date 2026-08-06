/**
 * Inicjalizuje obsługę wydarzeń zamykania modali w panelu administracyjnym.
 */
export function initAdminModals() {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;

    // Delegacja zdarzeń dla przycisków zamykających (.close-modal)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.close-modal')) {
            closeAdminModal();
        }
    });

    // Zamknięcie po kliknięciu bezpośrednio w ciemne tło (backdrop)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeAdminModal();
        }
    });

    // Zamknięcie przyciskiem Escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (modal.style.display === 'block' || modal.classList.contains('show'))) {
            closeAdminModal();
        }
    });
}

/**
 * Otwiera modal i wypełnia go podaną treścią HTML.
 * @param {string} title - Tytuł nagłówka w modalu.
 * @param {string} contentHtml - Zawartość HTML do wyrenderowania w ciele modala.
 */
export function openModalWithContent(title, contentHtml) {
    const modal = document.getElementById('admin-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    if (!modal) {
        console.error('❌ Nie znaleziono elementu #admin-modal w strukturze DOM.');
        return;
    }

    if (modalTitle) modalTitle.innerText = title;
    if (modalBody) modalBody.innerHTML = contentHtml;

    // Wyświetlenie okna
    modal.style.display = 'block';

    // Klasa pomocnicza dla płynnej animacji w CSS
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });

    // Zablokowanie skrolowania pod spodem
    document.body.style.overflow = 'hidden';
}

/**
 * Zamyka modal i przywraca domyślny stan widoku.
 */
export function closeAdminModal() {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;

    modal.classList.remove('show');

    // Krótkie opóźnienie na ukrycie elementu po zniknięciu animacji
    setTimeout(() => {
        modal.style.display = 'none';
        document.body.style.overflow = ''; // Przywrócenie skrolowania strony

        // Czyszczenie wnętrza dla zachowania higieny DOM
        const modalBody = document.getElementById('modal-body');
        if (modalBody) modalBody.innerHTML = '';
    }, 150);
}