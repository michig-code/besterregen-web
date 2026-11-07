// Mitgliederliste: nummeriert, mit Suche und Nachladen
(async function () {
  const app = document.getElementById("app");
  const me = await api("/me").catch(() => ({ data: {} }));
  if (!me.data || !me.data.loggedIn) {
    app.innerHTML = `<div class="card"><p>Bitte zuerst anmelden, um die Mitglieder zu sehen.</p>
      <p><a class="btn" href="verify.html">Zur Anmeldung</a></p></div>`;
    return;
  }
  app.innerHTML = `
    <section class="card">
      <input id="mq" class="search" type="search" placeholder="Name suchen …" autocomplete="off">
      <div class="table-wrap">
        <table class="stats-table">
          <thead><tr><th>#</th><th>Mitglied</th><th class="num">Rang</th><th class="num">Punkte</th><th class="num">Completions</th><th class="num">Erstellt</th></tr></thead>
          <tbody id="mrows"></tbody>
        </table>
      </div>
      <p class="hint" id="mcount"></p>
      <div class="form-actions"><button class="btn ghost" id="mmore" type="button" hidden>Mehr laden</button></div>
    </section>`;

  const rows = document.getElementById("mrows");
  const count = document.getElementById("mcount");
  const more = document.getElementById("mmore");
  let q = "";
  let offset = 0;
  let total = 0;

  const rowHtml = (m) => `
    <tr>
      <td class="rank-cell">${esc(m.number)}</td>
      <td class="player-cell">
        <img src="${esc(m.avatar || "https://cdn.discordapp.com/embed/avatars/0.png")}" alt="" width="30" height="30">
        <a class="type-link" href="profile.html?discord=${encodeURIComponent(m.discordId)}"><strong>${esc(m.name)}</strong></a>
      </td>
      <td class="num">${m.rank ? `${m.tied ? "=" : ""}${esc(m.rank)}` : "–"}</td>
      <td class="num">${esc(m.points)}</td>
      <td class="num">${esc(m.completions)}</td>
      <td class="num">${esc(m.created)}</td>
    </tr>`;

  async function load(reset) {
    if (reset) { offset = 0; rows.innerHTML = ""; }
    const res = await api(`/members?q=${encodeURIComponent(q)}&offset=${offset}&limit=50`);
    if (!res.ok) { app.innerHTML = `<p class="status">${esc(errText(res.data))}</p>`; return; }
    total = res.data.total;
    const html = res.data.items.map(rowHtml).join("");
    rows.insertAdjacentHTML("beforeend", html || (offset === 0 ? '<tr><td colspan="6" class="hint">Keine Treffer.</td></tr>' : ""));
    offset += res.data.items.length;
    count.textContent = `${offset} von ${total} Mitgliedern`;
    more.hidden = !res.data.hasMore;
  }

  let timer = null;
  document.getElementById("mq").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { q = e.target.value.trim(); load(true); }, 300);
  });
  more.addEventListener("click", () => load(false));
  load(true);
})();
