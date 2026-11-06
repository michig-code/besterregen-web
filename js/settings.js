// Einstellungen: Profil, GD-Verknüpfung, Rechte, Abmelden
(async function () {
  const app = document.getElementById("app");
  const me = await api("/me").catch(() => ({ data: {} }));
  const m = me.data || {};
  if (!m.loggedIn) {
    app.innerHTML = `<div class="card"><p>Du bist nicht angemeldet.</p>
      <p><a class="btn" href="verify.html">Mit Discord anmelden</a></p></div>`;
    return;
  }

  const defs = await api("/admin/permissions");
  const labels = (defs.data && defs.data.permissions) || {};
  const perms = m.permissions || [];

  app.innerHTML = `
    <section class="card settings-card">
      <div class="profile">
        <img src="${esc(m.avatar || "https://cdn.discordapp.com/embed/avatars/0.png")}" alt="" width="72" height="72" onerror="this.onerror=null;this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div>
          <h2>${esc(m.discordName)}</h2>
          <small class="hint">Discord-ID ${esc(m.discordId)}</small>
        </div>
      </div>
    </section>

    <section class="card settings-card">
      <h3>GD-Account</h3>
      ${m.gdName
        ? `<p>Verknüpft mit <strong>${esc(m.gdName)}</strong>.</p>`
        : `<p>Noch nicht verknüpft.</p>`}
      <p class="hint">Optional. Du kannst die Seite auch ohne GD-Account nutzen.</p>
      <div class="form-actions">
        ${m.gdName
          ? `<a class="btn ghost" href="verify.html">Neu verknüpfen</a>
             <button class="btn ghost danger-btn" id="unlink-btn" type="button">Verknüpfung entfernen</button>`
          : `<a class="btn" href="verify.html">GD-Account verknüpfen</a>`}
      </div>
      <p class="hint" id="gd-msg"></p>
    </section>

    <section class="card settings-card">
      <h3>Rechte auf der Seite</h3>
      ${perms.length
        ? `<ul class="perm-list">${perms.map((p) => `<li><strong>${esc(p)}</strong>: ${esc(labels[p] || "")}</li>`).join("")}</ul>`
        : `<p class="hint">Keine besonderen Rechte.</p>`}
    </section>

    <section class="card settings-card">
      <h3>Konto</h3>
      <p class="hint">Abmelden löscht die Sitzung auf dem Server und auf diesem Gerät.</p>
      <button class="btn ghost" id="logout-btn">Abmelden</button>
    </section>`;

  const unlink = document.getElementById("unlink-btn");
  if (unlink) unlink.addEventListener("click", async () => {
    if (!confirm("GD-Verknüpfung wirklich entfernen?")) return;
    const r = await api("/gd/unlink", { method: "POST" });
    if (!r.ok) { document.getElementById("gd-msg").textContent = errText(r.data); return; }
    location.reload();
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    try { localStorage.removeItem("br_token"); } catch {}
    location.href = "index.html";
  });
})();
