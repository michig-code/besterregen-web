// Rangliste: verifizierte GD-Accounts mit geschafften Listen-Leveln
(async function () {
  const app = document.getElementById("app");
  const res = await api("/stats");
  if (!res.ok) { app.innerHTML = `<p class="status">${esc(errText(res.data))}</p>`; return; }
  const all = (res.data && res.data.players) || [];

  app.innerHTML = `
    <section class="card">
      <input id="pq" class="search" type="search" placeholder="Spieler suchen …" autocomplete="off">
      <div class="table-wrap">
        <table class="stats-table">
          <thead><tr><th>Platz</th><th>Spieler</th><th class="num">Punkte</th><th class="num">Completions</th><th class="num">Erstellt</th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <p class="hint" id="count"></p>
      <p class="hint">Gleiche Punktzahl bedeutet gleicher Platz (=).</p>
    </section>`;

  const rows = document.getElementById("rows");
  const count = document.getElementById("count");
  function draw() {
    const q = document.getElementById("pq").value.trim().toLowerCase();
    const list = all.filter((p) => !q || p.name.toLowerCase().includes(q));
    rows.innerHTML = list.map((p) => `
      <tr>
        <td class="rank-cell">${p.tied ? "=" : ""}${esc(p.rank)}</td>
        <td class="player-cell">
          <img src="${esc(p.avatar || "https://cdn.discordapp.com/embed/avatars/0.png")}" alt="" width="30" height="30">
          <a class="type-link" href="profile.html?name=${encodeURIComponent(p.name)}"><strong>${esc(p.name)}</strong></a>
        </td>
        <td class="num">${esc(p.points)}</td>
        <td class="num">${esc(p.completions)}</td>
        <td class="num">${esc(p.created)}</td>
      </tr>`).join("") || '<tr><td colspan="5" class="hint">Keine Treffer.</td></tr>';
    count.textContent = `${list.length} von ${all.length} Spielern`;
  }
  document.getElementById("pq").addEventListener("input", draw);
  draw();
})();
