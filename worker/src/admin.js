// Rollen und Rechte der Seite (unabhängig von den Discord-Rollen)
import { db } from "./db.js";

export const PERMISSIONS = {
  admin: "Alles verwalten, inklusive Rollen",
  "roles.manage": "Rollen erstellen und Mitgliedern zuteilen",
  "lists.manage": "Listen und Level verwalten",
  "submissions.review": "Einsendungen annehmen oder ablehnen",
  "notifications.manage": "Discord-Benachrichtigungen festlegen",
};
const ALL = Object.keys(PERMISSIONS);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DISCORD_ID = /^\d{5,25}$/;

// Rechte eines Nutzers: Admins aus ADMIN_DISCORD_IDS haben alles, sonst die Rechte aller zugeteilten Rollen
export async function getUserPermissions(env, discordId) {
  const adminIds = (env.ADMIN_DISCORD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (adminIds.includes(discordId)) return ALL;
  const links = await db(env, "GET", `user_site_roles?discord_id=eq.${encodeURIComponent(discordId)}&select=role_id`);
  if (!links || !links.length) return [];
  const ids = links.map((l) => l.role_id).join(",");
  const roles = await db(env, "GET", `site_roles?id=in.(${ids})&select=permissions`);
  return [...new Set((roles || []).flatMap((r) => r.permissions || []))];
}

const has = (perms, need) => perms.includes("admin") || perms.includes(need);

function validateRole(body, perms) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 32) return { error: "invalid_name" };
  const color = body?.color;
  if (!/^#[0-9a-fA-F]{6}$/.test(color || "")) return { error: "invalid_color" };
  const permissions = Array.isArray(body?.permissions) ? body.permissions : [];
  if (permissions.some((p) => !ALL.includes(p))) return { error: "invalid_permission" };
  if (permissions.includes("admin") && !has(perms, "admin")) return { error: "cannot_grant_admin" };
  return { role: { name, color, permissions: [...new Set(permissions)] } };
}

