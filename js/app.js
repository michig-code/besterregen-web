// Startseite: Listen-Tabs und Level nach Platz
(async function () {
  const tabs = document.getElementById("list-tabs");
  const out = document.getElementById("level-list");

  const res = await api("/lists");
  const lists = (res.data && res.data.lists) || [];
  if (!res.ok || !lists.length) {
    out.innerHTML = '<p class="status">Noch keine Listen vorhanden.</p>';
    return;
  }

  async function show(list) {
    out.innerHTML = '<p class="status">Lädt …</p>';
    const r = await api(`/lists/${list.slug}/levels`);
    const levels = (r.data && r.data.levels) || [];
    if (!levels.length) {
      out.innerHTML = '<p class="status">Hier gibt es noch keine Level.</p>';
      return;
    }
    out.innerHTML = levels.map((lvl, i) => `
      <a class="level level-link" href="level.html?id=${esc(lvl.id)}" style="animation-delay:${Math.min(i, 12) * 40}ms">
        <div class="rank">#${esc(lvl.position)}</div>
        <div>
          <h3>${esc(lvl.name)}</h3>
          <p>von ${esc(lvl.creator)}${lvl.duration_seconds ? ` · ${esc(lvl.duration_seconds)} s` : ""}</p>
        </div>
      </a>`).join("");
  }

  lists.forEach((list, idx) => {
    const btn = document.createElement("button");
    btn.textContent = list.name;
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
