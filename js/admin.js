// Verwaltung: Rollen, Mitglieder (über den Bot), Entfernen mit Protokoll
const API_URL = "/api";
const TOKEN_KEY = "br_token";
const app = document.getElementById("app");

let defs = {};
let roles = [];
let editingId = null;
const M = { letter: "", q: "", items: [], hasMore: false, total: 0, busy: false, lastSynced: null };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const t = getToken();
  if (t) headers.Authorization = "Bearer " + t;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API_URL + path, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data: data || {} };
}
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}
const ERRORS = {
  invalid_name: "Der Name ist ungültig (1 bis 32 Zeichen).",
  invalid_color: "Die Farbe ist ungültig.",
  invalid_permission: "Ein Recht ist ungültig.",
  cannot_grant_admin: "Nur Admins dürfen das Recht „admin“ vergeben oder entfernen.",
  forbidden: "Dafür fehlt dir die Berechtigung.",
  not_logged_in: "Bitte zuerst anmelden.",
  invalid_query: "Die Suche enthält ungültige Zeichen.",
  bot_token_missing: "Der Bot-Token fehlt noch in den Cloudflare-Einstellungen.",
  discord_members_403: "Der Bot darf die Mitgliederliste nicht lesen. Bitte „Server Members Intent“ prüfen.",
  discord_members_401: "Der Bot-Token ist ungültig.",
};
function errText(d) {
  const e = d && d.error;
  if (e && e.startsWith("discord_members_") && !ERRORS[e]) return "Die Mitgliederliste konnte nicht geladen werden.";
  return ERRORS[e] || "Es ist ein Fehler aufgetreten.";
}
function avatarUrl(u) {
  return u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;
}

// ---------- Aufbau ----------
async function init() {
  const me = await api("/me").catch(() => ({ data: {} }));
  const perms = (me.data && me.data.permissions) || [];
  if (!me.data || !me.data.loggedIn) {
    app.innerHTML = `<div class="card"><p>Bitte zuerst mit Discord anmelden.</p>
      <p><a class="btn" href="verify.html">Zur Anmeldung</a></p></div>`;
    return;
  }
  if (!perms.includes("admin") && !perms.includes("roles.manage")) {
    app.innerHTML = `<div class="card"><p>Du hast keinen Zugriff auf diesen Bereich.</p></div>`;
    return;
  }
  const p = await api("/admin/permissions");
  defs = (p.data && p.data.permissions) || {};

  app.innerHTML = `
    <div class="admin-grid">
      <section class="card">
        <h2>Rollen</h2>
        <div id="roles" class="role-list"></div>
        <h3 id="form-title">Neue Rolle</h3>
        <form id="role-form" class="role-form">
          <label>Name <input id="role-name" maxlength="32" required placeholder="z. B. Demonlist Helper"></label>
          <label>Farbe <input id="role-color" type="color" value="#8b5cf6"></label>
          <fieldset>
            <legend>Rechte</legend>
            ${Object.entries(defs).map(([key, label]) => `
              <label class="check">
                <input type="checkbox" name="perm" value="${esc(key)}">
                <span><strong>${esc(key)}</strong><br><small>${esc(label)}</small></span>
              </label>`).join("")}
          </fieldset>
          <div class="form-actions">
            <button class="btn" type="submit" id="role-save">Rolle speichern</button>
            <button class="btn ghost" type="button" id="role-cancel" hidden>Abbrechen</button>
          </div>
          <p id="role-msg" class="hint"></p>
        </form>
      </section>

      <section class="card">
        <div class="m-head">
          <h2>Mitglieder</h2>
          <button class="chip-btn" id="msync" type="button">Mitglieder aktualisieren</button>
        </div>
        <p class="hint" id="mstamp"></p>
        <div class="letters" id="letters"></div>
        <input id="q" class="search" type="search" placeholder="Name suchen …" autocomplete="off">
        <p class="hint" id="mcount"></p>
        <div id="mlist" class="results"></div>
        <div class="form-actions"><button class="btn ghost" id="mmore" type="button" hidden>Mehr laden</button></div>
      </section>
    </div>

    <section class="card" id="dmap-card">
      <h2>Discord-Rollen übernehmen</h2>
      <p class="hint">Ordne jeder Discord-Rolle eine Seiten-Rolle zu. Mitglieder bekommen sie beim Synchronisieren automatisch und verlieren sie, wenn die Discord-Rolle entfernt wird. Rollen ohne Rechte werden als Tag auf dem Profil angezeigt.</p>
      <div id="dmap-list" class="role-list"><p class="hint">Lädt …</p></div>
      <div class="form-actions"><button class="btn" type="button" id="dmap-save">Zuordnung speichern</button></div>
      <p class="hint" id="dmap-msg"></p>
    </section>

    <section class="card">
      <h2>Protokoll</h2>
      <p class="hint">Wer hat wann welche Rolle vergeben oder entfernt.</p>
      <div id="audit" class="audit-list"><p class="hint">Lädt …</p></div>
    </section>`;

  bindRoleForm();
  bindMembers();
  renderLetters();
  await loadRoles();
  await loadDiscordMap();
  await loadMembers(true);
  if (!M.lastSynced) await syncMembers();
  await loadAudit();
}

