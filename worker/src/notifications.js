// Benachrichtigungen für Nutzer und Abonnements von Listen
import { db } from "./db.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Alle Nutzer mit einem Recht (plus Admins)
export async function usersWithPermission(env, perm) {
  const ids = new Set((env.ADMIN_DISCORD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean));
  const or = encodeURIComponent(`(permissions.cs.{${perm}},permissions.cs.{admin})`);
  const roles = (await db(env, "GET", `site_roles?or=${or}&select=id`)) || [];
  if (roles.length) {
    const links = (await db(env, "GET",
      `user_site_roles?role_id=in.(${roles.map((r) => r.id).join(",")})&select=discord_id`)) || [];
    links.forEach((l) => ids.add(l.discord_id));
  }
  return [...ids];
}

// Alle Abonnenten einer Liste
export async function subscribers(env, listId) {
  const rows = (await db(env, "GET", `list_subscriptions?list_id=eq.${listId}&select=discord_id`)) || [];
  return rows.map((r) => r.discord_id);
}

// Benachrichtigung an mehrere Nutzer schreiben (doppelte werden übersprungen)
export async function notifyUsers(env, ids, n) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 400) {
    const rows = unique.slice(i, i + 400).map((id) => ({
      discord_id: id,
      type: n.type,
      title: String(n.title).slice(0, 120),
      body: n.body ? String(n.body).slice(0, 240) : null,
      link: n.link || null,
    }));
    await db(env, "POST", "notifications", rows, { prefer: "return=minimal" });
  }
}

export async function handleNotifications(request, url, env, ctx) {
  const path = url.pathname;
  const method = request.method;
  const json = (d, s = 200) => ctx.json(d, s, ctx.cors);
  const session = await ctx.getSession(request, env);
  if (!session) return json({ error: "not_logged_in" }, 401);
  const me = session.discord_id;

  if (path === "/notifications" && method === "GET") {
    const items = (await db(env, "GET",
      `notifications?discord_id=eq.${me}&select=id,type,title,body,link,read,created_at&order=created_at.desc&limit=30`)) || [];
    return json({ items, unread: items.filter((i) => !i.read).length });
  }
  if (path === "/notifications/read-all" && method === "POST") {
    await db(env, "PATCH", `notifications?discord_id=eq.${me}&read=eq.false`, { read: true });
    return json({ ok: true });
  }
  if (path === "/subscriptions" && method === "GET") {
    const rows = (await db(env, "GET", `list_subscriptions?discord_id=eq.${me}&select=list_id`)) || [];
    return json({ listIds: rows.map((r) => r.list_id) });
  }
  if (path === "/subscriptions" && method === "POST") {
    const b = await request.json().catch(() => null);
    if (!UUID.test(b?.listId || "")) return json({ error: "invalid_list" }, 400);
    await db(env, "POST", "list_subscriptions", { discord_id: me, list_id: b.listId }, {
      prefer: "return=minimal,resolution=ignore-duplicates",
    });
    return json({ ok: true });
  }
  const del = path.match(/^\/subscriptions\/([0-9a-f-]{36})$/);
  if (del && UUID.test(del[1]) && method === "DELETE") {
    await db(env, "DELETE", `list_subscriptions?discord_id=eq.${me}&list_id=eq.${del[1]}`);
    return json({ ok: true });
  }
  return null;
}
