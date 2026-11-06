// API läuft unter derselben Domain, unter /api
const API_URL = "/api";
const box = document.getElementById("box");

// Sitzungsschlüssel im Browser speichern (localStorage), nicht als Cookie
const TOKEN_KEY = "br_token";
function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch {}
}
function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

// Nach der Discord-Anmeldung kommt der Schlüssel im Fragment (#token=...)
(function takeTokenFromHash() {
  const m = location.hash.match(/token=([a-f0-9]{64})/);
  if (m) {
    setToken(m[1]);
    history.replaceState(null, "", location.pathname);
  }
})();

const api = (path, opts = {}) => {
  const headers = { ...(opts.headers || {}) };
  const t = getToken();
  if (t) headers.Authorization = "Bearer " + t;
  return fetch(API_URL + path, { ...opts, headers }).then(r => r.json());
};

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function render() {
  const me = await api("/me").catch(() => ({ loggedIn: false }));
  if (!me.loggedIn) clearToken();

  if (!me.loggedIn) {
    box.innerHTML = `
      <h2>Schritt 1: Mit Discord anmelden</h2>
      <p>Melde dich mit deinem Discord-Konto an, damit wir deinen GD-Account dort verknüpfen können.</p>
      <p><a class="btn" href="${API_URL}/auth/discord">Mit Discord anmelden</a></p>`;
    return;
  }

  if (me.gdName) {
    box.innerHTML = `
      <h2>Verknüpft</h2>
      <p>Dein Discord-Konto ist mit dem GD-Account <strong>${esc(me.gdName)}</strong> verbunden.</p>
      <p><a href="#" id="logout">Abmelden</a></p>`;
    document.getElementById("logout").addEventListener("click", (e) => {
      e.preventDefault();
      clearToken();
      render();
    });
    return;
  }

  box.innerHTML = `
    <h2>Schritt 2: GD-Account verknüpfen</h2>
    <p>Angemeldet als <strong>${esc(me.discordName)}</strong>.</p>
    <button class="btn" id="start">Code erzeugen</button>
    <div id="code"></div>`;

  document.getElementById("start").addEventListener("click", startVerify);
}

async function startVerify() {
  const data = await api("/verify/start", { method: "POST" });
  const out = document.getElementById("code");
  out.innerHTML = `
    <p>Kommentiere unter diesem Level folgenden Code:</p>
    <p class="code">${esc(data.code)}</p>
    <p class="hint">Level-ID: ${esc(data.levelId)} · gültig ${data.expiresInMinutes} Minuten</p>
    <button class="btn" id="check">Ich habe kommentiert</button>
    <p id="result"></p>`;
  document.getElementById("check").addEventListener("click", checkVerify);
}

async function checkVerify() {
  const res = document.getElementById("result");
  res.textContent = "Prüfe …";
  const data = await api("/verify/check", { method: "POST" });
  if (data.verified) {
    res.textContent = `Erfolgreich verknüpft mit ${data.gdName}.`;
    setTimeout(render, 1200);
  } else {
    const msg = {
      not_found: "Kommentar noch nicht gefunden. Bitte kurz warten und erneut prüfen.",
      code_expired: "Der Code ist abgelaufen. Bitte erzeuge einen neuen.",
      no_code: "Es gibt keinen aktiven Code. Bitte erzeuge einen neuen.",
      account_already_linked: "Dieser GD-Account ist bereits mit einem anderen Discord-Konto verknüpft.",
    }[data.reason || data.error] || "Es ist ein Fehler aufgetreten.";
    res.textContent = msg;
  }
}

render();
