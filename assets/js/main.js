/* ==========================================================================
   MAIN.JS — AUDYT + OPTYMALIZACJA + PRZYWRÓCONE KOLORY POGODY
   ========================================================================== */

const API_KEY = '844de6c5a86642c882b230106260607';

/* TERMINALS CONFIG */
const TERMINALS = [
    { id: "wustermark", name: "WUSTERMARK - DE", query: "Wustermark" },
    { id: "ladyzhyn", name: "MHP LADYZHYN - UA", query: "Ladyzhyn" },
    { id: "vinnytsia", name: "YM VINNYTSIA - UA", query: "49.5821,28.8344" },
    { id: "zeebrugge", name: "ZEEBRUGGE - BE", query: "Zeebrugge" },
    { id: "rotterdam", name: "GATE ROTTERDAM - NL", query: "Rotterdam" }
];

/* ==========================================================================
   INIT
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    renderWeatherContainers();
    fetchLiveWeather();
    setInterval(fetchLiveWeather, 900000); // 15 min

    updateLiveClock();
    setInterval(updateLiveClock, 1000);

    updateOperatorDisplay();
    setInterval(updateOperatorDisplay, 1000);
});

/* ==========================================================================
   WEATHER — RENDER CONTAINERS
   ========================================================================== */

function renderWeatherContainers() {
    const grid = document.getElementById('weather-grid');
    if (!grid) return;

    grid.innerHTML = '';

    TERMINALS.forEach(t => {
        const div = document.createElement('div');
        div.className = `nav-tile weather-tile ${t.isActive ? 'highlight-tile' : ''}`;
        div.id = `tile-${t.id}`;

        div.innerHTML = `
            <div class="weather-title">${t.name}</div>
            <div id="temp-${t.id}" class="weather-temp">--</div>
            <div id="details-${t.id}" class="weather-details">Loading...</div>
        `;
        grid.appendChild(div);
    });
}

/* ==========================================================================
   WEATHER — FETCH LIVE DATA + KOLORY
   ========================================================================== */

async function fetchLiveWeather() {
    for (const t of TERMINALS) {
        try {
            const res = await fetch(`https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${t.query}`);
            const data = await res.json();

            if (!data || !data.current) {
                console.warn("Invalid weather data for:", t.id);
                continue;
            }

            const cur = data.current;
            const isDay = cur.is_day;
            const conditionText = cur.condition.text.toLowerCase();

            let iconUrl = cur.condition.icon;

            // Fallback night icon
            if (!isDay && (conditionText.includes('sun') || conditionText.includes('clear'))) {
                iconUrl = '//cdn.weatherapi.com/weather/64x64/night/113.png';
            }

            const icon = `<img src="${iconUrl}" alt="weather" style="width:50px;">`;

            const tempEl = document.getElementById(`temp-${t.id}`);
            const detailsEl = document.getElementById(`details-${t.id}`);
            const tileEl = document.getElementById(`tile-${t.id}`);

            if (!tempEl || !detailsEl || !tileEl) continue;

            /* --- KOLORY POGODY --- */
            tileEl.classList.remove(
                "weather-sunny",
                "weather-cloudy",
                "weather-rainy",
                "weather-night",
                "weather-day"
            );

            if (!isDay) {
                tileEl.classList.add("weather-night");
            } else if (conditionText.includes("sun") || conditionText.includes("clear")) {
                tileEl.classList.add("weather-sunny");
            } else if (conditionText.includes("cloud")) {
                tileEl.classList.add("weather-cloudy");
            } else if (
                conditionText.includes("rain") ||
                conditionText.includes("drizzle") ||
                conditionText.includes("shower")
            ) {
                tileEl.classList.add("weather-rainy");
            } else {
                tileEl.classList.add("weather-day");
            }

            /* --- TEMPERATURA + DETALE --- */
            tempEl.innerText = `${cur.temp_c}°C`;

            detailsEl.innerHTML = `
                <div class="weather-icon-centered">${icon}</div>
                <div class="weather-feels">Feels ${cur.feelslike_c}°C</div>
                <div class="weather-row"><span class="row-icon">💧</span><span class="row-label">Humidity</span><span class="row-value">${cur.humidity}%</span></div>
                <div class="weather-row"><span class="row-icon">⚖️</span><span class="row-label">Pressure</span><span class="row-value">${cur.pressure_mb} hPa</span></div>
                <div class="weather-row"><span class="row-icon">🌧️</span><span class="row-label">Rain</span><span class="row-value">${cur.precip_mm} mm</span></div>
                <div class="weather-row"><span class="row-icon">💨</span><span class="row-label">Wind</span><span class="row-value">${cur.wind_kph} km/h</span></div>
                <div class="weather-row"><span class="row-icon">☁️</span><span class="row-label">Clouds</span><span class="row-value">${cur.cloud}%</span></div>
            `;
        } catch (e) {
            console.error("Weather error:", e);
        }
    }
}

/* ==========================================================================
   CLOCK — CET + WEEK + WORKING DAYS
   ========================================================================== */

function updateLiveClock() {
    const now = new Date();

    const timeEl = document.getElementById('time-cet');
    const weekEl = document.getElementById('week-number');
    const workingDaysEl = document.getElementById('working-days-left');

    if (timeEl) {
        timeEl.innerText =
            now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
            ' - ' +
            now.toLocaleDateString('en-GB');
    }

    // ISO week number
    const target = new Date(now.valueOf());
    const dayNr = (now.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();

    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }

    const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);

    if (weekEl) {
        weekEl.innerText =
            'WK ' + weekNum + ' | ' +
            now.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase() +
            ' | ' + now.getFullYear();
    }

    // Working days left
    const currentDay = now.getDay();
    let daysLeft = (currentDay >= 1 && currentDay <= 5) ? (5 - currentDay + 1) : 0;

    if (workingDaysEl) {
        workingDaysEl.innerText = daysLeft;
    }
}

/* ==========================================================================
   OPERATOR SESSION
   ========================================================================== */

function updateOperatorDisplay() {
    const nameDisplay = document.getElementById('operator-name');
    const timerDisplay = document.getElementById('session-timer');

    if (!nameDisplay || !timerDisplay) return;

    const user = localStorage.getItem('currentUser');
    const loginTime = localStorage.getItem('loginTime');

    if (user && loginTime) {
        nameDisplay.innerText = user.toUpperCase();
        timerDisplay.style.display = 'block';

        const elapsed = Date.now() - parseInt(loginTime, 10);
        const totalSession = 60 * 60 * 1000; // 1h
        const remaining = totalSession - elapsed;

        if (remaining <= 0) {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('loginTime');
            updateOperatorDisplay();
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        timerDisplay.innerText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    } else {
        nameDisplay.innerText = "OPERATOR";
        timerDisplay.style.display = 'none';
    }
}


// --- MODAL POWIĘKSZANIA MAP ---
window.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('map-modal');
    const modalImg = document.getElementById('map-modal-img');
    const closeBtn = document.getElementById('map-close');

    // Jeśli elementy modala nie istnieją na danej stronie (np. na files.html), po prostu pomijamy ten fragment bez rzucania błędów
    if (!modal || !modalImg || !closeBtn) {
        return;
    }

    // otwieranie po kliknięciu na kafelki mapy
    document.querySelectorAll('.modern-3d-tile img').forEach(img => {
        img.addEventListener('click', () => {
            modalImg.src = img.src;
            modal.style.display = 'flex';
        }, { passive: true });
    });

    // zamykanie krzyżykiem
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modal.style.display = 'none';
    }, { passive: true });

    // zamykanie kliknięciem poza obrazkiem
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    }, { passive: true });
});