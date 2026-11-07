// Startseite: Listen-Tabs, Plätze, Punkte, Suche
(async function () {
  const tabs = document.getElementById("list-tabs");
  const out = document.getElementById("level-list");
  const filter = document.getElementById("filter");
  let current = [];

  const res = await api("/lists");
  const lists = (res.data && res.data.lists) || [];
  if (!res.ok || !lists.length) {
    out.innerHTML = '<p class="status">Noch keine Listen vorhanden.</p>';
    return;
  }

  function draw() {
    const q = filter.value.trim().toLowerCase();
    const items = current.filter((l) => !q || l.name.toLowerCase().includes(q) || (l.creator || "").toLowerCase().includes(q));
    if (!current.length) { out.innerHTML = '<p class="status">Hier gibt es noch keine Level.</p>'; return; }
    if (!items.length) { out.innerHTML = '<p class="status">Keine Treffer.</p>'; return; }
    out.innerHTML = items.map((lvl, i) => `
      <a class="level level-link" href="/l/${esc(list.slug)}/${esc(lvl.position)}" style="animation-delay:${Math.min(i, 12) * 30}ms">
        ${lvl.image_url ? `<img class="thumb" src="${esc(lvl.image_url)}" alt="" loading="lazy">` : `<div class="rank">#${esc(lvl.position)}</div>`}
        <div class="level-text">
          <h3><span class="pos">#${esc(lvl.position)}</span> ${esc(lvl.name)}</h3>
          <p>von ${esc(lvl.creator)} · verifiziert von ${esc(lvl.verifier)}</p>
          <p class="points">${esc(lvl.points)} Punkte${lvl.completions ? ` · ${esc(lvl.completions)} Completions` : ""}</p>
        </div>
      </a>`).join("");
  }

  let subIds = null;
  async function loadSubs() {
    const me = await api("/me").catch(() => ({ data: {} }));
    if (!me.data || !me.data.loggedIn) return null;
    const r = await api("/subscriptions");
    return (r.data && r.data.listIds) || [];
  }
  async function renderSub(list) {
    const box = document.getElementById("sub-area");
    if (!box) return;
    if (subIds === null) subIds = await loadSubs();
    if (subIds === null) {
      box.innerHTML = '<p class="hint sub-hint">Melde dich an, um diese Liste zu abonnieren und über neue Level informiert zu werden.</p>';
      return;
    }
    const on = subIds.includes(list.id);
    box.innerHTML = `<button class="chip-btn sub-btn ${on ? "on" : ""}" type="button">${on ? "🔔 Abonniert" : "🔕 Abonnieren"}</button>
      <span class="hint sub-hint">${on ? "Du bekommst Benachrichtigungen zu neuen Leveln dieser Liste." : "Lass dich über neue Level dieser Liste informieren."}</span>`;
    box.querySelector(".sub-btn").addEventListener("click", async () => {
      const r = on
        ? await api(`/subscriptions/${list.id}`, { method: "DELETE" })
        : await api("/subscriptions", { method: "POST", body: { listId: list.id } });
      if (r.ok) { subIds = on ? subIds.filter((x) => x !== list.id) : [...subIds, list.id]; renderSub(list); }
    });
  }

  const flagOf = (c) => (c ? String.fromCodePoint(...c.toUpperCase().split("").map((ch) => 127397 + ch.charCodeAt(0))) : "");
  async function renderTeam(list) {
    const card = document.getElementById("team-card");
    if (!card) return;
    const r = await api(`/lists/${list.slug}/staff`);
    const row = (p) => `<a class="team-row team-link" href="profile.html?discord=${encodeURIComponent(p.discordId)}">
        <img src="${esc(p.avatar ? `https://cdn.discordapp.com/avatars/${p.discordId}/${p.avatar}.png?size=64` : "https://cdn.discordapp.com/embed/avatars/0.png")}" alt="" width="32" height="32">
        <span>${flagOf(p.country)} ${esc(p.name)}</span></a>`;
    const eds = (r.data.editors || []).map(row).join("");
    const hlp = (r.data.helpers || []).map(row).join("");
    card.innerHTML = `<h3>Listenteam</h3>
      <p class="hint">Bei Problemen mit der Liste wende dich an:</p>
      ${eds ? `<h4 class="team-title">Editoren</h4>${eds}` : ""}
      ${hlp ? `<h4 class="team-title">Helfer</h4>${hlp}` : ""}
      ${!eds && !hlp ? '<p class="hint">Noch kein Team eingetragen.</p>' : ""}`;
  }

  async function show(list) {
    renderTeam(list);
    renderSub(list);
    out.innerHTML = '<p class="status">Lädt …</p>';
    const r = await api(`/lists/${list.slug}/levels`);
    current = (r.data && r.data.levels) || [];
    const badge = tabs.querySelector(`[data-count="${list.id}"]`);
    if (badge) badge.textContent = `${current.length} Level`;
    draw();
  }

  filter.addEventListener("input", draw);

  lists.forEach((list, idx) => {
    const btn = document.createElement("button");
    btn.innerHTML = `${esc(list.name)}<small data-count="${esc(list.id)}"></small>`;
    btn.setAttribute("role", "tab");
    btn.addEventListener("click", () => {
      tabs.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      show(list);
    });
    tabs.appendChild(btn);
    if (idx === 0) btn.click();
  });
})();
