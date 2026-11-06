// Level oder Record einreichen (nur angemeldet)
(async function () {
  const app = document.getElementById("app");
  const me = await api("/me").catch(() => ({ data: {} }));
  if (!me.data || !me.data.loggedIn) {
    app.innerHTML = `<div class="card"><p>Zum Einreichen bitte zuerst mit Discord anmelden.</p>
      <p><a class="btn" href="verify.html">Zur Anmeldung</a></p></div>`;
    return;
  }

  const listRes = await api("/lists");
  const lists = (listRes.data && listRes.data.lists) || [];
  const preRecord = new URLSearchParams(location.search).get("record");
  const startTab = preRecord ? "record" : "level";

  app.innerHTML = `
    <div class="tabs-row">
      <button class="chip-btn ${startTab === "level" ? "on" : ""}" data-tab="level">Level einreichen</button>
      <button class="chip-btn ${startTab === "record" ? "on" : ""}" data-tab="record">Record einreichen</button>
    </div>

    <section class="card" id="panel-level" ${startTab !== "level" ? "hidden" : ""}>
      <h2>Level einreichen</h2>
      <form class="role-form" id="form-level">
        <label>Liste
          <select name="listId" required>
            ${lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}${l.max_duration_seconds ? ` (bis ${esc(l.max_duration_seconds)} s)` : ""}</option>`).join("")}
          </select>
        </label>
        <label>Level-Name <input name="name" maxlength="80" required></label>
        <label>Creator <input name="creator" maxlength="60" required></label>
        <label>Verifier <input name="verifier" maxlength="60" required></label>
        <label>GD-Level-ID <input name="gdLevelId" inputmode="numeric" maxlength="12" required></label>
        <label>Länge in Sekunden <input name="durationSeconds" type="number" min="1" required></label>
        <label>Video-Link <input name="videoUrl" type="url" maxlength="300" placeholder="https://…" required></label>
        <label>Bild (Pflicht, max. 2 MB)
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required>
        </label>
        <div class="form-actions"><button class="btn" type="submit">Level einreichen</button></div>
        <p class="hint" data-msg></p>
      </form>
    </section>

    <section class="card" id="panel-record" ${startTab !== "record" ? "hidden" : ""}>
      <h2>Record einreichen</h2>
      <form class="role-form" id="form-record">
        <label>Liste
          <select id="rec-list" required>
            ${lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("")}
          </select>
        </label>
        <label>Level
          <select name="levelId" id="rec-level" required><option value="">Bitte wählen …</option></select>
        </label>
        <label>Dein Spielername <input name="playerName" maxlength="40" required></label>
        <label>Video-Link <input name="videoUrl" type="url" maxlength="300" placeholder="https://…" required></label>
        <label>Anmerkung (optional) <input name="notes" maxlength="300"></label>
        <div class="form-actions"><button class="btn" type="submit">Record einreichen</button></div>
        <p class="hint" data-msg></p>
      </form>
    </section>`;

  // Tabs
  app.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => {
    app.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === btn));
    document.getElementById("panel-level").hidden = btn.dataset.tab !== "level";
    document.getElementById("panel-record").hidden = btn.dataset.tab !== "record";
  }));

  // Level-Liste für Records laden, je nach gewählter Liste
  const recList = document.getElementById("rec-list");
  const recLevel = document.getElementById("rec-level");
  async function loadLevels() {
    const list = lists.find((l) => l.id === recList.value);
    recLevel.innerHTML = '<option value="">Lädt …</option>';
    const r = await api(`/lists/${list.slug}/levels`);
    const levels = (r.data && r.data.levels) || [];
    recLevel.innerHTML = '<option value="">Bitte wählen …</option>' +
      levels.map((l) => `<option value="${esc(l.id)}">#${esc(l.position)} ${esc(l.name)}</option>`).join("");
    if (preRecord) recLevel.value = preRecord;
  }
  recList.addEventListener("change", loadLevels);
  if (lists.length) loadLevels();

  // Level absenden: erst Bild hochladen, dann Einreichung
  document.getElementById("form-level").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = form.querySelector("[data-msg]");
    const f = Object.fromEntries(new FormData(form));
    const file = form.image.files[0];
    msg.textContent = "Bild wird hochgeladen …";
    const up = await api("/upload", { method: "POST", headers: { "Content-Type": file.type }, body: file });
    if (!up.ok) { msg.textContent = errText(up.data); return; }
    msg.textContent = "Level wird eingereicht …";
    const res = await api("/submit/level", { method: "POST", body: {
      listId: f.listId, name: f.name, creator: f.creator, verifier: f.verifier,
      gdLevelId: f.gdLevelId, durationSeconds: Number(f.durationSeconds), videoUrl: f.videoUrl,
      imageUrl: up.data.url,
    }});
    if (!res.ok) { msg.textContent = errText(res.data); return; }
    form.reset();
    msg.textContent = "Danke! Dein Level wurde eingereicht und wird geprüft.";
  });

  // Record absenden
  document.getElementById("form-record").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = form.querySelector("[data-msg]");
    const f = Object.fromEntries(new FormData(form));
    const res = await api("/submit/record", { method: "POST", body: {
      levelId: f.levelId, playerName: f.playerName, videoUrl: f.videoUrl, notes: f.notes,
    }});
    if (!res.ok) { msg.textContent = errText(res.data); return; }
    form.reset();
    msg.textContent = "Danke! Dein Record wurde eingereicht und wird geprüft.";
  });
})();
