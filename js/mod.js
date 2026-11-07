// Moderation: Warteschlange, Listen-Reihenfolge, Discord-Benachrichtigungen
const app = document.getElementById("app");
let perms = [];
let lists = [];
let queue = { levels: [], records: [] };

const EVENT_LABELS = {
  level_submitted: "Neues Level eingesendet",
  record_submitted: "Neuer Record eingesendet",
  level_accepted: "Level angenommen",
  record_approved: "Record bestätigt",
};

async function init() {
  const me = await api("/me").catch(() => ({ data: {} }));
  if (!me.data || !me.data.loggedIn) {
    app.innerHTML = `<div class="card"><p>Bitte zuerst anmelden.</p><p><a class="btn" href="verify.html">Zur Anmeldung</a></p></div>`;
    return;
  }
  perms = me.data.permissions || [];
  const can = (p) => perms.includes("admin") || perms.includes(p);
  const tabs = [];
  if (can("submissions.review")) tabs.push(["queue", "Warteschlange"]);
  if (can("lists.manage")) tabs.push(["lists", "Listen & Reihenfolge"]);
  if (can("notifications.manage")) tabs.push(["notify", "Discord-Benachrichtigungen"]);
  if (!tabs.length) { app.innerHTML = `<div class="card"><p>Du hast keinen Zugriff auf diesen Bereich.</p></div>`; return; }

  app.innerHTML = `
    <div class="tabs-row">${tabs.map(([k, l], i) => `<button class="chip-btn ${i === 0 ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}</div>
    <div id="panel"></div>`;
  app.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    app.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
    openTab(b.dataset.tab);
  }));
  openTab(tabs[0][0]);
}

function openTab(name) {
  if (name === "queue") return renderQueue();
  if (name === "lists") return renderLists();
  if (name === "notify") return renderNotify();
}

// ---------- Warteschlange ----------
async function renderQueue() {
  const panel = document.getElementById("panel");
  panel.innerHTML = '<p class="status">Lädt …</p>';
  const [q, l] = await Promise.all([api("/mod/queue"), api("/lists")]);
  if (!q.ok) { panel.innerHTML = `<p class="status">${esc(errText(q.data))}</p>`; return; }
  queue = q.data;
  lists = (l.data && l.data.lists) || [];

  if (!queue.levels.length && !queue.records.length) {
    panel.innerHTML = '<div class="card"><p>Alles erledigt. Keine offenen Einsendungen.</p></div>';
    return;
  }

  panel.innerHTML = `
    <h2>Level (${queue.levels.length})</h2>
    <div class="queue">
      ${queue.levels.map((s) => {
        const list = lists.find((x) => x.id === s.list_id);
        return `
        <article class="card queue-item">
          ${s.image_url ? `<img src="${esc(s.image_url)}" alt="" class="thumb">` : ""}
          <div class="queue-body">
            <strong>${esc(s.name)}</strong>
            <small>von ${esc(s.creator)} · verifiziert von ${esc(s.verifier)} · ${esc(s.duration_seconds)} s · Level-ID ${esc(s.gd_level_id)}</small>
            <small>Liste: ${esc(list ? list.name : "?")} · eingesendet von ${esc(s.submitter_name || "?")}</small>
            <small><a href="${esc(s.video_url)}" target="_blank" rel="noopener">Video öffnen</a></small>
            <div class="form-actions">
              <label class="inline">Platz <input type="number" min="1" value="" data-pos="${esc(s.id)}" placeholder="Ende"></label>
              <button class="btn" data-accept="${esc(s.id)}">Annehmen</button>
              <button class="btn ghost danger-btn" data-reject-level="${esc(s.id)}">Ablehnen</button>
            </div>
          </div>
        </article>`;
      }).join("") || '<p class="hint">Keine offenen Level.</p>'}
    </div>

    <h2>Records (${queue.records.length})</h2>
    <div class="queue">
      ${queue.records.map((r) => `
        <article class="card queue-item">
          <div class="queue-body">
            <strong>${esc(r.player_name)}</strong>
            <small>auf ${esc(r.levels ? r.levels.name : "?")}</small>
            ${r.notes ? `<small>Anmerkung: ${esc(r.notes)}</small>` : ""}
            <small><a href="${esc(r.video_url)}" target="_blank" rel="noopener">Video öffnen</a></small>
            <div class="form-actions">
              <button class="btn" data-approve="${esc(r.id)}">Bestätigen</button>
              <button class="btn ghost danger-btn" data-reject-record="${esc(r.id)}">Ablehnen</button>
            </div>
          </div>
        </article>`).join("") || '<p class="hint">Keine offenen Records.</p>'}
    </div>
    <p class="hint" data-msg></p>`;

  panel.onclick = queueClick; // onclick statt addEventListener, sonst sammeln sich Listener an
}

async function queueClick(e) {
  const msg = document.querySelector("[data-msg]");
  const acc = e.target.closest("[data-accept]");
  const rejL = e.target.closest("[data-reject-level]");
  const app_ = e.target.closest("[data-approve]");
  const rejR = e.target.closest("[data-reject-record]");
  let res = null;

  if (acc) {
    const pos = document.querySelector(`[data-pos="${acc.dataset.accept}"]`).value;
    res = await api(`/mod/levels/${acc.dataset.accept}/accept`, { method: "POST", body: { position: pos ? Number(pos) : null } });
  } else if (rejL) {
    const reason = prompt("Grund für die Ablehnung (optional):") || "";
    res = await api(`/mod/levels/${rejL.dataset.rejectLevel}/reject`, { method: "POST", body: { reason } });
  } else if (app_) {
    res = await api(`/mod/records/${app_.dataset.approve}/approve`, { method: "POST" });
  } else if (rejR) {
    const reason = prompt("Grund für die Ablehnung (optional):") || "";
    res = await api(`/mod/records/${rejR.dataset.rejectRecord}/reject`, { method: "POST", body: { reason } });
  } else {
    return;
  }
  if (!res.ok) { msg.textContent = errText(res.data); return; }
  renderQueue();
}

// ---------- Listen & Reihenfolge ----------
async function renderLists() {
  const panel = document.getElementById("panel");
  panel.innerHTML = '<p class="status">Lädt …</p>';
  const l = await api("/lists");
  lists = (l.data && l.data.lists) || [];
  const canEdit = perms.includes("admin") || perms.includes("lists.manage");

  panel.innerHTML = `
    <section class="card">
      <h2>Listen</h2>
      <div class="role-list">
        ${lists.map((x) => `
          <div class="role-row">
            <div class="role-info">
              <strong>${esc(x.name)}</strong>
              <small>Kürzel: ${esc(x.slug)} · ${x.max_duration_seconds ? `max. ${esc(x.max_duration_seconds)} s` : "ohne Längenbegrenzung"}</small>
            </div>
            ${perms.includes("admin") ? `<button class="chip-btn" data-sync-list="${esc(x.id)}">Sync</button>` : ""}
            <button class="chip-btn" data-import-list="${esc(x.id)}">Importieren</button>
            <button class="chip-btn danger" data-delete-list="${esc(x.id)}">Löschen</button>
            <button class="chip-btn" data-team-list="${esc(x.id)}">Team</button>
            <button class="chip-btn" data-edit-list="${esc(x.id)}">Bearbeiten</button>
            <button class="chip-btn" data-open-list="${esc(x.slug)}">Level ordnen</button>
          </div>`).join("")}
      </div>
      ${canEdit ? `
      <h3>Neue Liste</h3>
      <form class="role-form" id="new-list">
        <label>Name <input name="name" maxlength="60" required placeholder="z. B. Challenge List"></label>
        <label>Kürzel (Link) <input name="slug" maxlength="40" required placeholder="z. B. challenge"></label>
        <label>Maximale Länge in Sekunden (leer = keine Grenze) <input name="maxDurationSeconds" type="number" min="1"></label>
        <div class="form-actions"><button class="btn" type="submit">Liste anlegen</button></div>
        <p class="hint" data-msg></p>
      </form>` : ""}
    </section>
    <section class="card" id="order-box"><p class="hint">Wähle oben eine Liste, um die Level zu ordnen.</p></section>`;

  panel.querySelectorAll("[data-open-list]").forEach((b) =>
    b.addEventListener("click", () => openOrder(b.dataset.openList)));
  panel.querySelectorAll("[data-sync-list]").forEach((b) =>
    b.addEventListener("click", () => openSync(b.dataset.syncList)));
  panel.querySelectorAll("[data-delete-list]").forEach((b) =>
    b.addEventListener("click", () => deleteList(b.dataset.deleteList)));
  panel.querySelectorAll("[data-import-list]").forEach((b) =>
    b.addEventListener("click", () => openImport(b.dataset.importList)));
  panel.querySelectorAll("[data-team-list]").forEach((b) =>
    b.addEventListener("click", () => openTeam(b.dataset.teamList)));
  panel.querySelectorAll("[data-edit-list]").forEach((b) =>
    b.addEventListener("click", () => editList(b.dataset.editList)));

  const form = document.getElementById("new-list");
  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const msg = form.querySelector("[data-msg]");
    const res = await api("/mod/lists", { method: "POST", body: {
      name: f.name, slug: f.slug,
      maxDurationSeconds: f.maxDurationSeconds ? Number(f.maxDurationSeconds) : null,
    }});
    if (!res.ok) { msg.textContent = errText(res.data); return; }
    renderLists();
  });
}

async function openOrder(slug) {
  const box = document.getElementById("order-box");
  box.innerHTML = '<p class="status">Lädt …</p>';
  const r = await api(`/lists/${slug}/levels`);
  const levels = (r.data && r.data.levels) || [];
  const listId = r.data && r.data.list && r.data.list.id;
  box.innerHTML = `
    <h2>${esc(r.data.list.name)}: Reihenfolge</h2>
    <div class="role-list" id="order">
      ${levels.map((l, i) => `
        <div class="role-row" data-id="${esc(l.id)}">
          <span class="rank-mini">#${i + 1}</span>
          <div class="role-info"><strong>${esc(l.name)}</strong><small>von ${esc(l.creator)} · ${esc(l.duration_seconds || "?")} s</small></div>
          <button class="chip-btn" data-editlevel="${esc(l.id)}">Bearbeiten</button>
          <button class="chip-btn" data-up="${i}">↑</button>
          <button class="chip-btn" data-down="${i}">↓</button>
          <button class="chip-btn danger" data-del="${esc(l.id)}">Entfernen</button>
        </div>`).join("") || '<p class="hint">Noch keine Level in dieser Liste.</p>'}
    </div>
    <p class="hint" data-msg></p>`;

  box.onclick = async (e) => {
    const up = e.target.closest("[data-up]");
    const down = e.target.closest("[data-down]");
    const del = e.target.closest("[data-del]");
    const editL = e.target.closest("[data-editlevel]");
    const msg = box.querySelector("[data-msg]");
    if (editL) return editLevel(editL.dataset.editlevel, slug);
    if (del) {
      if (!confirm("Level wirklich von der Liste entfernen?")) return;
      const res = await api(`/mod/levels/${del.dataset.del}`, { method: "DELETE" });
      if (!res.ok) { msg.textContent = errText(res.data); return; }
      return openOrder(slug);
    }
    if (up || down) {
      const i = Number((up || down).dataset.up ?? (up || down).dataset.down);
      const j = up ? i - 1 : i + 1;
      if (j < 0 || j >= levels.length) return;
      [levels[i], levels[j]] = [levels[j], levels[i]];
      const res = await api("/mod/levels/order", { method: "PUT", body: { listId, levelIds: levels.map((l) => l.id) } });
      if (!res.ok) { msg.textContent = errText(res.data); return; }
      return openOrder(slug);
    }
  };
}

// Synchronisation (nur Admins): Schalter, Quelle, Knopf mit Sperre
let syncTimer = null;
async function openSync(id) {
  const x = lists.find((l) => l.id === id);
  if (!x) return;
  clearInterval(syncTimer);
  const box = document.getElementById("order-box");
  const COOLDOWN_MS = 15 * 60 * 1000;
  const render = (st) => {
    const since = st.sync_last_run ? Date.now() - new Date(st.sync_last_run).getTime() : Infinity;
    const waitMin = Math.ceil((COOLDOWN_MS - since) / 60000);
    const cooling = since < COOLDOWN_MS;
    const canRun = st.sync_enabled && st.sync_url && !st.sync_running && !cooling;
    const statusTxt = st.sync_running ? "Wird gerade synchronisiert …"
      : st.sync_status === "ok" ? `Letzter Lauf erfolgreich: ${st.sync_message || ""}`
      : st.sync_status === "fehler" ? `Letzter Lauf fehlgeschlagen: ${st.sync_message || ""}`
      : "Noch nie synchronisiert.";
    box.innerHTML = `
      <h2>Synchronisation: ${esc(x.name)}</h2>
      <p class="hint">Nur Admins können diese Einstellungen ändern und den Abruf starten.</p>
      <label class="switch-row">
        <input type="checkbox" id="sync-on" ${st.sync_enabled ? "checked" : ""}>
        <span>Synchronisation aktiv</span>
      </label>
      <label>Adresse der Übersicht
        <input id="sync-url" type="url" maxlength="300" placeholder="https://…" value="${esc(st.sync_url || "")}">
      </label>
      <div class="form-actions">
        <button class="btn ghost" type="button" id="sync-save">Einstellungen speichern</button>
        <button class="btn" type="button" id="sync-now" ${canRun ? "" : "disabled"}>Jetzt synchronisieren</button>
      </div>
      <p class="hint">${esc(statusTxt)}</p>
      ${cooling && !st.sync_running ? `<p class="hint">Nächster Abruf möglich in ca. ${waitMin} Min.</p>` : ""}
      <p class="hint" id="sync-msg"></p>
      <div class="form-actions"><button class="btn ghost" type="button" id="sync-back">Zurück zur Liste</button></div>`;
    document.getElementById("sync-back").addEventListener("click", () => { clearInterval(syncTimer); renderLists(); });
    document.getElementById("sync-save").addEventListener("click", async () => {
      const r = await api(`/mod/lists/${x.id}/sync`, { method: "PUT", body: {
        enabled: document.getElementById("sync-on").checked,
        url: document.getElementById("sync-url").value.trim(),
      }});
      document.getElementById("sync-msg").textContent = r.ok ? "Gespeichert." : errText(r.data);
      if (r.ok) openSync(id);
    });
    document.getElementById("sync-now").addEventListener("click", async () => {
      const r = await api(`/mod/lists/${x.id}/sync-now`, { method: "POST" });
      if (!r.ok) {
        const t = r.data.error === "cooldown" ? `Bitte noch ${Math.ceil(r.data.waitSeconds / 60)} Min. warten.`
          : r.data.error === "already_running" ? "Es läuft schon eine Synchronisation."
          : r.data.error === "github_failed" ? "Der Start bei GitHub hat nicht geklappt."
          : errText(r.data);
        document.getElementById("sync-msg").textContent = t;
        return;
      }
      openSync(id);
    });
  };
  const load = async () => (await api(`/mod/lists/${x.id}/sync`)).data;
  let st = await load();
  render(st);
  // Während eines Laufs den Status alle 10 Sekunden aktualisieren
  if (st.sync_running) {
    syncTimer = setInterval(async () => {
      st = await load();
      if (!st.sync_running) { clearInterval(syncTimer); }
      render(st);
    }, 10000);
  }
}

// Liste löschen: Name muss genau eingetippt werden
async function deleteList(id) {
  const x = lists.find((l) => l.id === id);
  if (!x) return;
  const typed = prompt(
    `ACHTUNG: Die Liste „${x.name}“ wird samt allen Leveln, Records, Teams und Abos GELÖSCHT. Das kann nicht rückgängig gemacht werden.\n\nZur Bestätigung den Namen der Liste genau eintippen:`
  );
  if (typed === null) return;
  const r = await api(`/mod/lists/${x.id}`, { method: "DELETE", body: { confirm: typed } });
  if (!r.ok) {
    alert(r.data.error === "confirm_mismatch" ? "Der Name stimmt nicht. Die Liste wurde nicht gelöscht." : errText(r.data));
    return;
  }
  alert(`Die Liste „${x.name}“ wurde gelöscht.`);
  renderLists();
}

// JSON-Import aus dem Import-Skript: Datei wählen, Vorschau prüfen, dann importieren
function openImport(id) {
  const x = lists.find((l) => l.id === id);
  if (!x) return;
  const box = document.getElementById("order-box");
  box.innerHTML = `
    <h2>Import in „${esc(x.name)}“</h2>
    <p class="hint">Wähle die JSON-Datei, die das Import-Skript erstellt hat. Vorhandene Level werden nie überschrieben.</p>
    <input id="imp-file" type="file" accept=".json,application/json">
    <div id="imp-preview"></div>
    <p class="hint" id="imp-msg"></p>`;
  const msg = document.getElementById("imp-msg");
  const prev = document.getElementById("imp-preview");
  let data = null;
  document.getElementById("imp-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      data = JSON.parse(await file.text());
    } catch {
      msg.textContent = "Die Datei ist keine gültige JSON-Datei.";
      return;
    }
    if (!Array.isArray(data)) { msg.textContent = "Die Datei enthält keine Liste von Leveln."; return; }
    const bad = data.filter((d) => !d.levelId).length;
    const long = x.max_duration_seconds ? data.filter((d) => d.lengthSeconds && d.lengthSeconds > x.max_duration_seconds).length : 0;
    prev.innerHTML = `
      <p><strong>${data.length}</strong> Einträge gefunden.
        ${bad ? `<span class="warn">${bad} ohne Level-ID werden übersprungen.</span>` : ""}
        ${long ? `<span class="warn">${long} sind länger als ${esc(x.max_duration_seconds)} s und werden übersprungen.</span>` : ""}
      </p>
      <div class="table-wrap"><table class="stats-table">
        <thead><tr><th>Platz</th><th>Name</th><th>Creator</th><th>Verifier</th><th>Level-ID</th><th class="num">Länge</th></tr></thead>
        <tbody>${data.slice(0, 200).map((d) => `<tr>
          <td class="rank-cell">${esc(d.rank)}</td><td>${esc(d.name)}</td><td>${esc(d.publisher || "")}</td>
          <td>${esc(d.verifier || "")}</td><td>${esc(d.levelId || "–")}</td><td class="num">${esc(d.lengthSeconds ?? "–")}</td></tr>`).join("")}</tbody>
      </table></div>
      <div class="form-actions"><button class="btn" type="button" id="imp-go">Jetzt importieren</button></div>`;
    document.getElementById("imp-go").addEventListener("click", async () => {
      msg.textContent = "Wird importiert …";
      let r = await api("/mod/import", { method: "POST", body: { listId: x.id, levels: data } });
      if (!r.ok && r.data.error === "list_not_empty") {
        const go = confirm(`Die Liste hat schon ${r.data.count} Level.\n\nSoll die Datei zusammengeführt werden?\n• Bekannte Level (gleiche Level-ID) werden aktualisiert, ihre Records bleiben erhalten.\n• Neue Level kommen dazu.\n• Level, die im Import fehlen, bleiben unverändert.`);
        if (!go) { msg.textContent = "Abgebrochen. Es wurde nichts geändert."; return; }
        msg.textContent = "Wird zusammengeführt …";
        r = await api("/mod/import", { method: "POST", body: { listId: x.id, levels: data, mode: "merge" } });
        if (!r.ok) { msg.textContent = errText(r.data); return; }
        const sk2 = (r.data.skipped || []).map((k) => `Platz ${k.rank ?? "?"} (${k.name ?? "?"}): ${k.reason}`).join("\n");
        msg.textContent = `Aktualisiert: ${r.data.updated}, neu: ${r.data.added}, Records neu: ${r.data.recordsAdded}, nicht im Import: ${r.data.notInImport}.` + (sk2 ? `\n${r.data.skipped.length} übersprungen:\n${sk2}` : "");
        renderLists();
        return;
      }
      if (!r.ok) {
        msg.textContent = errText(r.data);
        return;
      }
      const sk = (r.data.skipped || []).map((k) => `Platz ${k.rank ?? "?"} (${k.name ?? "?"}): ${k.reason}`).join("\n");
      msg.textContent = `${r.data.imported} Level importiert.` + (sk ? `\n${r.data.skipped.length} übersprungen:\n${sk}` : "");
      renderLists();
    });
  });
}

// Team einer Liste: Editoren und Helfer. Pro Rolle beliebig viele Personen, jede per eigenem Suchfeld
async function openTeam(id) {
  const x = lists.find((l) => l.id === id);
  if (!x) return;
  const box = document.getElementById("order-box");
  box.innerHTML = '<p class="status">Lädt …</p>';
  const r = await api(`/lists/${x.slug}/staff`);
  const team = { editor: (r.data.editors || []).slice(), helper: (r.data.helpers || []).slice() };
  const avatarOf = (p) => (p.avatar ? `https://cdn.discordapp.com/avatars/${p.discordId}/${p.avatar}.png?size=64` : "https://cdn.discordapp.com/embed/avatars/0.png");
  const flagOf = (c) => (c ? String.fromCodePoint(...c.toUpperCase().split("").map((ch) => 127397 + ch.charCodeAt(0))) : "");
  const taken = () => new Set([...team.editor, ...team.helper].map((p) => p.discordId));
  const LABEL = { editor: "Editoren", helper: "Helfer" };

  function section(role) {
    const people = team[role];
    return `
      <div class="team-section" data-role="${role}">
        <h3>${LABEL[role]}</h3>
        <div class="team-people">
          ${people.map((p) => `
            <div class="team-person">
              <img src="${esc(avatarOf(p))}" alt="" width="32" height="32">
              <span>${flagOf(p.country)} ${esc(p.name)}</span>
              <button class="chip-btn danger" type="button" data-remove="${role}:${esc(p.discordId)}">Entfernen</button>
            </div>`).join("") || '<p class="hint">Noch niemand.</p>'}
        </div>
        <div class="team-pickers"></div>
        <button class="chip-btn" type="button" data-add-picker="${role}">+ ${role === "editor" ? "Editor" : "Helfer"} hinzufügen</button>
      </div>`;
  }

  function render() {
    box.innerHTML = `
      <h2>Team: ${esc(x.name)}</h2>
      <p class="hint">Mit „+ … hinzufügen“ öffnet sich ein Suchfeld. Wähle eine Person aus, sie wird gleich übernommen.</p>
      ${section("editor")}
      ${section("helper")}
      <div class="form-actions">
        <button class="btn" type="button" id="team-save">Speichern</button>
        <button class="btn ghost" type="button" id="team-back">Zurück zur Liste</button>
      </div>
      <p class="hint" id="team-msg"></p>`;

    box.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", () => {
      const [role, did] = btn.dataset.remove.split(":");
      team[role] = team[role].filter((p) => p.discordId !== did);
      render();
    }));
    box.querySelectorAll("[data-add-picker]").forEach((btn) => btn.addEventListener("click", () => {
      const role = btn.dataset.addPicker;
      const holder = box.querySelector(`.team-section[data-role="${role}"] .team-pickers`);
      if (holder.querySelector(".team-picker")) return; // nur ein offenes Suchfeld pro Rolle
      const picker = document.createElement("div");
      picker.className = "team-picker";
      picker.innerHTML = `
        <input type="search" class="search" placeholder="Name suchen …" autocomplete="off">
        <div class="team-results"></div>
        <button class="chip-btn" type="button" data-cancel>Abbrechen</button>`;
      holder.appendChild(picker);
      const input = picker.querySelector("input");
      const results = picker.querySelector(".team-results");
      input.focus();
      let timer = null;
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const q = input.value.trim();
          if (!q) { results.innerHTML = ""; return; }
          const res = await api(`/mod/members?q=${encodeURIComponent(q)}`);
          const used = taken();
          const list = (res.data.members || []).filter((mm) => !used.has(mm.discord_id));
          results.innerHTML = list.length ? list.map((mm) => `
            <button class="team-result" type="button" data-pick="${esc(mm.discord_id)}" data-name="${esc(mm.name)}" data-avatar="${esc(mm.avatar || "")}">
              <img src="${esc(mm.avatar ? `https://cdn.discordapp.com/avatars/${mm.discord_id}/${mm.avatar}.png?size=64` : "https://cdn.discordapp.com/embed/avatars/0.png")}" alt="" width="28" height="28">
              <span>${esc(mm.name)}</span>
            </button>`).join("") : '<p class="hint">Keine freie Person gefunden.</p>';
        }, 300);
      });
      picker.querySelector("[data-cancel]").addEventListener("click", () => picker.remove());
      picker.addEventListener("click", (e) => {
        const pick = e.target.closest("[data-pick]");
        if (!pick) return;
        team[role].push({ discordId: pick.dataset.pick, name: pick.dataset.name, avatar: pick.dataset.avatar || null, country: null });
        render();
      });
    }));

    document.getElementById("team-save").addEventListener("click", async () => {
      const res = await api(`/mod/lists/${x.id}/staff`, { method: "PUT", body: {
        editors: team.editor.map((p) => p.discordId),
        helpers: team.helper.map((p) => p.discordId),
      }});
      document.getElementById("team-msg").textContent = res.ok ? "Gespeichert." : errText(res.data);
    });
    document.getElementById("team-back").addEventListener("click", () => renderLists());
  }
  render();
}

// Liste löschen: Name muss genau eingetippt werden
async function deleteList(id) {
  const x = lists.find((l) => l.id === id);
  if (!x) return;
  const typed = prompt(
    `ACHTUNG: Die Liste „${x.name}“ wird samt allen Leveln, Records, Teams und Abos GELÖSCHT. Das kann nicht rückgängig gemacht werden.\n\nZur Bestätigung den Namen der Liste genau eintippen:`
  );
  if (typed === null) return;
  const r = await api(`/mod/lists/${x.id}`, { method: "DELETE", body: { confirm: typed } });
  if (!r.ok) {
    alert(r.data.error === "confirm_mismatch" ? "Der Name stimmt nicht. Die Liste wurde nicht gelöscht." : errText(r.data));
    return;
  }
  alert(`Die Liste „${x.name}“ wurde gelöscht.`);
  renderLists();
}

// JSON-Import aus dem Import-Skript: Datei wählen, Vorschau prüfen, dann importieren
function openImport(id) {
  const x = lists.find((l) => l.id === id);
  if (!x) return;
  const box = document.getElementById("order-box");
  box.innerHTML = `
    <h2>Import in „${esc(x.name)}“</h2>
    <p class="hint">Wähle die JSON-Datei, die das Import-Skript erstellt hat. Vorhandene Level werden nie überschrieben.</p>
    <input id="imp-file" type="file" accept=".json,application/json">
    <div id="imp-preview"></div>
    <p class="hint" id="imp-msg"></p>`;
  const msg = document.getElementById("imp-msg");
  const prev = document.getElementById("imp-preview");
  let data = null;
  document.getElementById("imp-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      data = JSON.parse(await file.text());
    } catch {
      msg.textContent = "Die Datei ist keine gültige JSON-Datei.";
      return;
    }
    if (!Array.isArray(data)) { msg.textContent = "Die Datei enthält keine Liste von Leveln."; return; }
    const bad = data.filter((d) => !d.levelId).length;
    const long = x.max_duration_seconds ? data.filter((d) => d.lengthSeconds && d.lengthSeconds > x.max_duration_seconds).length : 0;
    prev.innerHTML = `
      <p><strong>${data.length}</strong> Einträge gefunden.
        ${bad ? `<span class="warn">${bad} ohne Level-ID werden übersprungen.</span>` : ""}
        ${long ? `<span class="warn">${long} sind länger als ${esc(x.max_duration_seconds)} s und werden übersprungen.</span>` : ""}
      </p>
      <div class="table-wrap"><table class="stats-table">
        <thead><tr><th>Platz</th><th>Name</th><th>Creator</th><th>Verifier</th><th>Level-ID</th><th class="num">Länge</th></tr></thead>
        <tbody>${data.slice(0, 200).map((d) => `<tr>
          <td class="rank-cell">${esc(d.rank)}</td><td>${esc(d.name)}</td><td>${esc(d.publisher || "")}</td>
          <td>${esc(d.verifier || "")}</td><td>${esc(d.levelId || "–")}</td><td class="num">${esc(d.lengthSeconds ?? "–")}</td></tr>`).join("")}</tbody>
      </table></div>
      <div class="form-actions"><button class="btn" type="button" id="imp-go">Jetzt importieren</button></div>`;
    document.getElementById("imp-go").addEventListener("click", async () => {
      msg.textContent = "Wird importiert …";
      let r = await api("/mod/import", { method: "POST", body: { listId: x.id, levels: data } });
      if (!r.ok && r.data.error === "list_not_empty") {
        const go = confirm(`Die Liste hat schon ${r.data.count} Level.\n\nSoll die Datei zusammengeführt werden?\n• Bekannte Level (gleiche Level-ID) werden aktualisiert, ihre Records bleiben erhalten.\n• Neue Level kommen dazu.\n• Level, die im Import fehlen, bleiben unverändert.`);
        if (!go) { msg.textContent = "Abgebrochen. Es wurde nichts geändert."; return; }
        msg.textContent = "Wird zusammengeführt …";
        r = await api("/mod/import", { method: "POST", body: { listId: x.id, levels: data, mode: "merge" } });
        if (!r.ok) { msg.textContent = errText(r.data); return; }
        const sk2 = (r.data.skipped || []).map((k) => `Platz ${k.rank ?? "?"} (${k.name ?? "?"}): ${k.reason}`).join("\n");
        msg.textContent = `Aktualisiert: ${r.data.updated}, neu: ${r.data.added}, Records neu: ${r.data.recordsAdded}, nicht im Import: ${r.data.notInImport}.` + (sk2 ? `\n${r.data.skipped.length} übersprungen:\n${sk2}` : "");
        renderLists();
        return;
      }
      if (!r.ok) {
        msg.textContent = errText(r.data);
        return;
      }
      const sk = (r.data.skipped || []).map((k) => `Platz ${k.rank ?? "?"} (${k.name ?? "?"}): ${k.reason}`).join("\n");
      msg.textContent = `${r.data.imported} Level importiert.` + (sk ? `\n${r.data.skipped.length} übersprungen:\n${sk}` : "");
      renderLists();
    });
  });
}

// Team einer Liste: Editoren und Helfer setzen
async function openTeam(id) {
  const x = lists.find((l) => l.id === id);
  if (!x) return;
  const box = document.getElementById("order-box");
  box.innerHTML = '<p class="status">Lädt …</p>';
  const r = await api(`/lists/${x.slug}/staff`);
  const team = { editors: (r.data.editors || []).slice(), helpers: (r.data.helpers || []).slice() };
  const flag = (c) => (c ? String.fromCodePoint(...c.toUpperCase().split("").map((ch) => 127397 + ch.charCodeAt(0))) : "");
  const render = () => {
    const row = (p, role) => `<div class="role-row">
      <img src="${esc(p.avatar || "https://cdn.discordapp.com/embed/avatars/0.png")}" width="32" height="32" alt="" style="border-radius:50%">
      <div class="role-info"><strong>${flag(p.country)} ${esc(p.name)}</strong></div>
      <button class="chip-btn danger" type="button" data-remove="${role}:${esc(p.discordId)}">Entfernen</button></div>`;
    box.innerHTML = `
      <h2>Team: ${esc(x.name)}</h2>
      <h3>Editoren</h3>
      <div class="role-list">${team.editors.map((p) => row(p, "editor")).join("") || '<p class="hint">Keine Editoren.</p>'}</div>
      <h3>Helfer</h3>
      <div class="role-list">${team.helpers.map((p) => row(p, "helper")).join("") || '<p class="hint">Keine Helfer.</p>'}</div>
      <h3>Person hinzufügen</h3>
      <select id="team-role" class="role-form-select"><option value="editor">als Editor</option><option value="helper">als Helfer</option></select>
      <input id="team-q" class="search" type="search" placeholder="Name suchen …" autocomplete="off">
      <div id="team-results" class="results"></div>
      <div class="form-actions"><button class="btn" type="button" id="team-save">Speichern</button></div>
      <p class="hint" id="team-msg"></p>`;
    box.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", () => {
      const [role, id2] = btn.dataset.remove.split(":");
      team[role === "editor" ? "editors" : "helpers"] = team[role === "editor" ? "editors" : "helpers"].filter((p) => p.discordId !== id2);
      render();
    }));
    let timer = null;
    document.getElementById("team-q").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = e.target.value.trim();
        const res = document.getElementById("team-results");
        if (!q) { res.innerHTML = ""; return; }
        const s = await api(`/mod/members?q=${encodeURIComponent(q)}`);
        res.innerHTML = (s.data.members || []).map((mm) => `
          <div class="member"><img src="${esc(mm.avatar ? `https://cdn.discordapp.com/avatars/${mm.discord_id}/${mm.avatar}.png?size=64` : "https://cdn.discordapp.com/embed/avatars/0.png")}" width="36" height="36" alt="" style="border-radius:50%">
            <div class="member-body"><strong>${esc(mm.name)}</strong></div>
            <button class="chip-btn" type="button" data-add="${esc(mm.discord_id)}" data-name="${esc(mm.name)}">Hinzufügen</button></div>`).join("") || '<p class="hint">Keine Treffer.</p>';
        res.querySelectorAll("[data-add]").forEach((btn) => btn.addEventListener("click", () => {
          const role = document.getElementById("team-role").value === "editor" ? "editors" : "helpers";
          const id2 = btn.dataset.add;
          const all = [...team.editors, ...team.helpers];
          if (all.some((p) => p.discordId === id2)) { document.getElementById("team-msg").textContent = "Diese Person ist schon im Team."; return; }
          team[role].push({ discordId: id2, name: btn.dataset.name, avatar: null, country: null });
          render();
        }));
      }, 300);
    });
    document.getElementById("team-save").addEventListener("click", async () => {
      const res = await api(`/mod/lists/${x.id}/staff`, { method: "PUT", body: {
        editors: team.editors.map((p) => p.discordId),
        helpers: team.helpers.map((p) => p.discordId),
      }});
      document.getElementById("team-msg").textContent = res.ok ? "Gespeichert." : errText(res.data);
    });
  };
  render();
}

// Liste bearbeiten: Name, Kürzel, Platzanzahl, maximale Länge
function editList(id) {
  const x = lists.find((l) => l.id === id);
  if (!x) return;
  const box = document.getElementById("order-box");
  box.innerHTML = `
    <h2>${esc(x.name)} bearbeiten</h2>
    <form class="role-form" id="edit-list">
      <label>Name <input name="name" maxlength="60" required value="${esc(x.name)}"></label>
      <label>Kürzel (Link) <input name="slug" maxlength="40" required value="${esc(x.slug)}"></label>
      <label>Anzahl Plätze <input name="maxPlaces" type="number" min="1" max="500" required value="${esc(x.max_places || 50)}"></label>
      <label>Maximale Länge in Sekunden (leer = keine Grenze) <input name="maxDurationSeconds" type="number" min="1" value="${esc(x.max_duration_seconds ?? "")}"></label>
      <div class="form-actions">
        <button class="btn" type="submit">Speichern</button>
        <button class="btn ghost" type="button" id="cancel-edit">Abbrechen</button>
      </div>
      <p class="hint" data-msg></p>
    </form>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("cancel-edit").addEventListener("click", () => renderLists());
  document.getElementById("edit-list").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const msg = e.target.querySelector("[data-msg]");
    const res = await api(`/mod/lists/${x.id}`, { method: "PATCH", body: {
      name: f.name, slug: f.slug,
      maxPlaces: Number(f.maxPlaces),
      maxDurationSeconds: f.maxDurationSeconds ? Number(f.maxDurationSeconds) : null,
    }});
    if (!res.ok) { msg.textContent = errText(res.data); return; }
    renderLists();
  });
}

// Level bearbeiten (Angaben, nicht Platz)
function editLevel(levelId, slug) {
  const box = document.getElementById("order-box");
  api(`/levels/${levelId}`).then((r) => {
    const lv = (r.data && r.data.level) || null;
    if (!lv) return;
    box.innerHTML = `
      <h2>${esc(lv.name)} bearbeiten</h2>
      <form class="role-form" id="edit-level">
        <label>Name <input name="name" maxlength="80" required value="${esc(lv.name)}"></label>
        <label>Creator <input name="creator" maxlength="60" required value="${esc(lv.creator)}"></label>
        <label>Verifier <input name="verifier" maxlength="60" required value="${esc(lv.verifier)}"></label>
        <label>GD-Level-ID <input name="gdLevelId" inputmode="numeric" maxlength="12" required value="${esc(lv.gd_level_id)}"></label>
        <label>Länge in Sekunden <input name="durationSeconds" type="number" min="1" value="${esc(lv.duration_seconds ?? "")}"></label>
        <label>Video-Link <input name="videoUrl" type="url" maxlength="300" required value="${esc(lv.video_url)}"></label>
        <label class="switch-row"><input type="checkbox" name="isBeat" ${lv.isBeat ? "checked" : ""}> <span>Community Beat (Punkte werden auf die Mitwirkenden verteilt)</span></label>
        <label>Mitwirkende, eine Zeile pro Person: <em>Name | Teil</em> <textarea name="contributors" rows="5" placeholder="Max | Teil 1&#10;Lisa | Teil 2">${esc((lv.contributors || []).map((c) => c.part ? `${c.name} | ${c.part}` : c.name).join("\n"))}</textarea></label>
        <label>Mehrere Creator (optional, durch Komma getrennt) <input name="creators" maxlength="200" value="${esc(lv.creators || "")}"></label>
        <label>Schwierigkeit <input name="difficulty" maxlength="40" value="${esc(lv.difficulty || "")}"></label>
        <label>Benötigter Fortschritt in % <input name="requirement" type="number" min="1" max="100" value="${esc(lv.requirement || 100)}"></label>
        <label>Song <input name="song" maxlength="80" value="${esc(lv.song || "")}"></label>
        <label>Objekte <input name="objects" type="number" min="0" value="${esc(lv.objects ?? "")}"></label>
        <label>NONG <input name="nong" maxlength="80" value="${esc(lv.nong || "")}"></label>
        <div class="form-actions">
          <button class="btn" type="submit">Speichern</button>
          <button class="btn ghost" type="button" id="cancel-level">Zurück zur Liste</button>
        </div>
        <p class="hint" data-msg></p>
      </form>`;
    document.getElementById("cancel-level").addEventListener("click", () => openOrder(slug));
    document.getElementById("edit-level").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const msg = e.target.querySelector("[data-msg]");
      const res = await api(`/mod/levels/${levelId}`, { method: "PATCH", body: {
        name: f.name, creator: f.creator, verifier: f.verifier, gdLevelId: f.gdLevelId,
        durationSeconds: f.durationSeconds ? Number(f.durationSeconds) : undefined,
        videoUrl: f.videoUrl,
        creators: f.creators,
        isBeat: !!e.target.isBeat.checked,
        contributors: (f.contributors || "").split("\n").map((ln) => ln.trim()).filter(Boolean).map((ln) => {
          const [name, part] = ln.split("|").map((v) => v.trim());
          return { name, part: part || null };
        }),
        difficulty: f.difficulty,
        requirement: f.requirement ? Number(f.requirement) : undefined,
        song: f.song,
        objects: f.objects === "" ? null : (f.objects !== undefined ? Number(f.objects) : undefined),
        nong: f.nong,
      }});
      if (!res.ok) { msg.textContent = errText(res.data); return; }
      openOrder(slug);
    });
  });
}

