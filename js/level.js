// Level-Detailseite mit bestätigten Records
(async function () {
  const app = document.getElementById("app");
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { app.innerHTML = '<p class="status">Kein Level ausgewählt.</p>'; return; }

  const res = await api(`/levels/${encodeURIComponent(id)}`);
  if (!res.ok) { app.innerHTML = `<p class="status">${esc(errText(res.data))}</p>`; return; }
  const { level, records } = res.data;
  document.title = `${level.name} – Besterregen`;

  const gdLink = `https://gdbrowser.com/${encodeURIComponent(level.gd_level_id)}`;
  app.innerHTML = `
    <section class="card level-detail">
      ${level.image_url ? `<img class="level-img" src="${esc(level.image_url)}" alt="">` : ""}
      <div class="level-meta">
        <span class="eyebrow">Platz #${esc(level.position)}</span>
        <h1>${esc(level.name)}</h1>
        <p>von <strong>${esc(level.creator)}</strong> · verifiziert von <strong>${esc(level.verifier)}</strong></p>
        <p class="hint">Level-ID ${esc(level.gd_level_id)}${level.duration_seconds ? ` · ${esc(level.duration_seconds)} s` : ""}</p>
        <div class="form-actions">
          <a class="btn" href="${esc(level.video_url)}" target="_blank" rel="noopener">Video ansehen</a>
          <a class="btn ghost" href="${esc(gdLink)}" target="_blank" rel="noopener">Im Browser öffnen</a>
          <a class="btn ghost" href="einreichen.html?record=${esc(level.id)}">Record einreichen</a>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Records</h2>
      ${records.length ? `
        <div class="records">
          ${records.map((r) => `
            <div class="record-row">
              <strong>${esc(r.player_name)}</strong>
              <a href="${esc(r.video_url)}" target="_blank" rel="noopener">Video</a>
            </div>`).join("")}
        </div>` : '<p class="hint">Noch keine bestätigten Records.</p>'}
    </section>`;
})();