// ---------- Rollen ----------
async function loadRoles() {
  const r = await api("/admin/roles");
  roles = (r.data && r.data.roles) || [];
  const box = document.getElementById("roles");
  box.innerHTML = roles.length
    ? roles.map((role) => `
      <div class="role-row">
        <span class="dot" style="background:${esc(role.color)}"></span>
        <div class="role-info">
          <strong>${esc(role.name)}</strong>
          <small>${(role.permissions || []).map(esc).join(", ") || "keine Rechte"}</small>
        </div>
        <button class="chip-btn" data-edit="${esc(role.id)}">Bearbeiten</button>
        <button class="chip-btn danger" data-delete="${esc(role.id)}">Löschen</button>
      </div>`).join("")
    : '<p class="hint">Noch keine Rollen angelegt.</p>';
  if (M.items.length) renderMembers();
}

function bindRoleForm() {
  const form = document.getElementById("role-form");
  const msg = document.getElementById("role-msg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const perms = [...form.querySelectorAll('input[name="perm"]:checked')].map((i) => i.value);
    const body = {
      name: document.getElementById("role-name").value.trim(),
      color: document.getElementById("role-color").value,
      permissions: perms,
    };
    const res = editingId
      ? await api(`/admin/roles/${editingId}`, { method: "PUT", body })
      : await api("/admin/roles", { method: "POST", body });
    if (!res.ok) { msg.textContent = errText(res.data); return; }
    msg.textContent = editingId ? "Rolle gespeichert." : "Rolle angelegt.";
    resetRoleForm();
    await loadRoles();
  });
  document.getElementById("role-cancel").addEventListener("click", () => {
    resetRoleForm();
    msg.textContent = "";
  });
  document.getElementById("roles").addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-delete]");
    if (editBtn) {
      const role = roles.find((r) => r.id === editBtn.dataset.edit);
      if (!role) return;
      editingId = role.id;
      document.getElementById("form-title").textContent = "Rolle bearbeiten";
      document.getElementById("role-name").value = role.name;
      document.getElementById("role-color").value = role.color;
      form.querySelectorAll('input[name="perm"]').forEach((i) => {
        i.checked = (role.permissions || []).includes(i.value);
      });
      document.getElementById("role-save").textContent = "Änderungen speichern";
      document.getElementById("role-cancel").hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (delBtn) {
      const role = roles.find((r) => r.id === delBtn.dataset.delete);
      if (!role || !confirm(`Rolle „${role.name}“ wirklich löschen? Sie wird allen Mitgliedern entzogen.`)) return;
      const res = await api(`/admin/roles/${role.id}`, { method: "DELETE" });
      if (!res.ok) { msg.textContent = errText(res.data); return; }
      await loadRoles();
    }
  });
}
function resetRoleForm() {
  editingId = null;
  const form = document.getElementById("role-form");
  form.reset();
  document.getElementById("role-color").value = "#8b5cf6";
  document.getElementById("form-title").textContent = "Neue Rolle";
  document.getElementById("role-save").textContent = "Rolle speichern";
  document.getElementById("role-cancel").hidden = true;
}

