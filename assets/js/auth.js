/* ==========================================================================
AUTH.JS v2 — LOGIN PRZEZ POST (bez loginu/hasła w URL), CLOUD NAV, LOGOUT
========================================================================== */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwbZ_KSjyTTDM2iONJC87-jgVZysubMfKChDxDs8l1RKJgjUJ6Q2_7oA_RhuDna39Ra/exec";
/* ==========================================================================
SIDEBAR CLOUD NAVIGATION HANDLER
========================================================================== */
function handleCloudClick(event) {
  const currentUser = localStorage.getItem('currentUser');
  const isCloudPage = window.location.pathname.endsWith('cloud.html');
  if (currentUser) {
    if (isCloudPage) {
      if (event) event.preventDefault();
      const confirmLogout = confirm(`Zalogowano jako: ${currentUser.toUpperCase()}\n\nCzy chcesz się wylogować?`);
      if (confirmLogout) { logoutUser(); }
    } else {
      window.location.href = "cloud.html";
    }
  } else {
    if (event) event.preventDefault();
    openAuthPopup();
  }
}
/* ==========================================================================
POPUP OPEN / CLOSE / LOGOUT CHECK
========================================================================== */
function openAuthPopup() {
  const currentUser = localStorage.getItem('currentUser');
  if (currentUser) {
    const confirmLogout = confirm(`Zalogowano jako: ${currentUser.toUpperCase()}\n\nCzy chcesz się wylogować?`);
    if (confirmLogout) { logoutUser(); }
    return;
  }
  const popup = document.getElementById('auth-popup');
  if (popup) popup.style.display = 'flex';
}
function closeAuthPopup() {
  const popup = document.getElementById('auth-popup');
  if (popup) popup.style.display = 'none';
}
function openLoginPopup() { openAuthPopup(); }
/* ==========================================================================
LOGIN HANDLER (v2: POST, text/plain — brak preflight CORS, brak danych w URL)
========================================================================== */
function handleLogin() {
  const userEl = document.getElementById('user-login');
  const passEl = document.getElementById('user-pass');
  if (!userEl || !passEl) { alert("Login system error.\n\nMissing input fields."); return; }
  const user = userEl.value.trim();
  const pass = passEl.value.trim();
  if (!user || !pass) { alert("Missing Data\n\nPlease enter both login and password."); return; }
  fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'login', user: user, pass: pass })
  })
    .then(async response => {
      const raw = await response.text();
      let data = null;
      try { data = JSON.parse(raw); } catch (err) { alert("Login Error\n\nInvalid server response."); return; }
      if (data.success === true) {
        localStorage.setItem('currentUser', user);
        localStorage.setItem('loginTime', Date.now());
        closeAuthPopup();
        alert("Login Successful\n\nWelcome to the Command Center.");
        if (typeof updateOperatorDisplay === 'function') { updateOperatorDisplay(); }
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
  if (typeof updateOperatorDisplay === 'function') { updateOperatorDisplay(); }
  alert("Logged Out\n\nSession has been closed.");
  window.location.href = "index.html";
}
console.log("AUTH.JS v2 LOADED — POST LOGIN & SMART CLOUD NAVIGATION");