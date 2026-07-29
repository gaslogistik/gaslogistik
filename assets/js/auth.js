/* ==========================================================================
   AUTH.JS — AUDYT + LOGOUT & PREVENT DOUBLE LOGIN
   ========================================================================== */

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec";

/* ==========================================================================
   POPUP OPEN / CLOSE / LOGOUT CHECK
   ========================================================================== */

/**
 * Otwiera popup logowania lub proponuje wylogowanie, jeśli użytkownik jest już zalogowany.
 */
function openAuthPopup() {
    const currentUser = localStorage.getItem('currentUser');

    // Jeśli użytkownik jest już zalogowany, pytamy o wylogowanie
    if (currentUser) {
        const confirmLogout = confirm(`Zalogowano jako: ${currentUser.toUpperCase()}\n\nCzy chcesz się wylogować?`);
        if (confirmLogout) {
            logoutUser();
        }
        return; // Nie otwieramy modala logowania!
    }

    // Jeśli nie jest zalogowany, otwieramy modal z formularzem
    const popup = document.getElementById('auth-popup');
    if (popup) popup.style.display = 'flex';
}

function closeAuthPopup() {
    const popup = document.getElementById('auth-popup');
    if (popup) popup.style.display = 'none';
}

/* ==========================================================================
   OPERATOR ICONS → OPEN POPUP / LOGOUT
   ========================================================================== */

function openLoginPopup() {
    openAuthPopup();
}

/* ==========================================================================
   LOGIN HANDLER
   ========================================================================== */

function handleLogin() {
    const userEl = document.getElementById('user-login');
    const passEl = document.getElementById('user-pass');

    if (!userEl || !passEl) {
        alert("Login system error.\n\nMissing input fields.");
        return;
    }

    const user = userEl.value.trim();
    const pass = passEl.value.trim();

    if (!user || !pass) {
        alert("Missing Data\n\nPlease enter both login and password.");
        return;
    }

    fetch(`${SCRIPT_URL}?action=login&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}`)
        .then(async response => {
            const raw = await response.text();
            console.log("RAW:", raw);

            let data = null;

            try {
                data = JSON.parse(raw);
            } catch (err) {
                alert("Login Error\n\nInvalid server response.");
                return;
            }

            console.log("JSON:", data);

            if (data.success === true) {
                localStorage.setItem('currentUser', user);
                localStorage.setItem('loginTime', Date.now());

                closeAuthPopup();
                alert("Login Successful\n\nWelcome to the Command Center.");

                if (typeof updateOperatorDisplay === 'function') {
                    updateOperatorDisplay();
                }

                /* Redirect do odpowiedniej strony po logowaniu */
                window.location.href = "cloud.html";

            } else {
                alert("Access Denied\n\nInvalid username or password.");
            }
        })
        .catch(error => {
            console.error("FETCH ERROR:", error);
            alert("Connection Error\n\nUnable to reach the server.");
        });
}

/* ==========================================================================
   LOGOUT
   ========================================================================== */

function logoutUser() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('loginTime');

    if (typeof updateOperatorDisplay === 'function') {
        updateOperatorDisplay();
    }

    alert("Logged Out\n\nSession has been closed.");

    // Przekierowanie na stronę główną/admin po wylogowaniu
    window.location.href = "admin.html";
}

/* ==========================================================================
   DEBUG
   ========================================================================== */

console.log("AUTH.JS LOADED WITH LOGOUT & PREVENT RE-LOGIN");