let currentDateDE = new Date();
let currentDatePL = new Date();

// NAZWY MIESIĘCY
const MONTHS_DE = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
];

const MONTHS_PL = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
];

// KONFIGURACJA NAGŁÓWKÓW
const CONFIG_DE = {
    months: MONTHS_DE,
    weekHeader: "KW",
    daysHeader: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
};

const CONFIG_PL = {
    months: MONTHS_PL,
    weekHeader: "Tyg",
    daysHeader: ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"]
};

// ALGORYTM MEEUSA/GAUSSA OBLICZANIA DATY WIELKANOCY
function getEaster(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// BAZA WSZYSTKICH ŚWIĄT (PL oraz pełne DE: federalne + kluczowe regionalne)
function getHolidaysForYear(year) {
    const holidays = {};
    const deDates = [];
    const plDates = [];

    const addHoliday = (dateStr, plName, deName, isPL, isDE) => {
        if (!holidays[dateStr]) {
            holidays[dateStr] = { pl: plName, de: deName };
        } else {
            // Jeśli wpis już istnieje, łączymy opisy w razie potrzeby
            if (plName && !holidays[dateStr].pl.includes(plName)) holidays[dateStr].pl += ` / ${plName}`;
            if (deName && !holidays[dateStr].de.includes(deName)) holidays[dateStr].de += ` / ${deName}`;
        }
        if (isPL && !plDates.includes(dateStr)) plDates.push(dateStr);
        if (isDE && !deDates.includes(dateStr)) deDates.push(dateStr);
    };

    // --- 1. ŚWIĘTA STAŁE ---
    addHoliday(`${year}-01-01`, "Nowy Rok", "Neujahr", true, true);
    addHoliday(`${year}-01-06`, "Święto Trzech Króli", "Heilige Drei Könige (Landesweit / Reg.)", true, true); // Wolne w PL i wybranych landach DE
    addHoliday(`${year}-03-08`, "Międzynarodowy Dzień Kobiet", "Internationaler Frauentag (Berlin/MV)", false, true); // Wolne w Berlinie i Mecklenburg-Vorpommern
    addHoliday(`${year}-05-01`, "Święto Pracy", "Tag der Arbeit", true, true);
    addHoliday(`${year}-05-03`, "Święto Konstytucji 3 Maja", "Polnischer Nationalfeiertag", true, false);
    addHoliday(`${year}-08-15`, "Wniebowzięcie NMP", "Mariä Himmelfahrt (Bay/Saar)", true, true);
    addHoliday(`${year}-10-03`, "Dzień Jedności Niemiec", "Tag der Deutschen Einheit", false, true);
    addHoliday(`${year}-10-31`, "Dzień Reformacji", "Reformationstag (Netzwerk DE)", false, true); // Wolne w północnych/wschodnich landach DE
    addHoliday(`${year}-11-01`, "Wszystkich Świętych", "Allerheiligen", true, true); // Wolne w PL i katolickich landach DE
    addHoliday(`${year}-11-11`, "Święto Niepodległości", "Unabhängigkeitstag Polen", true, false);
    addHoliday(`${year}-12-24`, "Wigilia Bożego Narodzenia", "Heiligabend", true, false); // Ustawowo wolne w PL
    addHoliday(`${year}-12-25`, "Boże Narodzenie (1. dzień)", "1. Weihnachtstag", true, true);
    addHoliday(`${year}-12-26`, "Boże Narodzenie (2. dzień)", "2. Weihnachtstag", true, true);

    // --- 2. ŚWIĘTA RUCHOME (WYLICZANE MATEMATYCZNIE DLA DANEGO ROKU) ---
    const easter = getEaster(year);
    const goodFriday = addDays(easter, -2);      // Wielki Piątek
    const easterSunday = easter;                 // Niedziela Wielkanocna
    const easterMonday = addDays(easter, 1);     // Poniedziałek Wielkanocny
    const ascension = addDays(easter, 39);       // Wniebowstąpienie Pańskie
    const whitsunSun = addDays(easter, 49);      // Zielone Świątki (Niedziela)
    const whitsunMon = addDays(easter, 50);      // Poniedziałek Zielonoświątkowy
    const corpusChristi = addDays(easter, 60);   // Boże Ciało

    // Dodatkowo: Buß- und Bettag (Dzień Pokuty i Modlitwy w Niemczech - środa przed 23 listopada)
    const nov23 = new Date(year, 10, 23);
    const dayOfWeekNov23 = nov23.getDay();
    const diffToWed = (dayOfWeekNov23 >= 3) ? (dayOfWeekNov23 - 3) : (dayOfWeekNov23 + 4);
    const bussUndBettag = new Date(year, 10, 23 - diffToWed);

    addHoliday(formatDateKey(goodFriday), "Wielki Piątek", "Karfreitag", false, true);
    addHoliday(formatDateKey(easterSunday), "Wielkanoc", "Ostersonntag", true, true); // W Brandenburgii w DE to też wolne
    addHoliday(formatDateKey(easterMonday), "Poniedziałek Wielkanocny", "Ostermontag", true, true);
    addHoliday(formatDateKey(ascension), "Wniebowstąpienie Pańskie", "Christi Himmelfahrt", false, true);
    addHoliday(formatDateKey(whitsunSun), "Zielone Świątki", "Pfingstsonntag", true, true);
    addHoliday(formatDateKey(whitsunMon), "Poniedziałek Zielonoświątkowy", "Pfingstmontag", false, true);
    addHoliday(formatDateKey(corpusChristi), "Boże Ciało", "Fronleichnam (Reg. DE)", true, true);
    addHoliday(formatDateKey(bussUndBettag), "Dzień Pokuty i Modlitwy", "Buß- und Bettag (Sachsen)", false, true);

    return { holidays, deDates, plDates };
}

export function initAdminCalendar() {
    renderCalendar('DE', currentDateDE, CONFIG_DE);
    renderCalendar('PL', currentDatePL, CONFIG_PL);
    setupCalendarListeners();
}

function setupCalendarListeners() {
    document.getElementById('de-prev-month')?.addEventListener('click', () => {
        currentDateDE.setMonth(currentDateDE.getMonth() - 1);
        renderCalendar('DE', currentDateDE, CONFIG_DE);
    });

    document.getElementById('de-next-month')?.addEventListener('click', () => {
        currentDateDE.setMonth(currentDateDE.getMonth() + 1);
        renderCalendar('DE', currentDateDE, CONFIG_DE);
    });

    document.getElementById('pl-prev-month')?.addEventListener('click', () => {
        currentDatePL.setMonth(currentDatePL.getMonth() - 1);
        renderCalendar('PL', currentDatePL, CONFIG_PL);
    });

    document.getElementById('pl-next-month')?.addEventListener('click', () => {
        currentDatePL.setMonth(currentDatePL.getMonth() + 1);
        renderCalendar('PL', currentDatePL, CONFIG_PL);
    });
}

function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function renderCalendar(country, dateObj, config) {
    const calendarContainer = document.getElementById(`calendar-${country.toLowerCase()}`);
    const monthLabel = document.getElementById(`${country.toLowerCase()}-current-month`);

    if (!calendarContainer || !monthLabel) return;

    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();

    const { holidays, deDates, plDates } = getHolidaysForYear(year);
    const countryHolidayDates = country === 'DE' ? deDates : plDates;

    monthLabel.innerText = `${config.months[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    let html = `
        <div class="cal-grid">
            <div class="cal-header-cell week-col">${config.weekHeader}</div>
            ${config.daysHeader.map(day => `<div class="cal-header-cell">${day}</div>`).join('')}
    `;

    let startingDayOfWeek = (firstDay.getDay() + 6) % 7;
    let weekNum = getWeekNumber(firstDay);

    html += `<div class="cal-cell week-num">${weekNum}</div>`;

    for (let i = 0; i < startingDayOfWeek; i++) {
        html += '<div class="cal-cell empty"></div>';
    }

    const today = new Date();

    for (let day = 1; day <= totalDays; day++) {
        const loopDate = new Date(year, month, day);
        const dayOfWeek = (loopDate.getDay() + 6) % 7;

        if (dayOfWeek === 0 && day !== 1) {
            weekNum = getWeekNumber(loopDate);
            html += `<div class="cal-cell week-num">${weekNum}</div>`;
        }

        const dateIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
        const isHoliday = countryHolidayDates.includes(dateIso);
        const holidayData = holidays[dateIso];

        let classes = ['cal-cell'];

        if (isToday) classes.push('today');
        if (isWeekend) classes.push('weekend');
        if (isHoliday) classes.push('holiday');

        let tooltipHtml = '';
        if (isHoliday && holidayData) {
            tooltipHtml = `<div class="tooltip">🇵🇱 ${holidayData.pl}<br>🇩🇪 ${holidayData.de}</div>`;
        }

        html += `
            <div class="${classes.join(' ')}">
                <span>${day}</span>
                ${isHoliday ? `<div class="holiday-dot"></div>${tooltipHtml}` : ''}
            </div>
        `;
    }

    html += '</div>';
    calendarContainer.innerHTML = html;
}