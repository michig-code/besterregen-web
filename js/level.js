// Level-Detailseite: Infos, Punkte, Video (erst nach Klick), Records
(async function () {
  const app = document.getElementById("app");
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { app.innerHTML = '<p class="status">Kein Level ausgewählt.</p>'; return; }

  const res = await api(`/levels/${encodeURIComponent(id)}`);
  if (!res.ok) { app.innerHTML = `<p class="status">${esc(errText(res.data))}</p>`; return; }
  const { level, records } = res.data;
  const contributors = res.data.contributors || [];
  document.title = `${level.name} – Bester Regen`;

  const yt = (url) => {
    const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  };
  const ytId = yt(level.video_url);
  const videoBlock = ytId
    ? `<div class="video-box" id="video">
         <button class="video-play" type="button" data-yt="${esc(ytId)}" aria-label="Video laden">▶</button>
         <p class="hint">Klicke, um das Video von YouTube zu laden. Vorher wird nichts an Google übertragen.</p>
       </div>`
    : `<p><a class="btn" href="${esc(level.video_url)}" target="_blank" rel="noopener">Video ansehen</a></p>`;

  app.innerHTML = `
    <section class="card level-hero">
      ${level.image_url ? `<img class="level-img" src="${esc(level.image_url)}" alt="">` : ""}
      <div class="level-meta">
        <span class="eyebrow">${esc(level.listName || "Liste")} · Platz #${esc(level.position)}</span>
        <h1>${esc(level.name)}</h1>
        <p>von <strong>${esc(level.creator)}</strong></p>
        <p class="points-big">${esc(level.points)} <span>Punkte</span></p>
        <div class="form-actions">
          <a class="btn ghost" href="einreichen.html?record=${esc(level.id)}">Record einsenden</a>
        </div>
      </div>
    </section>

    <div class="info-grid">
      <section class="card">
        <h2>Level-Infos</h2>
        <table class="info-table">
          <tr><th>Position</th><td>#${esc(level.position)}</td></tr>
          <tr><th>Creator</th><td>${esc(level.creators || level.creator)}</td></tr>
          <tr><th>Verifier</th><td>${esc(level.verifier)}</td></tr>
          <tr><th>Level-ID</th><td>${esc(level.gd_level_id)}</td></tr>
          <tr><th>Länge</th><td>${level.duration_seconds ? esc(level.duration_seconds) + " s" : "–"}</td></tr>
        </table>
        <details class="more">
          <summary>Erweitert</summary>
          <table class="info-table">
            <tr><th>Kategorie</th><td>${esc(level.listName || "–")}</td></tr>
            <tr><th>Schwierigkeit</th><td>${esc(level.difficulty || "–")}</td></tr>
            <tr><th>Benötigter Fortschritt</th><td>${esc(level.requirement || 100)} %</td></tr>
            <tr><th>Song</th><td>${esc(level.song || "–")}</td></tr>
            <tr><th>Objekte</th><td>${level.objects != null ? esc(level.objects) : "–"}</td></tr>
            <tr><th>NONG</th><td>${esc(level.nong || "–")}</td></tr>
          </table>
        </details>
      </section>
      <section class="card">
        <h2>Punkte</h2>
        <table class="info-table">
          <tr><th>Punkte</th><td>${esc(level.points)}</td></tr>
          <tr><th>Completions</th><td>${esc(level.completions)}</td></tr>
        </table>
      </section>
    </div>

    ${level.isBeat || contributors.length ? `
    <section class="card">
      <h2>Mitwirkende</h2>
      <p class="hint">${level.isBeat ? "Community Beat: Die Punkte werden gleichmäßig verteilt." : ""}</p>
      <div class="records">
        ${contributors.map((c) => `
          <div class="record-row">
            <strong>${esc(c.name)}</strong>
            <span>${c.part ? esc(c.part) : ""}${c.points != null ? ` · ${esc(c.points)} Punkte` : ""}</span>
          </div>`).join("") || '<p class="hint">Noch keine Mitwirkenden eingetragen.</p>'}
      </div>
    </section>` : ""}

    <section class="card">
      <h2>Verifizierungs-Video</h2>
      ${videoBlock}
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
        </div>` : `<p class="hint">Noch keine bestätigten Records. <a href="einreichen.html?record=${esc(level.id)}">Sei der Erste!</a></p>`}
    </section>`;

  const play = app.querySelector(".video-play");
  if (play) play.addEventListener("click", () => {
    const box = document.getElementById("video");
    box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(play.dataset.yt)}?autoplay=1"
      title="Verifizierungs-Video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
  });
})();
