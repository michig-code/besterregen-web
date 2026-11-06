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
        <img src="${esc(m.avatar)}" alt="" width="72" height="72">
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
      <p><a class="btn" href="verify.html">${m.gdName ? "Verknüpfung prüfen" : "GD-Account verknüpfen"}</a></p>
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

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    try { localStorage.removeItem("br_token"); } catch {}
    location.href = "index.html";
  });
})();
