// Sprachumschalter DE / EN (merkt sich die Wahl im Browser)
(function () {
  const btn = document.getElementById("lang-btn");
  const apply = () => {
    const en = document.documentElement.dataset.lang === "en";
    if (btn) btn.textContent = en ? "EN" : "DE";
    document.documentElement.lang = en ? "en" : "de";
  };
  apply();
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.lang === "en" ? "de" : "en";
    if (next === "en") document.documentElement.dataset.lang = "en";
    else delete document.documentElement.dataset.lang;
    try { localStorage.setItem("br_lang", next); } catch {}
    location.reload();
  });
})();
