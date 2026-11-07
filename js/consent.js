// Cookie-Hinweis: erscheint unten mittig, bis eine Wahl getroffen wurde
(function () {
  const KEY = "br_consent";
  try { if (localStorage.getItem(KEY)) return; } catch { return; }

  const box = document.createElement("div");
  box.className = "consent";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Cookie-Hinweis");
  box.innerHTML = `
    <p><span class="de">Wir nutzen nur technisch nötige Cookies und Browser-Speicher, damit du angemeldet bleibst und deine Einstellungen gespeichert werden. Keine Werbung, kein Tracking.</span><span class="en">We only use technically necessary cookies and browser storage so you stay logged in and your settings are saved. No ads, no tracking.</span></p>
    <div class="consent-actions">
      <button type="button" class="chip-btn" data-choice="necessary"><span class="de">Nur nötige</span><span class="en">Necessary only</span></button>
      <button type="button" class="btn small" data-choice="all"><span class="de">Akzeptieren</span><span class="en">Accept</span></button>
    </div>`;
  document.body.appendChild(box);

  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-choice]");
    if (!b) return;
    try { localStorage.setItem(KEY, b.dataset.choice); } catch {}
    box.classList.add("gone");
    setTimeout(() => box.remove(), 300);
  });
})();
