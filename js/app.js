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
      <a class="level level-link" href="level.html?id=${esc(lvl.id)}" style="animation-delay:${Math.min(i, 12) * 30}ms">
        ${lvl.image_url ? `<img class="thumb" src="${esc(lvl.image_url)}" alt="" loading="lazy">` : `<div class="rank">#${esc(lvl.position)}</div>`}
        <div class="level-text">
          <h3><span class="pos">#${esc(lvl.position)}</span> ${esc(lvl.name)}</h3>
          <p>von ${esc(lvl.creator)} · verifiziert von ${esc(lvl.verifier)}</p>
          <p class="points">${esc(lvl.points)} Punkte${lvl.completions ? ` · ${esc(lvl.completions)} Completions` : ""}</p>
        </div>
      </a>`).join("");
  }

  async function show(list) {
    out.innerHTML = '<p class="status">Lädt …</p>';
    const r = await api(`/lists/${list.slug}/levels`);
    current = (r.data && r.data.levels) || [];
    current.forEach((l) => { l.points = l.points; });
    draw();
  }

  filter.addEventListener("input", draw);

  lists.forEach((list, idx) => {
    const btn = document.createElement("button");
    const places = list.max_places ? `Plätze 1–${list.max_places}` : "";
    btn.innerHTML = `${esc(list.name)}${places ? `<small>${esc(places)}</small>` : ""}`;
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
