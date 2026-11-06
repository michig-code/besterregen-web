// Profil-Menü oben rechts: liest den Login-Status aus der Datenbank (über /api/me)
(function () {
  const API = "/api";
  const KEY = "br_token";
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };
  const token = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

  // Antwort kurz im Browser merken, damit das Profil beim Neuladen sofort erscheint
  const CACHE_KEY = "br_me";
  const CACHE_MS = 10 * 60 * 1000;
  function readCache() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      return c && Date.now() - c.at < CACHE_MS ? c.data : null;
    } catch { return null; }
  }
  function writeCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch {}
  }
  function clearCache() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch {}
  }
  async function fetchMe() {
    const h = {};
    if (token()) h.Authorization = "Bearer " + token();
    try {
      const r = await fetch(API + "/me", { headers: h, credentials: "include" });
      return await r.json();
    } catch { return { loggedIn: false }; }
  }

  const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";
  const MOD = ["submissions.review", "lists.manage", "notifications.manage"];

  let shownKey = "";
  function paint(slot, m) {
    const key = JSON.stringify(m);
    if (key === shownKey) return; // nichts geändert, nichts neu zeichnen
    shownKey = key;
    drawSlot(slot, m);
  }

  async function render() {
    const slot = document.getElementById("user-slot");
    if (!slot) return;
    const cached = readCache();
    if (cached) paint(slot, cached);
    const m = await fetchMe();
    if (m && m.loggedIn !== undefined) writeCache(m);
    paint(slot, m);
  }

  function drawSlot(slot, m) {
    if (!m.loggedIn) {
      slot.innerHTML = '<a class="btn small" href="verify.html">Anmelden</a>';
      return;
    }
    const perms = m.permissions || [];
    const isAdmin = perms.includes("admin");
    const isMod = isAdmin || MOD.some((p) => perms.includes(p));
    const canRoles = isAdmin || perms.includes("roles.manage");
    slot.innerHTML = `
      <div class="user-menu">
        <button class="user-btn" aria-haspopup="true" aria-expanded="false">
          <img src="${esc(m.avatar || DEFAULT_AVATAR)}" alt="" width="34" height="34" onerror="this.onerror=null;this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
          <span>${esc(m.discordName)}</span>
        </button>
        <div class="user-dropdown" hidden>
          <div class="ud-head">
            <strong>${esc(m.discordName)}</strong>
            <small>${m.gdName ? "GD: " + esc(m.gdName) : "GD-Account nicht verknüpft"}</small>
          </div>
          <a href="settings.html">Einstellungen</a>
          <a href="support.html">Support</a>
          ${isMod || canRoles ? '<div class="ud-group">Verwaltung</div>' : ""}
          ${isMod ? '<a href="mod.html">Moderation</a>' : ""}
          ${canRoles ? '<a href="admin.html">Rollen &amp; Mitglieder</a>' : ""}
          <button class="ud-logout" type="button">Abmelden</button>
        </div>
      </div>`;

    const menu = slot.querySelector(".user-menu");
    const btn = slot.querySelector(".user-btn");
    const dd = slot.querySelector(".user-dropdown");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = dd.hidden;
      dd.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target)) { dd.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    });
    slot.querySelector(".ud-logout").addEventListener("click", async () => {
      try {
        await fetch(API + "/logout", { method: "POST", headers: token() ? { Authorization: "Bearer " + token() } : {}, credentials: "include" });
      } catch {}
      try { localStorage.removeItem(KEY); } catch {}
      clearCache();
      location.href = "index.html";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
