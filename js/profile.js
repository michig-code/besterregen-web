// Profilseite: Rang, Punkte, erstellte Level und Completions einer Person
(async function () {
  const app = document.getElementById("app");
  const name = new URLSearchParams(location.search).get("name");
  if (!name) { app.innerHTML = '<p class="status">Kein Profil ausgewählt.</p>'; return; }
  const res = await api(`/profiles/${encodeURIComponent(name)}`);
  if (!res.ok) { app.innerHTML = `<p class="status">${esc(errText(res.data))}</p>`; return; }
  const p = res.data;
  document.title = `${p.name} – Bester Regen`;
  const avatar = p.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
  app.innerHTML = `
    <section class="card profile-hero">
      <img class="profile-avatar" src="${esc(avatar)}" alt="" width="96" height="96">
      <div>
        <h1>${esc(p.name)}</h1>
        <p class="hint">${p.rank ? `Rang ${p.tied ? "=" : ""}${esc(p.rank)} auf der Rangliste` : "Noch nicht auf der Rangliste"}</p>
        <div class="profile-stats">
          <div><strong>${esc(p.points)}</strong><small>Punkte</small></div>
          <div><strong>${esc(p.completionCount)}</strong><small>Completions</small></div>
          <div><strong>${esc(p.createdCount)}</strong><small>Erstellt</small></div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Erstellte Level</h2>
      ${p.created.length ? `<div class="records">${p.created.map((c) => `
        <a class="record-row link-row" href="level.html?id=${esc(c.id)}">
          <span><strong>#${esc(c.position)} ${esc(c.name)}</strong><small> · ${esc(c.listName)} · verifiziert von ${esc(c.verifier)}</small></span>
          <span>${esc(c.points)} Punkte</span>
        </a>`).join("")}</div>` : '<p class="hint">Keine erstellten Level.</p>'}
    </section>

    <section class="card">
      <h2>Completions</h2>
      ${p.completions.length ? `<div class="records">${p.completions.map((c) => `
        <a class="record-row link-row" href="level.html?id=${esc(c.levelId)}">
          <span><strong>#${esc(c.position)} ${esc(c.name)}</strong><small> · ${esc(c.listName)} · ${esc(c.percent)} %</small></span>
          <span>${esc(c.points)} Punkte</span>
        </a>`).join("")}</div>` : '<p class="hint">Noch keine bestätigten Completions.</p>'}
    </section>`;
})();
