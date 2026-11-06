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


  // ---------- Glocke & Benachrichtigungen ----------
  const BELL_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>';
  function bellHtml() {
    return `<div class="bell-wrap">
      <button class="bell" id="bell-btn" type="button" aria-label="Benachrichtigungen" aria-expanded="false">${BELL_SVG}<span class="badge" id="bell-count" hidden>0</span></button>
      <div class="bell-panel" id="bell-panel" hidden>
        <div class="bp-head"><strong>Benachrichtigungen</strong></div>
        <div class="bp-list" id="bell-list"><p class="hint">Lädt …</p></div>
      </div>
    </div>`;
  }
  function authHeaders() {
    const h = {};
    if (token()) h.Authorization = "Bearer " + token();
    return h;
  }
  let seen = null; // IDs, die schon bekannt sind (nur neue lösen Browser-Benachrichtigungen aus)
  const TYPE_ICON = { level_submitted: "📝", record_submitted: "🎥", level_accepted: "✅", record_approved: "🏆", level_rejected: "⛔", record_rejected: "⛔" };
  async function pollNotes() {
    if (document.visibilityState !== "visible") return;
    const btn = document.getElementById("bell-btn");
    if (!btn) return;
    let d;
    try {
      const r = await fetch(API + "/notifications", { headers: authHeaders(), credentials: "include" });
      if (!r.ok) return;
      d = await r.json();
    } catch { return; }
    const items = d.items || [];
    const count = document.getElementById("bell-count");
    const unread = d.unread || 0;
    count.hidden = unread === 0;
    count.textContent = unread > 9 ? "9+" : String(unread);
    const list = document.getElementById("bell-list");
    list.innerHTML = items.length
      ? items.map((n) => `
          <a class="bp-item ${n.read ? "" : "unread"}" href="${esc(n.link || "index.html")}">
            <span class="bp-icon">${TYPE_ICON[n.type] || "🔔"}</span>
            <span class="bp-text"><strong>${esc(n.title)}</strong>${n.body ? `<small>${esc(n.body)}</small>` : ""}</span>
          </a>`).join("")
      : '<p class="hint">Noch keine Benachrichtigungen.</p>';
    // Browser-Benachrichtigung nur für wirklich neue, ungelesene Einträge
    const ids = new Set(items.map((i) => i.id));
    if (seen !== null && "Notification" in window && Notification.permission === "granted") {
      items.filter((i) => !seen.has(i.id) && !i.read).forEach((i) => {
        try { new Notification(i.title, { body: i.body || "", tag: i.id }); } catch {}
      });
    }
    seen = ids;
  }
  function setupBell() {
    const btn = document.getElementById("bell-btn");
    const panel = document.getElementById("bell-panel");
    if (!btn || btn.dataset.ready) return;
    btn.dataset.ready = "1";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      if (open) {
        try { await fetch(API + "/notifications/read-all", { method: "POST", headers: authHeaders(), credentials: "include" }); } catch {}
        document.getElementById("bell-count").hidden = true;
      }
    });
    document.addEventListener("click", (e) => {
      if (!panel.contains(e.target) && e.target !== btn) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    });
    pollNotes();
  }
  let pollStarted = false;
  function startPolling() {
    if (pollStarted) return;
    pollStarted = true;
    setInterval(pollNotes, 30000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pollNotes(); });
  }
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
      ${bellHtml()}
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
    setupBell();
    startPolling();
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
