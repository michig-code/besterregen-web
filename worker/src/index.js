// Besterregen API (Cloudflare Worker)
// Routen:
//   GET  /auth/discord            -> leitet zu Discord-Login weiter
//   GET  /auth/callback           -> tauscht Code, speichert Sitzung, leitet zurück
//   GET  /me                      -> aktueller Nutzer (Discord-Daten + Rollen)
//   POST /verify/start            -> erzeugt Verifizierungs-Code
//   POST /verify/check            -> liest Kommentare des Levels und verknüpft GD-Account
//   POST /logout

const DISCORD_AUTH = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN = "https://discord.com/api/oauth2/token";
const DISCORD_API = "https://discord.com/api";
const GD_COMMENTS = "https://www.boomlings.com/database/getGJComments21.php";
const GD_SECRET = "Wmfd2893gb7"; // öffentlicher Standardwert, den GD-Tools nutzen
const COOKIE = "br_session";
const CODE_TTL_MS = 30 * 60 * 1000; // Code gilt 30 Minuten

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Die API läuft unter besterregen.de/api/* und wird hier ohne Präfix verarbeitet
    if (url.pathname.startsWith("/api/")) url.pathname = url.pathname.slice(4);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      if (url.pathname === "/auth/discord") return authStart(env);
      if (url.pathname === "/auth/callback") return await authCallback(url, env);
      if (url.pathname === "/me") return json(await currentUser(request, env), 200, cors);
      if (url.pathname === "/verify/start" && request.method === "POST")
        return json(await verifyStart(request, env), 200, cors);
      if (url.pathname === "/verify/check" && request.method === "POST")
        return json(await verifyCheck(request, env), 200, cors);
      if (url.pathname === "/logout") return logout(env);
      return json({ error: "not_found" }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ error: "server_error" }, 500, cors);
    }
  },
};

// ---------- Discord-Login ----------

function authStart(env) {
  const state = randomToken(16);
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: `${env.API_URL}/auth/callback`,
    response_type: "code",
    scope: "identify guilds.members.read",
    state,
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${DISCORD_AUTH}?${params}`,
      "Set-Cookie": `${COOKIE}_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`,
    },
  });
}

async function authCallback(url, env) {
  const code = url.searchParams.get("code");
  if (!code) return Response.redirect(env.SITE_URL, 302);

  const tokenRes = await fetch(DISCORD_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${env.API_URL}/auth/callback`,
    }),
  });
  if (!tokenRes.ok) return Response.redirect(`${env.SITE_URL}/verify.html?login=failed`, 302);
  const token = await tokenRes.json();

  const me = await discordGet("/users/@me", token.access_token);
  const sessionId = randomToken(32);
  await db(env, "POST", "sessions", {
    id: sessionId,
    discord_id: me.id,
    discord_name: me.global_name || me.username,
    access_token: token.access_token,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  });

  return new Response(null, {
    status: 302,
    headers: {
      // Sitzungsschlüssel im Fragment (#), damit er nicht an den Server geht; die Seite speichert ihn selbst
      Location: `${env.SITE_URL}/verify.html#token=${sessionId}`,
      "Set-Cookie": `${COOKIE}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
    },
  });
}

async function currentUser(request, env) {
  const session = await getSession(request, env);
  if (!session) return { loggedIn: false };

  // Rollen des Nutzers auf dem Server abfragen (Scope guilds.members.read)
  let roles = [];
  try {
    const member = await discordGet(
      `/users/@me/guilds/${env.GUILD_ID}/member`,
      session.access_token
    );
    roles = member.roles || [];
  } catch {
    roles = [];
  }

  const link = await getGdLink(env, session.discord_id);
  return {
    loggedIn: true,
    discordName: session.discord_name,
    roles,
    gdName: link ? link.gd_name : null,
  };
}

// ---------- GD-Verifizierung ----------

async function verifyStart(request, env) {
  const session = await getSession(request, env);
  if (!session) return { error: "not_logged_in" };

  const code = "BR-" + randomToken(3).toUpperCase();
  // alte Codes des Nutzers entfernen
  await db(env, "DELETE", `verify_codes?discord_id=eq.${session.discord_id}`);
  await db(env, "POST", "verify_codes", {
    discord_id: session.discord_id,
    code,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  return { code, levelId: env.VERIFY_LEVEL_ID, expiresInMinutes: 30 };
}

async function verifyCheck(request, env) {
  const session = await getSession(request, env);
  if (!session) return { error: "not_logged_in" };

  const rows = await db(env, "GET", `verify_codes?discord_id=eq.${session.discord_id}&select=*`);
  const pending = rows && rows[0];
  if (!pending) return { error: "no_code" };
  if (new Date(pending.expires_at) < new Date()) {
    await db(env, "DELETE", `verify_codes?discord_id=eq.${session.discord_id}`);
    return { error: "code_expired" };
  }

  const comments = await fetchLevelComments(env.VERIFY_LEVEL_ID);
  const hit = comments.find((c) => c.text.includes(pending.code));
  if (!hit) return { verified: false, reason: "not_found" };

  // Ein GD-Account darf nur einem Discord-Account gehören
  const taken = await db(env, "GET", `gd_links?gd_account_id=eq.${hit.accountId}&select=discord_id`);
  if (taken && taken.length && taken[0].discord_id !== session.discord_id) {
    return { verified: false, reason: "account_already_linked" };
  }

  await db(env, "POST", "gd_links", {
    discord_id: session.discord_id,
    gd_account_id: hit.accountId,
    gd_name: hit.userName,
    verified_at: new Date().toISOString(),
  }, { upsert: true });
  await db(env, "DELETE", `verify_codes?discord_id=eq.${session.discord_id}`);

  return { verified: true, gdName: hit.userName };
}

// Liest die Kommentare eines Levels von den GD-Servern.
// Hinweis: Das Format ist inoffiziell. Die Zuordnung der Felder
// (2 = Text, 4 = Likes, 6 = Kommentar-ID, 1 = Benutzer-ID ...) muss
// einmal mit einer echten Antwort geprüft werden.
async function fetchLevelComments(levelId) {
  const res = await fetch(GD_COMMENTS, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "",
    },
    body: new URLSearchParams({
      levelID: levelId,
      page: "0",
      total: "0",
      secret: GD_SECRET,
      mode: "0",
      count: "100",
    }),
  });
  const text = await res.text();
  if (!text || text === "-1") return [];

  const [commentPart, userPart = ""] = text.split("#");
  const users = parseUsers(userPart);

  return commentPart
    .split("|")
    .filter(Boolean)
    .map((entry) => {
      const f = parseFields(entry);
      const text = decodeBase64Url(f["2"] || "");
      const playerId = f["1"] || f["3"];
      const user = users[playerId] || {};
      return { text, accountId: user.accountId, userName: user.userName };
    })
    .filter((c) => c.accountId && c.userName);
}

function parseFields(entry) {
  const parts = entry.split("~");
  const out = {};
  for (let i = 0; i < parts.length - 1; i += 2) out[parts[i]] = parts[i + 1];
  return out;
}

function parseUsers(part) {
  const map = {};
  part.split("|").filter(Boolean).forEach((entry) => {
    // Format der Benutzerdaten: userName:playerID:accountID (inoffiziell, muss live geprüft werden)
    const [userName, playerId, accountId] = entry.split(":");
    if (userName && playerId && accountId) {
      map[playerId] = { userName, accountId };
    }
  });
  return map;
}

function decodeBase64Url(s) {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    return atob(b64);
  } catch {
    return "";
  }
}

// ---------- Hilfsfunktionen ----------

async function getSession(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : m && m[1];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await db(env, "GET", `sessions?id=eq.${token}&select=*`);
  const s = rows && rows[0];
  if (!s || new Date(s.expires_at) < new Date()) return null;
  return s;
}

async function getGdLink(env, discordId) {
  const rows = await db(env, "GET", `gd_links?discord_id=eq.${discordId}&select=*`);
  return rows && rows[0];
}

async function discordGet(path, accessToken) {
  const res = await fetch(DISCORD_API + path, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`discord ${path} ${res.status}`);
  return res.json();
}

async function db(env, method, path, body, opts = {}) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  if (method === "POST") {
    headers.Prefer = opts.upsert
      ? "return=minimal,resolution=merge-duplicates"
      : "return=minimal";
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`supabase ${method} ${path} ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function logout(env) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: env.SITE_URL,
      "Set-Cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    },
  });
}

function randomToken(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = origin === env.SITE_URL;
  return {
    "Access-Control-Allow-Origin": allowed ? origin : env.SITE_URL,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}
