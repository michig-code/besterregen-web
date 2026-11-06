// Lädt die Listen aus data/listen.json und zeigt sie an.
// Neue Listen einfach dort ergänzen, sie erscheinen automatisch als Tab.
(async function () {
  const tabs = document.getElementById("list-tabs");
  const out = document.getElementById("level-list");

  let data;
  try {
    const res = await fetch("data/listen.json", { cache: "no-store" });
    data = await res.json();
  } catch (e) {
    out.textContent = "Die Listen konnten nicht geladen werden.";
    return;
  }

  function show(list) {
    out.innerHTML = "";
    list.levels.forEach((lvl, i) => {
      const row = document.createElement("div");
      row.className = "level";
      row.innerHTML = `
        <div class="rank">#${i + 1}</div>
        <div>
          <h3></h3>
          <p></p>
        </div>`;
      row.querySelector("h3").textContent = lvl.name;
      row.querySelector("p").textContent = `by ${lvl.creator}`;
      out.appendChild(row);
    });
  }

  data.lists.forEach((list, idx) => {
    const btn = document.createElement("button");
    btn.textContent = list.name;
    btn.addEventListener("click", () => {
      tabs.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      show(list);
    });
    tabs.appendChild(btn);
    if (idx === 0) btn.click();
  });
})();
