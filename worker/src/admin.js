// Rollen und Rechte der Seite (unabhängig von den Discord-Rollen)
import { db } from "./db.js";

export const PERMISSIONS = {
  admin: "Alles verwalten, inklusive Rollen",
  "roles.manage": "Rollen erstellen und Mitgliedern zuteilen",
  "lists.manage": "Listen und Level verwalten",
  "submissions.review": "Einreichungen annehmen oder ablehnen",
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
    const roles = await db(env, "GET", "site_roles?select=*&order=name.asc");
    return ctx.json({ roles: roles || [] }, 200, ctx.cors);
  }
  if (path === "/admin/roles" && method === "POST") {
    const v = validateRole(body, perms);
    if (v.error) return ctx.json(v, 400, ctx.cors);
    const rows = await db(env, "POST", "site_roles", v.role, { prefer: "return=representation" });
    return ctx.json({ role: rows && rows[0] }, 200, ctx.cors);
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
    const role = await db(env, "GET", `site_roles?id=eq.${roleId}&select=permissions`);
    if (!role || !role[0]) return ctx.json({ error: "role_not_found" }, 404, ctx.cors);
    if (role[0].permissions.includes("admin") && !has(perms, "admin")) {
      return ctx.json({ error: "cannot_grant_admin" }, 403, ctx.cors);
    }
    await db(env, "POST", "user_site_roles", { discord_id: assign[1], role_id: roleId }, {
      prefer: "return=minimal,resolution=ignore-duplicates",
    });
    return ctx.json({ ok: true }, 200, ctx.cors);
  }
  const unassign = path.match(/^\/admin\/users\/(\d{5,25})\/roles\/([0-9a-f-]{36})$/);
  if (unassign && DISCORD_ID.test(unassign[1]) && UUID.test(unassign[2]) && method === "DELETE") {
    const role = await db(env, "GET", `site_roles?id=eq.${unassign[2]}&select=permissions`);
    if (role && role[0] && role[0].permissions.includes("admin") && !has(perms, "admin")) {
      return ctx.json({ error: "cannot_grant_admin" }, 403, ctx.cors);
    }
    await db(env, "DELETE", `user_site_roles?discord_id=eq.${unassign[1]}&role_id=eq.${unassign[2]}`);
    return ctx.json({ ok: true }, 200, ctx.cors);
  }

  return ctx.json({ error: "not_found" }, 404, ctx.cors);
}