// Route-Behandlung für alles unter /admin/*
export async function handleAdmin(request, url, env, ctx) {
  const session = await ctx.getSession(request, env);
  if (!session) return ctx.json({ error: "not_logged_in" }, 401, ctx.cors);
  const perms = await getUserPermissions(env, session.discord_id);
  const path = url.pathname;
  const method = request.method;
  const body = ["POST", "PUT"].includes(method) ? await request.json().catch(() => null) : null;

  if (path === "/admin/permissions" && method === "GET") {
    return ctx.json({ permissions: PERMISSIONS, mine: perms }, 200, ctx.cors);
  }
  if (!has(perms, "roles.manage")) return ctx.json({ error: "forbidden" }, 403, ctx.cors);

  // Rollen
  if (path === "/admin/roles" && method === "GET") {
    const roles = (await db(env, "GET", "site_roles?select=*&order=name.asc")) || [];
    roles.forEach((r) => { r.weight = roleWeight(r.permissions); });
    roles.sort((x, y) => y.weight - x.weight || x.name.localeCompare(y.name, "de"));
    return ctx.json({ roles }, 200, ctx.cors);
  }
  if (path === "/admin/roles" && method === "POST") {
    const v = validateRole(body, perms);
    if (v.error) return ctx.json(v, 400, ctx.cors);
    const rows = await db(env, "POST", "site_roles", v.role, { prefer: "return=representation" });
    return ctx.json({ role: rows && rows[0] }, 200, ctx.cors);
  }
  // Wer hat diese Rolle?
  const roleMembersM = path.match(/^\/admin\/roles\/([0-9a-f-]{36})\/members$/);
  if (roleMembersM && method === "GET") {
    const links = (await db(env, "GET", `user_site_roles?role_id=eq.${roleMembersM[1]}&select=discord_id,source`)) || [];
    const ids = links.map((l) => encodeURIComponent(l.discord_id));
    let users = [];
    if (ids.length) {
      users = (await db(env, "GET", `users?discord_id=in.(${ids.join(",")})&select=discord_id,name,avatar`)) || [];
    }
    const members = links.map((l) => {
      const u = users.find((x) => x.discord_id === l.discord_id) || {};
      return { discordId: l.discord_id, name: u.name || "Mitglied", avatar: u.avatar || null, source: l.source };
    }).sort((x, y) => x.name.localeCompare(y.name, "de"));
    return ctx.json({ members }, 200, ctx.cors);
  }
  const roleMatch = path.match(/^\/admin\/roles\/([0-9a-f-]{36})$/);
  if (roleMatch && UUID.test(roleMatch[1]) && method === "PUT") {
    const v = validateRole(body, perms);
    if (v.error) return ctx.json(v, 400, ctx.cors);
    await db(env, "PATCH", `site_roles?id=eq.${roleMatch[1]}`, v.role);
    return ctx.json({ ok: true }, 200, ctx.cors);
  }
  if (roleMatch && UUID.test(roleMatch[1]) && method === "DELETE") {
    await db(env, "DELETE", `site_roles?id=eq.${roleMatch[1]}`);
    return ctx.json({ ok: true }, 200, ctx.cors);
  }

  // Discord-Rollen des Servers (über den Bot) für die Zuordnung
  if (path === "/admin/discord-roles" && method === "GET") {
    if (!has(perms, "roles.manage")) return ctx.json({ error: "forbidden" }, 403, ctx.cors);
    const res = await fetch(`https://discord.com/api/v10/guilds/${env.GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    });
    if (!res.ok) return ctx.json({ error: "discord_roles_failed" }, 502, ctx.cors);
    const all = await res.json();
    const roles = all
      .filter((r) => r.id !== env.GUILD_ID)
      .sort((x, y) => y.position - x.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color ? "#" + r.color.toString(16).padStart(6, "0") : "#999999" }));
    return ctx.json({ roles }, 200, ctx.cors);
  }

  // Zuordnung Discord-Rolle -> Seiten-Rolle speichern
  if (path === "/admin/discord-map" && method === "GET") {
    if (!has(perms, "roles.manage")) return ctx.json({ error: "forbidden" }, 403, ctx.cors);
    const rows = (await db(env, "GET", "discord_role_map?select=discord_role_id,site_role_id")) || [];
    return ctx.json({ mapping: rows }, 200, ctx.cors);
  }
  if (path === "/admin/discord-map" && method === "PUT") {
    if (!has(perms, "roles.manage")) return ctx.json({ error: "forbidden" }, 403, ctx.cors);
    const b = await request.json().catch(() => ({}));
    const rows = (Array.isArray(b?.mapping) ? b.mapping : [])
      .filter((m) => /^\d{5,25}$/.test(String(m?.discordRoleId)) && UUID.test(m?.siteRoleId || ""))
      .map((m) => ({ discord_role_id: String(m.discordRoleId), site_role_id: m.siteRoleId }));
    await db(env, "DELETE", "discord_role_map?discord_role_id=neq.0");
    if (rows.length) await db(env, "POST", "discord_role_map", rows, { prefer: "return=minimal" });
    await applyDiscordRoles(env);
    return ctx.json({ ok: true, count: rows.length }, 200, ctx.cors);
  }

  // Discord-Mitglieder synchronisieren (über den Bot)
  if (path === "/admin/members/sync" && method === "POST") {
    const count = await syncMembers(env);
    await applyDiscordRoles(env);
    return ctx.json({ ok: true, count }, 200, ctx.cors);
  }

  // Mitglieder alphabetisch, mit Suche und Buchstaben-Filter
  if (path === "/admin/members" && method === "GET") {
    const q = (url.searchParams.get("q") || "").trim();
    const letter = (url.searchParams.get("letter") || "").trim();
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    if (q && !/^[\p{L}\p{N} ._-]{1,32}$/u.test(q)) return ctx.json({ error: "invalid_query" }, 400, ctx.cors);
    let filter = "";
    if (q) filter += `&name=ilike.*${encodeURIComponent(q)}*`;
    if (/^[A-Za-z]$/.test(letter)) filter += `&name=ilike.${encodeURIComponent(letter.toUpperCase())}*`;
    const rows = (await db(env, "GET",
      `guild_members?select=discord_id,name,avatar&order=name.asc&limit=${limit + 1}&offset=${offset}${filter}`)) || [];
    const hasMore = rows.length > limit;
    const members = rows.slice(0, limit);
    const ids = members.map((m) => m.discord_id);
    let roleLinks = [], gdLinks = [];
    if (ids.length) {
      const inList = ids.map((i) => encodeURIComponent(i)).join(",");
      roleLinks = (await db(env, "GET", `user_site_roles?discord_id=in.(${inList})&select=discord_id,role_id`)) || [];
      gdLinks = (await db(env, "GET", `gd_links?discord_id=in.(${inList})&select=discord_id,gd_name`)) || [];
    }
    const latest = (await db(env, "GET", "guild_members?select=updated_at&order=updated_at.desc&limit=1"))?.[0];
    return ctx.json({
      members: members.map((m) => ({
        ...m,
        roleIds: roleLinks.filter((l) => l.discord_id === m.discord_id).map((l) => l.role_id),
        gdName: gdLinks.find((g) => g.discord_id === m.discord_id)?.gd_name || null,
      })),
      hasMore,
      total: await countMembers(env, filter),
      lastSynced: latest?.updated_at || null,
    }, 200, ctx.cors);
  }

  // Letzte Änderungen an Rollen
  if (path === "/admin/audit" && method === "GET") {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10) || 30));
    const rows = (await db(env, "GET", `role_audit?select=*&order=created_at.desc&limit=${limit}`)) || [];
    return ctx.json({ entries: rows }, 200, ctx.cors);
  }

  // Mitglieder suchen
  if (path === "/admin/users" && method === "GET") {
    const q = (url.searchParams.get("q") || "").trim();
    if (q && !/^[\p{L}\p{N} ._-]{1,32}$/u.test(q)) return ctx.json({ error: "invalid_query" }, 400, ctx.cors);
    const filter = q ? `&name=ilike.*${encodeURIComponent(q)}*` : "";
    const users = (await db(env, "GET", `users?select=discord_id,name,avatar&order=name.asc&limit=25${filter}`)) || [];
    let links = [];
    if (users.length) {
      const ids = users.map((u) => encodeURIComponent(u.discord_id)).join(",");
      links = (await db(env, "GET", `user_site_roles?discord_id=in.(${ids})&select=discord_id,role_id`)) || [];
    }
    const result = users.map((u) => ({
      ...u,
      roleIds: links.filter((l) => l.discord_id === u.discord_id).map((l) => l.role_id),
    }));
    return ctx.json({ users: result }, 200, ctx.cors);
  }

  // Rolle einem Mitglied zuteilen / entziehen
  const assign = path.match(/^\/admin\/users\/(\d{5,25})\/roles$/);
  if (assign && DISCORD_ID.test(assign[1]) && method === "POST") {
    const roleId = body?.roleId;
    if (!UUID.test(roleId || "")) return ctx.json({ error: "invalid_role" }, 400, ctx.cors);
    const role = await db(env, "GET", `site_roles?id=eq.${roleId}&select=name,permissions`);
    if (!role || !role[0]) return ctx.json({ error: "role_not_found" }, 404, ctx.cors);
    if (role[0].permissions.includes("admin") && !has(perms, "admin")) {
      return ctx.json({ error: "cannot_grant_admin" }, 403, ctx.cors);
    }
    const gm = await db(env, "GET", `guild_members?discord_id=eq.${assign[1]}&select=name,avatar`).then((r) => r?.[0]).catch(() => null);
    await db(env, "POST", "users", { discord_id: assign[1], name: gm?.name || "Mitglied", avatar: gm?.avatar || null }, {
      prefer: "return=minimal,resolution=ignore-duplicates",
    });
    await db(env, "POST", "user_site_roles", { discord_id: assign[1], role_id: roleId }, {
      prefer: "return=minimal,resolution=ignore-duplicates",
    });
    await audit(env, session.discord_name, assign[1], gm?.name, role[0].name, "add").catch(() => {});
    return ctx.json({ ok: true }, 200, ctx.cors);
  }
  const unassign = path.match(/^\/admin\/users\/(\d{5,25})\/roles\/([0-9a-f-]{36})$/);
  if (unassign && DISCORD_ID.test(unassign[1]) && UUID.test(unassign[2]) && method === "DELETE") {
    const role = await db(env, "GET", `site_roles?id=eq.${unassign[2]}&select=name,permissions`);
    if (role && role[0] && role[0].permissions.includes("admin") && !has(perms, "admin")) {
      return ctx.json({ error: "cannot_grant_admin" }, 403, ctx.cors);
    }
    const gm = await db(env, "GET", `guild_members?discord_id=eq.${unassign[1]}&select=name`).then((r) => r?.[0]).catch(() => null);
    await db(env, "DELETE", `user_site_roles?discord_id=eq.${unassign[1]}&role_id=eq.${unassign[2]}`);
    await audit(env, session.discord_name, unassign[1], gm?.name, role?.[0]?.name, "remove").catch(() => {});
    return ctx.json({ ok: true }, 200, ctx.cors);
  }

  return ctx.json({ error: "not_found" }, 404, ctx.cors);
}

// Anzahl der Mitglieder (gefiltert) über den Content-Range-Header
async function countMembers(env, filter) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/guild_members?select=discord_id&limit=1${filter}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Prefer: "count=exact",
    },
  });
  const range = res.headers.get("content-range") || "";
  const total = parseInt(range.split("/")[1], 10);
  return Number.isFinite(total) ? total : 0;
}

// Protokoll: wer hat wem welche Rolle gegeben oder entzogen
async function audit(env, actorName, targetId, targetName, roleName, action) {
  await db(env, "POST", "role_audit", {
    actor_name: actorName || null,
    target_discord_id: targetId,
    target_name: targetName || null,
    role_name: roleName || null,
    action,
  });
}

// Mitgliederliste von Discord holen (über den Bot) und in die Datenbank schreiben
export async function syncMembers(env) {
  if (!env.DISCORD_BOT_TOKEN) throw new Error("bot_token_missing");
  const started = new Date().toISOString();
  let after = "0";
  let total = 0;
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`https://discord.com/api/v10/guilds/${env.GUILD_ID}/members?limit=1000&after=${after}`, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    });
    if (!res.ok) throw new Error(`discord_members_${res.status}`);
    const members = await res.json();
    if (!Array.isArray(members) || !members.length) break;
    const rows = members
      .filter((m) => m.user && !m.user.bot)
      .map((m) => ({
        discord_id: m.user.id,
        name: String(m.nick || m.user.global_name || m.user.username || "Mitglied")
          .replace(/[^\p{L}\p{N} ._\-]/gu, "").trim().slice(0, 64) || "Mitglied",
        avatar: m.user.avatar || null,
        roles: Array.isArray(m.roles) ? m.roles : [],
        updated_at: new Date().toISOString(),
      }));
    for (let i = 0; i < rows.length; i += 400) {
      await db(env, "POST", "guild_members", rows.slice(i, i + 400), { upsert: true });
    }
    total += members.length;
    after = members[members.length - 1].user.id;
    if (members.length < 1000) break;
  }
  // Wer nicht mehr auf dem Server ist, wird entfernt
  if (total > 0) {
    await db(env, "DELETE", `guild_members?updated_at=lt.${encodeURIComponent(started)}`);
  }
  return total;
}

// Stärke eines Rangs: höchstes Recht bestimmt die Reihenfolge. Ohne Rechte = Tag (0).
const ROLE_WEIGHT = { admin: 100, "roles.manage": 80, "lists.manage": 60, "submissions.review": 50, "notifications.manage": 40 };
export function roleWeight(perms) {
  if (!perms || !perms.length) return 0;
  return Math.max(...perms.map((p) => ROLE_WEIGHT[p] ?? 10));
}

// Discord-Rollen auf Seiten-Rollen übertragen (nur Zuordnungen mit source = 'discord')
export async function applyDiscordRoles(env) {
  const map = (await db(env, "GET", "discord_role_map?select=discord_role_id,site_role_id")) || [];
  if (!map.length) return;
  const members = (await db(env, "GET", "guild_members?select=discord_id,name,avatar,roles")) || [];
  const bySite = new Map();
  for (const m of map) {
    if (!bySite.has(m.site_role_id)) bySite.set(m.site_role_id, new Set());
    bySite.get(m.site_role_id).add(m.discord_role_id);
  }
  for (const [siteRoleId, discordRoles] of bySite) {
    const desired = new Map();
    members.forEach((mm) => {
      if ((mm.roles || []).some((r) => discordRoles.has(r))) desired.set(mm.discord_id, mm);
    });
    const current = (await db(env, "GET", `user_site_roles?role_id=eq.${siteRoleId}&source=eq.discord&select=discord_id`)) || [];
    const currentIds = new Set(current.map((c) => c.discord_id));
    const toAdd = [...desired.keys()].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !desired.has(id));
    if (toAdd.length) {
      await db(env, "POST", "users", toAdd.map((id) => ({
        discord_id: id, name: desired.get(id).name || "Mitglied", avatar: desired.get(id).avatar || null,
      })), { prefer: "return=minimal,resolution=ignore-duplicates" });
      await db(env, "POST", "user_site_roles", toAdd.map((id) => ({ discord_id: id, role_id: siteRoleId, source: "discord" })), {
        prefer: "return=minimal,resolution=ignore-duplicates",
      });
    }
    if (toRemove.length) {
      await db(env, "DELETE", `user_site_roles?role_id=eq.${siteRoleId}&source=eq.discord&discord_id=in.(${toRemove.map((i) => encodeURIComponent(i)).join(",")})`);
    }
  }
}
