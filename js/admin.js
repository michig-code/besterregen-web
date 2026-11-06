// API-Adresse (gleiche Domain, Pfad /api)
const API_URL = "/api";
const TOKEN_KEY = "br_token";
const app = document.getElementById("app");

let defs = {};     // Rechte-Beschreibungen vom Server
let roles = [];    // alle Rollen
let editingId = null;
let searchTimer = null;

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
  cannot_grant_admin: "Nur Admins dürfen das Recht „admin“ vergeben.",
  forbidden: "Dafür fehlt dir die Berechtigung.",
  not_logged_in: "Bitte zuerst anmelden.",
  invalid_query: "Die Suche enthält ungültige Zeichen.",
};
const errText = (d) => ERRORS[d && d.error] || "Es ist ein Fehler aufgetreten.";

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
    app.innerHTML = `
      <div class="card">
        <p>Bitte zuerst mit Discord anmelden.</p>
        <p><a class="btn" href="verify.html">Zur Anmeldung</a></p>
      </div>`;
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
          <label>Name
            <input id="role-name" maxlength="32" required placeholder="z. B. Demonlist Helper">
          </label>
          <label>Farbe
            <input id="role-color" type="color" value="#8b5cf6">
          </label>
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
        <h2>Mitglieder</h2>
        <input id="q" class="search" type="search" placeholder="Name suchen …" autocomplete="off">
        <div id="results" class="results"></div>
        <p class="hint">Gefunden werden Personen, die sich schon einmal auf der Seite angemeldet haben.</p>
      </section>
    </div>`;

  bindRoleForm();
  bindSearch();
  await loadRoles();
}

// ---------- Rollen ----------

async function loadRoles() {
  const r = await api("/admin/roles");
  roles = (r.data && r.data.roles) || [];
  const box = document.getElementById("roles");
  if (!roles.length) {
    box.innerHTML = `<p class="hint">Noch keine Rollen angelegt.</p>`;
  } else {
    box.innerHTML = roles.map((role) => `
      <div class="role-row">
        <span class="dot" style="background:${esc(role.color)}"></span>
        <div class="role-info">
          <strong>${esc(role.name)}</strong>
          <small>${(role.permissions || []).map(esc).join(", ") || "keine Rechte"}</small>
        </div>
        <button class="chip-btn" data-edit="${esc(role.id)}">Bearbeiten</button>
        <button class="chip-btn danger" data-delete="${esc(role.id)}">Löschen</button>
      </div>`).join("");
  }
  // Mitglieder-Ansicht aktualisieren, falls schon gesucht wurde
  const q = document.getElementById("q").value.trim();
  if (q) searchMembers(q);
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
    document.getElementById("role-msg").textContent = "";
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

// ---------- Mitglieder ----------

function bindSearch() {
  const input = document.getElementById("q");
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    searchTimer = setTimeout(() => {
      if (!q) { document.getElementById("results").innerHTML = ""; return; }
      searchMembers(q);
    }, 300);
  });

  document.getElementById("results").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-role-toggle]");
    if (!btn) return;
    const userId = btn.dataset.user;
    const roleId = btn.dataset.roleToggle;
    const has = btn.classList.contains("on");
    const res = has
      ? await api(`/admin/users/${userId}/roles/${roleId}`, { method: "DELETE" })
      : await api(`/admin/users/${userId}/roles`, { method: "POST", body: { roleId } });
    if (!res.ok) { alert(errText(res.data)); return; }
    searchMembers(document.getElementById("q").value.trim());
  });
}

async function searchMembers(q) {
  const box = document.getElementById("results");
  const res = await api(`/admin/users?q=${encodeURIComponent(q)}`);
  if (!res.ok) { box.innerHTML = `<p class="hint">${esc(errText(res.data))}</p>`; return; }
  const users = (res.data && res.data.users) || [];
  if (!users.length) { box.innerHTML = `<p class="hint">Keine Treffer.</p>`; return; }
  if (!roles.length) { box.innerHTML = `<p class="hint">Lege zuerst eine Rolle an.</p>`; return; }

  box.innerHTML = users.map((u) => `
    <div class="member">
      <img src="${esc(avatarUrl(u))}" alt="" width="40" height="40">
      <div class="member-body">
        <strong>${esc(u.name)}</strong>
        <div class="chips">
          ${roles.map((r) => {
            const on = (u.roleIds || []).includes(r.id);
            return `<button class="chip-btn ${on ? "on" : ""}" data-user="${esc(u.discord_id)}"
              data-role-toggle="${esc(r.id)}" style="--c:${esc(r.color)}">${esc(r.name)}</button>`;
          }).join("")}
        </div>
      </div>
    </div>`).join("");
}

init();