// ---------- Discord-Benachrichtigungen ----------
async function renderNotify() {
  const panel = document.getElementById("panel");
  panel.innerHTML = '<p class="status">Lädt …</p>';
  const r = await api("/mod/settings");
  if (!r.ok) { panel.innerHTML = `<p class="status">${esc(errText(r.data))}</p>`; return; }
  const hooks = r.data.webhooks || {};

  panel.innerHTML = `
    <section class="card">
      <h2>Discord-Benachrichtigungen</h2>
      <p class="hint">Hier legst du fest, welcher Discord-Channel bei welchem Ereignis benachrichtigt wird. Dazu erstellst du in Discord bei dem Channel unter Einstellungen → Integrationen → Webhooks einen Webhook und fügst dessen Adresse ein. Leer lassen = keine Nachricht.</p>
      <form class="role-form" id="hooks">
        ${Object.entries(EVENT_LABELS).map(([k, label]) => `
          <label>${esc(label)}
            <div class="hook-row">
              <input name="${esc(k)}" type="url" placeholder="${hooks[k] ? esc(hooks[k]) + " (gespeichert)" : "https://discord.com/api/webhooks/…"}" value="">
              <button class="chip-btn" type="button" data-test="${esc(k)}">Testen</button>
            </div>
          </label>`).join("")}
        <div class="form-actions"><button class="btn" type="submit">Speichern</button></div>
        <p class="hint" data-msg></p>
      </form>
    </section>`;

  const form = document.getElementById("hooks");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = form.querySelector("[data-msg]");
    const body = {};
    // Nur Felder senden, die ausgefüllt wurden; leer löscht den Webhook nicht
    for (const [k] of Object.entries(EVENT_LABELS)) {
      const v = form.elements[k].value.trim();
      if (v) body[k] = v;
    }
    if (!Object.keys(body).length) { msg.textContent = "Keine Änderungen eingetragen."; return; }
    const res = await api("/mod/settings", { method: "PUT", body });
    if (!res.ok) { msg.textContent = errText(res.data); return; }
    msg.textContent = "Gespeichert.";
    renderNotify();
  });
  form.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-test]");
    if (!btn) return;
    const res = await api("/mod/settings/test", { method: "POST", body: { event: btn.dataset.test } });
    form.querySelector("[data-msg]").textContent = res.ok && res.data.sent
      ? "Testnachricht wurde gesendet."
      : "Keine Nachricht gesendet. Ist für dieses Ereignis ein Webhook gespeichert?";
  });
}

init();