// ---------- Discord-Rollen-Zuordnung ----------
async function loadDiscordMap() {
  const box = document.getElementById("dmap-list");
  const [dr, mp] = await Promise.all([api("/admin/discord-roles"), api("/admin/discord-map")]);
  if (!dr.ok) { box.innerHTML = `<p class="hint">${esc(errText(dr.data))}</p>`; return; }
  const current = Object.fromEntries(((mp.data && mp.data.mapping) || []).map((x) => [x.discord_role_id, x.site_role_id]));
  const options = `<option value="">– keine Zuordnung –</option>` + roles.map((r) =>
    `<option value="${esc(r.id)}">${esc(r.name)}${r.weight === 0 ? " (Tag)" : ""}</option>`).join("");
  box.innerHTML = (dr.data.roles || []).map((d) => `
    <div class="role-row">
      <span class="dot" style="background:${esc(d.color)}"></span>
      <div class="role-info"><strong>${esc(d.name)}</strong></div>
      <select class="role-form-select" data-discord="${esc(d.id)}">${options.replace(`value="${esc(current[d.id] || "")}"`, `value="${esc(current[d.id] || "")}" selected`)}</select>
    </div>`).join("") || '<p class="hint">Keine Discord-Rollen gefunden.</p>';
  box.querySelectorAll("select[data-discord]").forEach((sel) => {
    sel.value = current[sel.dataset.discord] || "";
  });
  document.getElementById("dmap-save").onclick = async () => {
    const mapping = [...box.querySelectorAll("select[data-discord]")]
      .filter((sel) => sel.value)
      .map((sel) => ({ discordRoleId: sel.dataset.discord, siteRoleId: sel.value }));
    const r = await api("/admin/discord-map", { method: "PUT", body: { mapping } });
    document.getElementById("dmap-msg").textContent = r.ok ? `Gespeichert (${r.data.count} Zuordnungen).` : errText(r.data);
  };
}

// ---------- Mitglieder ----------
function renderLetters() {
  document.getElementById("letters").innerHTML = `
    <button class="chip-btn ${!M.letter ? "on" : ""}" type="button" data-letter="">Alle</button>` +
    LETTERS.map((l) => `<button class="chip-btn ${M.letter === l ? "on" : ""}" type="button" data-letter="${l}">${l}</button>`).join("");
}

async function loadMembers(reset) {
  if (M.busy) return;
  M.busy = true;
  if (reset) M.items = [];
  const params = new URLSearchParams({ offset: String(M.items.length), limit: "50" });
  if (M.q) params.set("q", M.q);
  if (M.letter) params.set("letter", M.letter);
  const r = await api(`/admin/members?${params}`);
  M.busy = false;
  if (!r.ok) {
    document.getElementById("mlist").innerHTML = `<p class="hint">${esc(errText(r.data))}</p>`;
    return;
  }
  M.items = M.items.concat(r.data.members || []);
  M.hasMore = !!r.data.hasMore;
  M.total = r.data.total || 0;
  M.lastSynced = r.data.lastSynced || null;
  document.getElementById("mstamp").textContent = M.lastSynced
    ? `Stand: ${new Date(M.lastSynced).toLocaleString("de-DE")}`
    : "Noch nicht synchronisiert.";
  renderMembers();
}

function renderMembers() {
  const box = document.getElementById("mlist");
  if (!roles.length) { box.innerHTML = '<p class="hint">Lege zuerst eine Rolle an.</p>'; return; }
  if (!M.items.length) {
    box.innerHTML = '<p class="hint">Keine Treffer.</p>';
  } else {
    box.innerHTML = M.items.map((u) => `
      <div class="member">
        <img src="${esc(avatarUrl(u))}" alt="" width="40" height="40">
        <div class="member-body">
          <div class="m-name"><strong>${esc(u.name)}</strong>${u.gdName ? `<small class="gd-tag">GD: ${esc(u.gdName)}</small>` : ""}</div>
          <div class="chips">
            ${roles.map((r) => {
              const on = (u.roleIds || []).includes(r.id);
              return `<button class="chip-btn ${on ? "on" : ""}" type="button" data-user="${esc(u.discord_id)}"
                data-role-toggle="${esc(r.id)}" style="--c:${esc(r.color)}">${esc(r.name)}${on ? ' <span class="x" aria-hidden="true">✕</span>' : ""}</button>`;
            }).join("")}
            ${(u.roleIds || []).length ? `<button class="chip-btn danger" type="button" data-clear="${esc(u.discord_id)}">Alle entfernen</button>` : ""}
          </div>
        </div>
      </div>`).join("");
  }
  document.getElementById("mcount").textContent = `${M.items.length} von ${M.total} Mitgliedern`;
  document.getElementById("mmore").hidden = !M.hasMore;
}

