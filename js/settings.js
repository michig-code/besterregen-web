// Einstellungen: Profil, Land, GD-Verknüpfung, Rechte, Abmelden
const COUNTRIES = [["DE","Deutschland"],["AT","Österreich"],["CH","Schweiz"],["IT","Italien"],["FR","Frankreich"],["ES","Spanien"],["NL","Niederlande"],["BE","Belgien"],["PL","Polen"],["CZ","Tschechien"],["SE","Schweden"],["NO","Norwegen"],["DK","Dänemark"],["FI","Finnland"],["GB","Vereinigtes Königreich"],["IE","Irland"],["PT","Portugal"],["GR","Griechenland"],["TR","Türkei"],["RU","Russland"],["UA","Ukraine"],["US","USA"],["CA","Kanada"],["BR","Brasilien"],["MX","Mexiko"],["AR","Argentinien"],["IN","Indien"],["JP","Japan"],["KR","Südkorea"],["CN","China"],["AU","Australien"],["IL","Israel"],["JO","Jordanien"],["SA","Saudi-Arabien"],["EG","Ägypten"]];
(async function () {
  const app = document.getElementById("app");
  const me = await api("/me").catch(() => ({ data: {} }));
  const m = me.data || {};
  if (!m.loggedIn) {
    app.innerHTML = `<div class="card"><p>Du bist nicht angemeldet.</p>
      <p><a class="btn" href="verify.html">Mit Discord anmelden</a></p></div>`;
    return;
  }

  const defs = await api("/admin/permissions");
  const labels = (defs.data && defs.data.permissions) || {};
  const perms = m.permissions || [];

  app.innerHTML = `
    <section class="card settings-card">
      <div class="profile">
        <img src="${esc(m.avatar || "https://cdn.discordapp.com/embed/avatars/0.png")}" alt="" width="72" height="72" onerror="this.onerror=null;this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div>
          <h2>${esc(m.discordName)}</h2>
          <small class="hint">Discord-ID ${esc(m.discordId)}</small>
        </div>
      </div>
    </section>

    <section class="card settings-card">
      <h3>GD-Account</h3>
      ${m.gdName
        ? `<p>Verknüpft mit <strong>${esc(m.gdName)}</strong>.</p>`
        : `<p>Noch nicht verknüpft.</p>`}
      <p class="hint">Optional. Du kannst die Seite auch ohne GD-Account nutzen.</p>
      <div class="form-actions">
        ${m.gdName
          ? `<a class="btn ghost" href="verify.html">Neu verknüpfen</a>
             <button class="btn ghost danger-btn" id="unlink-btn" type="button">Verknüpfung entfernen</button>`
          : `<a class="btn" href="verify.html">GD-Account verknüpfen</a>`}
      </div>
      <p class="hint" id="gd-msg"></p>
    </section>

    <section class="card settings-card">
      <h3>Rechte auf der Seite</h3>
      ${perms.length
        ? `<ul class="perm-list">${perms.map((p) => `<li><strong>${esc(p)}</strong>: ${esc(labels[p] || "")}</li>`).join("")}</ul>`
        : `<p class="hint">Keine besonderen Rechte.</p>`}
    </section>

    <section class="card settings-card">
      <h3>Land</h3>
      <p class="hint">Wird neben deinem Namen als Flagge angezeigt, z. B. in den Listen-Teams.</p>
      <div class="form-actions">
        <select id="country" class="role-form-select">
          <option value="">Keine Angabe</option>
          ${COUNTRIES.map(([c, n]) => `<option value="${c}" ${m.country === c ? "selected" : ""}>${n}</option>`).join("")}
        </select>
        <button class="btn ghost" id="country-btn" type="button">Speichern</button>
      </div>
      <p class="hint" id="country-msg"></p>
    </section>

    <section class="card settings-card">
      <h3>Benachrichtigungen</h3>
      <p class="hint">Neue Level, Records und Entscheidungen erscheinen in der Glocke oben rechts. Zusätzlich kannst du Browser-Benachrichtigungen erlauben, auch wenn die Seite im Hintergrund ist.</p>
      <p id="notif-status" class="hint"></p>
      <div class="form-actions"><button class="btn ghost" id="notif-btn" type="button">Browser-Benachrichtigungen erlauben</button></div>
    </section>

    <section class="card settings-card">
      <h3>Konto</h3>
      <p class="hint">Abmelden löscht die Sitzung auf dem Server und auf diesem Gerät.</p>
      <button class="btn ghost" id="logout-btn">Abmelden</button>
    </section>`;

  const unlink = document.getElementById("unlink-btn");
  if (unlink) unlink.addEventListener("click", async () => {
    if (!confirm("GD-Verknüpfung wirklich entfernen?")) return;
    const r = await api("/gd/unlink", { method: "POST" });
    if (!r.ok) { document.getElementById("gd-msg").textContent = errText(r.data); return; }
    location.reload();
  });

  document.getElementById("country-btn").addEventListener("click", async () => {
    const v = document.getElementById("country").value;
    const r = await api("/profile/country", { method: "POST", body: { country: v || null } });
    document.getElementById("country-msg").textContent = r.ok ? "Gespeichert." : errText(r.data);
  });

  const nBtn = document.getElementById("notif-btn");
  const nStatus = document.getElementById("notif-status");
  function showNotifState() {
    if (!("Notification" in window)) { nStatus.textContent = "Dein Browser unterstützt keine Browser-Benachrichtigungen."; nBtn.hidden = true; return; }
    if (Notification.permission === "granted") { nStatus.textContent = "Browser-Benachrichtigungen sind erlaubt."; nBtn.hidden = true; }
    else if (Notification.permission === "denied") { nStatus.textContent = "Du hast sie im Browser blockiert. Dort kannst du sie wieder freigeben."; nBtn.hidden = true; }
    else nStatus.textContent = "Noch nicht erlaubt.";
  }
  showNotifState();
  nBtn.addEventListener("click", async () => {
    await Notification.requestPermission();
    showNotifState();
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    try { localStorage.removeItem("br_token"); } catch {}
    location.href = "index.html";
  });
})();
