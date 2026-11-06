// Live-Anzeige: Mitglieder und aktive Nutzer des Discord-Servers
(function () {
  const box = document.getElementById("discord-stats");
  if (!box) return;
  const fmt = (n) => (n == null ? "–" : Number(n).toLocaleString("de-DE"));

  async function load() {
    try {
      const r = await fetch("/api/discord/stats");
      const d = await r.json();
      if (d.error) {
        box.innerHTML = '<p class="hint">Die Discord-Zahlen sind gerade nicht verfügbar.</p>';
        return;
      }
      box.innerHTML = `
        <div class="dstat"><strong><span class="dot-online"></span>${fmt(d.online)}</strong><small>online</small></div>
        <div class="dstat"><strong>${fmt(d.members)}</strong><small>Mitglieder</small></div>`;
    } catch {
      box.innerHTML = '<p class="hint">Die Discord-Zahlen sind gerade nicht verfügbar.</p>';
    }
  }
  load();
  setInterval(load, 60000);
})();