async function syncMembers() {
  const btn = document.getElementById("msync");
  btn.disabled = true;
  btn.textContent = "Wird aktualisiert …";
  const r = await api("/admin/members/sync", { method: "POST" });
  btn.disabled = false;
  btn.textContent = "Mitglieder aktualisieren";
  if (!r.ok) { alert(errText(r.data)); return false; }
  await loadMembers(true);
  return true;
}

function bindMembers() {
  document.getElementById("letters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-letter]");
    if (!b) return;
    M.letter = b.dataset.letter;
    renderLetters();
    loadMembers(true);
  });
  let timer = null;
  document.getElementById("q").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { M.q = e.target.value.trim(); loadMembers(true); }, 300);
  });
  document.getElementById("msync").addEventListener("click", () => syncMembers());
  document.getElementById("mmore").addEventListener("click", () => loadMembers(false));

  document.getElementById("mlist").addEventListener("click", async (e) => {
    const clear = e.target.closest("[data-clear]");
    const t = e.target.closest("[data-role-toggle]");
    if (clear) {
      const u = M.items.find((x) => x.discord_id === clear.dataset.clear);
      if (!u || !confirm(`Alle Ränge von ${u.name} entfernen?`)) return;
      for (const roleId of [...(u.roleIds || [])]) {
        const r = await api(`/admin/users/${u.discord_id}/roles/${roleId}`, { method: "DELETE" });
        if (!r.ok) { alert(errText(r.data)); break; }
        u.roleIds = u.roleIds.filter((x) => x !== roleId);
      }
      renderMembers();
      loadAudit();
      return;
    }
    if (!t) return;
    const u = M.items.find((x) => x.discord_id === t.dataset.user);
    if (!u) return;
    const roleId = t.dataset.roleToggle;
    const has = (u.roleIds || []).includes(roleId);
    const role = roles.find((r) => r.id === roleId);
    if (has && !confirm(`Rang „${role ? role.name : ""}“ von ${u.name} entfernen?`)) return;
    const r = has
      ? await api(`/admin/users/${u.discord_id}/roles/${roleId}`, { method: "DELETE" })
      : await api(`/admin/users/${u.discord_id}/roles`, { method: "POST", body: { roleId } });
    if (!r.ok) { alert(errText(r.data)); return; }
    u.roleIds = has ? u.roleIds.filter((x) => x !== roleId) : [...(u.roleIds || []), roleId];
    renderMembers();
    loadAudit();
  });
}

// ---------- Protokoll ----------
async function loadAudit() {
  const box = document.getElementById("audit");
  if (!box) return;
  const r = await api("/admin/audit?limit=30");
  if (!r.ok) { box.innerHTML = `<p class="hint">${esc(errText(r.data))}</p>`; return; }
  const entries = (r.data && r.data.entries) || [];
  box.innerHTML = entries.length
    ? entries.map((x) => {
        const add = x.action === "add";
        return `<div class="audit-row ${add ? "add" : "remove"}">
          <span class="sign">${add ? "+" : "−"}</span>
          <div>
            <strong>${esc(x.actor_name || "Unbekannt")}</strong>
            ${add ? "hat" : "hat entfernt:"} <strong>${esc(x.role_name || "?")}</strong>
            ${add ? "an" : "von"} <strong>${esc(x.target_name || x.target_discord_id)}</strong>
            <small>${esc(new Date(x.created_at).toLocaleString("de-DE"))}</small>
          </div>
        </div>`;
      }).join("")
    : '<p class="hint">Noch keine Einträge.</p>';
}

init();
