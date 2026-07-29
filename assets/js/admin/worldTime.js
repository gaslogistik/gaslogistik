/**
 * Konfiguracja i automatyczna obsługa zegarów światowych
 * Pobiera strefy czasowe bezpośrednio z elementów HTML z atrybutem data-timezone
 */
export function initWorldClocks() {
    updateWorldClocks();
    setInterval(updateWorldClocks, 1000);
}

function updateWorldClocks() {
    const timeTiles = document.querySelectorAll('.time-tile[data-timezone]');
    if (!timeTiles.length) return;

    const now = new Date();

    timeTiles.forEach(tile => {
        const timeZone = tile.getAttribute('data-timezone');
        const valEl = tile.querySelector('.time-val');
        const dateEl = tile.querySelector('.time-date');

        try {
            if (valEl) {
                valEl.innerText = now.toLocaleTimeString('pl-PL', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZone: timeZone
                });
            }

            if (dateEl) {
                dateEl.innerText = now.toLocaleDateString('pl-PL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    timeZone: timeZone
                });
            }
        } catch (err) {
            console.error(`Błąd formatowania czasu dla strefy: ${timeZone}`, err);
        }
    });
}