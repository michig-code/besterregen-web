// Gemeinsame Hilfsfunktionen für alle Seiten
const API_URL = "/api";
const TOKEN_KEY = "br_token";

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const t = getToken();
  if (t) headers.Authorization = "Bearer " + t;
  let body = opts.body;
  if (body !== undefined && !(body instanceof Blob)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const res = await fetch(API_URL + path, { ...opts, headers, body });
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data: data || {} };
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

const ERRORS = {
  not_logged_in: "Bitte zuerst mit Discord anmelden.",
  forbidden: "Dafür fehlt dir die Berechtigung.",
  missing_fields: "Bitte alle Pflichtfelder ausfüllen.",
  invalid_level_id: "Die Level-ID ist ungültig (nur Ziffern).",
  invalid_video: "Der Video-Link muss mit https:// beginnen.",
  invalid_image: "Das Bild ist ungültig. Bitte erneut hochladen.",
  invalid_list: "Bitte eine Liste auswählen.",
  invalid_duration: "Bitte die Länge in Sekunden angeben.",
  too_long: "Das Level ist zu lang für diese Liste (maximal {max} Sekunden).",
  invalid_level: "Bitte ein Level auswählen.",
  invalid_image_type: "Erlaubt sind JPG, PNG oder WebP.",
  invalid_image_size: "Das Bild ist zu groß (maximal 2 MB) oder leer.",
  upload_failed: "Das Bild konnte nicht hochgeladen werden.",
  already_reviewed: "Dieser Eintrag wurde schon bearbeitet.",
  invalid_order: "Die Reihenfolge passt nicht zur Liste. Bitte die Seite neu laden.",
  invalid_slug: "Das Kürzel darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.",
  invalid_webhook: "Die Webhook-Adresse ist ungültig.",
  invalid_event: "Unbekanntes Ereignis.",
  not_found: "Nicht gefunden.",
};
function errText(d) {
  const e = d && d.error;
  if (e === "too_long" && d.max) return ERRORS.too_long.replace("{max}", d.max);
  return ERRORS[e] || "Es ist ein Fehler aufgetreten.";
}

function avatarUrl(u) {
  return u && u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=64`
    : "https://cdn.discordapp.com/embed/avatars/0.png";
}
