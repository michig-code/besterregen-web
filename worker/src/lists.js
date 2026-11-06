// Listen, Level-Einsendungen, Records und Moderation
import { db } from "./db.js";
import { getUserPermissions } from "./admin.js";
import { notifyUsers, usersWithPermission, subscribers } from "./notifications.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMG_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMG = 2 * 1024 * 1024;
const COLOR = 9127158; // Bester Regen-Lila für Discord-Embeds

// Punkte nach Platz: Platz 1 = 500, letzter Platz = 10, dazwischen gleichmäßig. Außerhalb der Liste = 0.
export function pointsFor(position, maxPlaces) {
  const max = maxPlaces || 50;
  if (!position || position < 1 || position > max) return 0;
  return Math.round(500 * (1 - (position - 1) / max) * 100) / 100;
}


const has = (perms, need) => perms.includes("admin") || perms.includes(need);
const clean = (s, max) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const isHttps = (s) => { try { return new URL(s).protocol === "https:"; } catch { return false; } };
const WEBHOOK = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;
const EVENTS = ["level_submitted", "record_submitted", "level_accepted", "record_approved"];

// Discord-Benachrichtigung, nur wenn der Admin einen Webhook für dieses Ereignis hinterlegt hat
export async function notify(env, event, embed) {
  try {
    const rows = await db(env, "GET", `settings?key=eq.webhook.${event}&select=value`);
    const url = rows && rows[0] && rows[0].value;
    if (!url) return false;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [{ color: COLOR, ...embed }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function reorderLevels(env, ids) {
  await Promise.all(ids.map((id, i) =>
    db(env, "PATCH", `levels?id=eq.${id}`, { position: i + 1 })));
}

export async function handleContent(request, url, env, ctx) {
  const path = url.pathname;
  const method = request.method;
  const json = (data, status = 200) => ctx.json(data, status, ctx.cors);
  const siteUrl = env.SITE_URL;

  // ---------- Öffentlich ----------
  if (path === "/lists" && method === "GET") {
    const lists = await db(env, "GET", "lists?select=id,name,slug,max_duration_seconds,max_places,position&order=position.asc");
    return json({ lists: lists || [] });
  }

  const listMatch = path.match(/^\/lists\/([a-z0-9-]{1,40})\/levels$/);
  if (listMatch && method === "GET") {
    const lists = await db(env, "GET", `lists?slug=eq.${listMatch[1]}&select=id,name,slug,max_duration_seconds,max_places`);
    if (!lists || !lists[0]) return json({ error: "not_found" }, 404);
    const list = lists[0];
    const levels = (await db(env, "GET",
      `levels?list_id=eq.${list.id}&select=id,position,name,creator,verifier,gd_level_id,video_url,image_url,duration_seconds&order=position.asc`)) || [];
    const approved = (await db(env, "GET", `records?status=eq.approved&select=level_id`)) || [];
    const counts = {};
    approved.forEach((r) => { counts[r.level_id] = (counts[r.level_id] || 0) + 1; });
    return json({
      list,
      levels: levels.map((l) => ({
        ...l,
        points: pointsFor(l.position, list.max_places),
        completions: counts[l.id] || 0,
      })),
    });
  }

  // Team einer Liste (Editoren und Helfer), öffentlich
  const staffMatch = path.match(/^\/lists\/([a-z0-9-]{1,40})\/staff$/);
  if (staffMatch && method === "GET") {
    const lists = await db(env, "GET", `lists?slug=eq.${staffMatch[1]}&select=id`);
    if (!lists || !lists[0]) return json({ error: "not_found" }, 404);
    const rows = (await db(env, "GET", `list_staff?list_id=eq.${lists[0].id}&select=discord_id,role`)) || [];
    const ids = [...new Set(rows.map((r) => r.discord_id))];
    let users = [], members = [];
    if (ids.length) {
      const inList = ids.map((i) => encodeURIComponent(i)).join(",");
      users = (await db(env, "GET", `users?discord_id=in.(${inList})&select=discord_id,name,avatar,country`)) || [];
      members = (await db(env, "GET", `guild_members?discord_id=in.(${inList})&select=discord_id,name,avatar`)) || [];
    }
    const person = (id) => {
      const u = users.find((x) => x.discord_id === id) || {};
      const g = members.find((x) => x.discord_id === id) || {};
      return { discordId: id, name: u.name || g.name || "Mitglied", avatar: u.avatar || g.avatar || null, country: u.country || null };
    };
    return json({
      editors: rows.filter((r) => r.role === "editor").map((r) => person(r.discord_id)),
      helpers: rows.filter((r) => r.role === "helper").map((r) => person(r.discord_id)),
    });
  }

  const levelMatch = path.match(/^\/levels\/([0-9a-f-]{36})$/);
  if (levelMatch && UUID.test(levelMatch[1]) && method === "GET") {
    const levels = await db(env, "GET",
      `levels?id=eq.${levelMatch[1]}&select=id,list_id,position,name,creator,verifier,gd_level_id,video_url,image_url,duration_seconds,difficulty,requirement,song,objects,nong,creators`);
    if (!levels || !levels[0]) return json({ error: "not_found" }, 404);
    const level = levels[0];
    const list = (await db(env, "GET", `lists?id=eq.${level.list_id}&select=name,max_places`))?.[0] || {};
    const records = (await db(env, "GET",
      `records?level_id=eq.${level.id}&status=eq.approved&select=id,player_name,video_url,approved_at&order=approved_at.asc`)) || [];
    return json({
      level: {
        ...level,
        listName: list.name,
        maxPlaces: list.max_places,
        points: pointsFor(level.position, list.max_places),
        completions: records.length,
      },
      records,
    });
  }

  // Rangliste: nur verifizierte GD-Accounts, die mindestens ein Listen-Level geschafft haben.
  // Punkte = Summe der Punkte je Level (jedes Level zählt einmal). Gleiche Punkte = gleicher Platz.
  if (path === "/stats" && method === "GET") {
    const [links, users, levels, lists, records] = await Promise.all([
      db(env, "GET", "gd_links?select=discord_id,gd_name"),
      db(env, "GET", "users?select=discord_id,avatar"),
      db(env, "GET", "levels?select=id,list_id,position,creator"),
      db(env, "GET", "lists?select=id,max_places"),
      db(env, "GET", "records?status=eq.approved&select=level_id,submitted_by"),
    ]);
    const gdByDiscord = new Map((links || []).map((l) => [l.discord_id, l.gd_name]));
    const avatarByDiscord = new Map((users || []).map((u) => [u.discord_id, u.avatar]));
    const listById = Object.fromEntries((lists || []).map((l) => [l.id, l]));
    const levelById = Object.fromEntries((levels || []).map((l) => [l.id, l]));

    // pro Discord-Konto: welche Level geschafft wurden (jedes Level nur einmal)
    const done = new Map();
    for (const r of records || []) {
      const gd = gdByDiscord.get(r.submitted_by);
      const lv = levelById[r.level_id];
      if (!gd || !lv) continue;
      if (!done.has(r.submitted_by)) done.set(r.submitted_by, new Set());
      done.get(r.submitted_by).add(r.level_id);
    }

    const rows = [];
    for (const [discordId, levelIds] of done) {
      const gd = gdByDiscord.get(discordId);
      let points = 0;
      for (const lid of levelIds) {
        const lv = levelById[lid];
        points += pointsFor(lv.position, listById[lv.list_id]?.max_places);
      }
      const created = (levels || []).filter((lv) => lv.creator && lv.creator.trim().toLowerCase() === gd.trim().toLowerCase()).length;
      rows.push({
        discordId,
        name: gd,
        avatar: avatarByDiscord.get(discordId)
          ? `https://cdn.discordapp.com/avatars/${discordId}/${avatarByDiscord.get(discordId)}.png?size=64`
          : null,
        points: Math.round(points * 100) / 100,
        completions: levelIds.size,
        created,
      });
    }

    rows.sort((x, y) => y.points - x.points || y.completions - x.completions || x.name.localeCompare(y.name, "de"));
    // Gleichstand: gleiche Punkte -> gleicher Platz (1, 2, 2, 4 ...)
    let rank = 0;
    let prev = null;
    const players = rows.map((p, i) => {
      if (prev === null || p.points !== prev) rank = i + 1;
      prev = p.points;
      return { ...p, rank };
    });
    players.forEach((p) => {
      p.tied = players.filter((q) => q.rank === p.rank).length > 1;
    });
    return json({ players: players.slice(0, 300) });
  }

  // ---------- Eingeloggt ----------
  const needsLogin = path === "/upload" || path.startsWith("/submit/") || path.startsWith("/mod/");
  if (!needsLogin) return null;
  const session = await ctx.getSession(request, env);
  if (!session) return json({ error: "not_logged_in" }, 401);

  // Bild hochladen (Rohdaten, Content-Type = Bildtyp)
  if (path === "/upload" && method === "POST") {
    const type = (request.headers.get("Content-Type") || "").split(";")[0];
    const ext = IMG_TYPES[type];
    if (!ext) return json({ error: "invalid_image_type" }, 400);
    const buf = await request.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMG) return json({ error: "invalid_image_size" }, 400);
    const key = `${session.discord_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/uploads/${key}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": type,
      },
      body: buf,
    });
    if (!res.ok) return json({ error: "upload_failed" }, 500);
    return json({ url: `${env.SUPABASE_URL}/storage/v1/object/public/uploads/${key}` });
  }

  // Level einsenden
  if (path === "/submit/level" && method === "POST") {
    const b = await request.json().catch(() => null);
    const name = clean(b?.name, 80);
    const creator = clean(b?.creator, 60);
    const verifier = clean(b?.verifier, 60);
    const gdLevelId = String(b?.gdLevelId || "").trim();
    const videoUrl = clean(b?.videoUrl, 300);
    const imageUrl = clean(b?.imageUrl, 400);
    const duration = Number(b?.durationSeconds);
    const listId = b?.listId;
    if (!name || !creator || !verifier) return json({ error: "missing_fields" }, 400);
    if (!/^\d{1,12}$/.test(gdLevelId)) return json({ error: "invalid_level_id" }, 400);
    if (!isHttps(videoUrl)) return json({ error: "invalid_video" }, 400);
    if (imageUrl && !imageUrl.startsWith(`${env.SUPABASE_URL}/storage/v1/object/public/uploads/`)) return json({ error: "invalid_image" }, 400);
    if (!UUID.test(listId || "")) return json({ error: "invalid_list" }, 400);
    const lists = await db(env, "GET", `lists?id=eq.${listId}&select=id,name,max_duration_seconds`);
    if (!lists || !lists[0]) return json({ error: "invalid_list" }, 400);
    if (!Number.isInteger(duration) || duration < 1) return json({ error: "invalid_duration" }, 400);
    const max = lists[0].max_duration_seconds;
    if (max && duration > max) return json({ error: "too_long", max }, 400);

    const rows = await db(env, "POST", "level_submissions", {
      list_id: listId, name, creator, verifier, gd_level_id: gdLevelId, video_url: videoUrl,
      image_url: imageUrl || null, duration_seconds: duration, submitted_by: session.discord_id,
      submitter_name: session.discord_name, status: "pending",
    }, { prefer: "return=representation" });

    await notifyUsers(env, await usersWithPermission(env, "submissions.review"), {
      type: "level_submitted",
      title: `Neues Level eingesendet: ${name}`,
      body: `${creator} · ${lists[0].name} · ${duration} s`,
      link: "mod.html",
    }).catch(() => {});
    await notify(env, "level_submitted", {
      title: "Neues Level eingesendet",
      description: `**${name}** von ${creator} für ${lists[0].name} (${duration} s)`,
      url: `${siteUrl}/mod.html`,
    });
    return json({ ok: true, id: rows && rows[0] && rows[0].id });
  }

  // Record einsenden
  if (path === "/submit/record" && method === "POST") {
    const b = await request.json().catch(() => null);
    const levelId = b?.levelId;
    const playerName = clean(b?.playerName, 40);
    const videoUrl = clean(b?.videoUrl, 300);
    const notes = clean(b?.notes, 300);
    if (!UUID.test(levelId || "")) return json({ error: "invalid_level" }, 400);
    if (!playerName) return json({ error: "missing_fields" }, 400);
    if (!isHttps(videoUrl)) return json({ error: "invalid_video" }, 400);
    const levels = await db(env, "GET", `levels?id=eq.${levelId}&select=id,name`);
    if (!levels || !levels[0]) return json({ error: "invalid_level" }, 400);

    await db(env, "POST", "records", {
      level_id: levelId, player_name: playerName, video_url: videoUrl, notes: notes || null,
      submitted_by: session.discord_id, status: "pending",
    });
    await notifyUsers(env, await usersWithPermission(env, "submissions.review"), {
      type: "record_submitted",
      title: `Neuer Record eingesendet: ${playerName}`,
      body: `auf ${levels[0].name}`,
      link: "mod.html",
    }).catch(() => {});
    await notify(env, "record_submitted", {
      title: "Neuer Record eingesendet",
      description: `**${playerName}** hat **${levels[0].name}** eingesendet`,
      url: `${siteUrl}/mod.html`,
    });
    return json({ ok: true });
  }

  // ---------- Moderation ----------
  if (!path.startsWith("/mod/")) return null;
  const perms = await getUserPermissions(env, session.discord_id);
  const need = (p) => (has(perms, p) ? null : json({ error: "forbidden" }, 403));

  if (path === "/mod/queue" && method === "GET") {
    const denied = need("submissions.review"); if (denied) return denied;
    const levels = await db(env, "GET", "level_submissions?status=eq.pending&select=*&order=created_at.asc");
    const records = await db(env, "GET", "records?status=eq.pending&select=*,levels(name,list_id)&order=created_at.asc");
    return json({ levels: levels || [], records: records || [] });
  }

  const acceptM = path.match(/^\/mod\/levels\/([0-9a-f-]{36})\/accept$/);
  if (acceptM && UUID.test(acceptM[1]) && method === "POST") {
    const denied = need("submissions.review"); if (denied) return denied;
    const b = await request.json().catch(() => ({}));
    const sub = (await db(env, "GET", `level_submissions?id=eq.${acceptM[1]}&select=*`))?.[0];
    if (!sub) return json({ error: "not_found" }, 404);
    if (sub.status !== "pending") return json({ error: "already_reviewed" }, 409);

    const existing = (await db(env, "GET", `levels?list_id=eq.${sub.list_id}&select=id&order=position.asc`)) || [];
    const pos = Math.min(Math.max(parseInt(b?.position, 10) || existing.length + 1, 1), existing.length + 1);
    const created = await db(env, "POST", "levels", {
      list_id: sub.list_id, position: 0, name: sub.name, creator: sub.creator, verifier: sub.verifier,
      gd_level_id: sub.gd_level_id, video_url: sub.video_url, image_url: sub.image_url,
      duration_seconds: sub.duration_seconds, submission_id: sub.id,
    }, { prefer: "return=representation" });
    const newId = created[0].id;
    const ordered = existing.map((l) => l.id);
    ordered.splice(pos - 1, 0, newId);
    await reorderLevels(env, ordered);
    await db(env, "PATCH", `level_submissions?id=eq.${sub.id}`, {
      status: "accepted", reviewed_by: session.discord_id, reviewed_at: new Date().toISOString(),
    });
    await notifyUsers(env, [...(await subscribers(env, sub.list_id)), sub.submitted_by], {
      type: "level_accepted",
      title: `Neues Level: ${sub.name}`,
      body: `Platz ${pos} · von ${sub.creator}`,
      link: `level.html?id=${newId}`,
    }).catch(() => {});
    await notify(env, "level_accepted", {
      title: "Level angenommen",
      description: `**${sub.name}** von ${sub.creator} ist auf Platz ${pos}`,
      url: `${siteUrl}/level.html?id=${newId}`,
    });
    return json({ ok: true, levelId: newId });
  }

  const rejectLevelM = path.match(/^\/mod\/levels\/([0-9a-f-]{36})\/reject$/);
  if (rejectLevelM && UUID.test(rejectLevelM[1]) && method === "POST") {
    const denied = need("submissions.review"); if (denied) return denied;
    const b = await request.json().catch(() => ({}));
    const rejSub = (await db(env, "GET", `level_submissions?id=eq.${rejectLevelM[1]}&select=name,submitted_by`))?.[0];
    await db(env, "PATCH", `level_submissions?id=eq.${rejectLevelM[1]}&status=eq.pending`, {
      status: "rejected", reason: clean(b?.reason, 300) || null,
      reviewed_by: session.discord_id, reviewed_at: new Date().toISOString(),
    });
    if (rejSub) {
      await notifyUsers(env, [rejSub.submitted_by], {
        type: "level_rejected",
        title: `Dein Level wurde abgelehnt: ${rejSub.name}`,
        body: clean(b?.reason, 240) || "Kein Grund angegeben.",
        link: "einreichen.html",
      }).catch(() => {});
    }
    return json({ ok: true });
  }

  const deleteLevelM = path.match(/^\/mod\/levels\/([0-9a-f-]{36})$/);
  if (deleteLevelM && UUID.test(deleteLevelM[1]) && method === "DELETE") {
    const denied = need("lists.manage"); if (denied) return denied;
    await db(env, "DELETE", `levels?id=eq.${deleteLevelM[1]}`);
    return json({ ok: true });
  }

  if (path === "/mod/levels/order" && method === "PUT") {
    const denied = need("lists.manage"); if (denied) return denied;
    const b = await request.json().catch(() => null);
    const ids = Array.isArray(b?.levelIds) ? b.levelIds : [];
    if (!UUID.test(b?.listId || "") || !ids.length || ids.some((i) => !UUID.test(i))) {
      return json({ error: "invalid_order" }, 400);
    }
    const current = (await db(env, "GET", `levels?list_id=eq.${b.listId}&select=id`)) || [];
    const same = current.length === ids.length && current.every((l) => ids.includes(l.id));
    if (!same) return json({ error: "invalid_order" }, 400);
    await reorderLevels(env, ids);
    return json({ ok: true });
  }

  const recApproveM = path.match(/^\/mod\/records\/([0-9a-f-]{36})\/approve$/);
  if (recApproveM && UUID.test(recApproveM[1]) && method === "POST") {
    const denied = need("submissions.review"); if (denied) return denied;
    const rec = (await db(env, "GET", `records?id=eq.${recApproveM[1]}&select=id,player_name,level_id,submitted_by,levels(name,list_id)`))?.[0];
    if (!rec) return json({ error: "not_found" }, 404);
    await db(env, "PATCH", `records?id=eq.${rec.id}`, {
      status: "approved", approved_at: new Date().toISOString(), reviewed_by: session.discord_id,
    });
    await notifyUsers(env, [...(await subscribers(env, rec.levels?.list_id)), rec.submitted_by], {
      type: "record_approved",
      title: `Neuer Record auf ${rec.levels?.name || "Level"}`,
      body: `${rec.player_name} hat es geschafft`,
      link: `level.html?id=${rec.level_id}`,
    }).catch(() => {});
    await notify(env, "record_approved", {
      title: "Neuer Record bestätigt",
      description: `**${rec.player_name}** auf **${rec.levels?.name || "Level"}**`,
      url: `${siteUrl}/level.html?id=${rec.level_id}`,
    });
    return json({ ok: true });
  }

  const recRejectM = path.match(/^\/mod\/records\/([0-9a-f-]{36})\/reject$/);
  if (recRejectM && UUID.test(recRejectM[1]) && method === "POST") {
    const denied = need("submissions.review"); if (denied) return denied;
    const b = await request.json().catch(() => ({}));
    const recRej = (await db(env, "GET", `records?id=eq.${recRejectM[1]}&select=player_name,submitted_by,levels(name)`))?.[0];
    await db(env, "PATCH", `records?id=eq.${recRejectM[1]}&status=eq.pending`, {
      status: "rejected", reason: clean(b?.reason, 300) || null, reviewed_by: session.discord_id,
    });
    if (recRej) {
      await notifyUsers(env, [recRej.submitted_by], {
        type: "record_rejected",
        title: `Dein Record wurde abgelehnt: ${recRej.levels?.name || ""}`,
        body: clean(b?.reason, 240) || "Kein Grund angegeben.",
        link: "einreichen.html",
      }).catch(() => {});
    }
    return json({ ok: true });
  }

  // Mitglieder suchen (für das Listen-Team)
  if (path === "/mod/members" && method === "GET") {
    const denied = need("lists.manage"); if (denied) return denied;
    const q = (url.searchParams.get("q") || "").trim();
    if (q && !/^[\p{L}\p{N} ._-]{1,32}$/u.test(q)) return json({ error: "invalid_query" }, 400);
    const filter = q ? `&name=ilike.*${encodeURIComponent(q)}*` : "";
    const rows = (await db(env, "GET", `guild_members?select=discord_id,name,avatar&order=name.asc&limit=20${filter}`)) || [];
    return json({ members: rows });
  }

  // Team einer Liste setzen (ersetzt Editoren und Helfer komplett)
  const staffSetM = path.match(/^\/mod\/lists\/([0-9a-f-]{36})\/staff$/);
  if (staffSetM && UUID.test(staffSetM[1]) && method === "PUT") {
    const denied = need("lists.manage"); if (denied) return denied;
    const b = await request.json().catch(() => ({}));
    const ok = (arr) => Array.isArray(arr) && arr.every((x) => /^\d{5,25}$/.test(String(x)));
    if (!ok(b?.editors || []) || !ok(b?.helpers || [])) return json({ error: "invalid_staff" }, 400);
    const rows = [
      ...[...new Set((b.editors || []).map(String))].map((id) => ({ list_id: staffSetM[1], discord_id: id, role: "editor" })),
      ...[...new Set((b.helpers || []).map(String))].map((id) => ({ list_id: staffSetM[1], discord_id: id, role: "helper" })),
    ];
    await db(env, "DELETE", `list_staff?list_id=eq.${staffSetM[1]}`);
    if (rows.length) await db(env, "POST", "list_staff", rows, { prefer: "return=minimal" });
    return json({ ok: true });
  }

  if (path === "/mod/lists" && method === "POST") {
    const denied = need("lists.manage"); if (denied) return denied;
    const b = await request.json().catch(() => null);
    const name = clean(b?.name, 60);
    const slug = clean(b?.slug, 40).toLowerCase();
    const max = b?.maxDurationSeconds === null || b?.maxDurationSeconds === "" ? null : Number(b?.maxDurationSeconds);
    if (!name) return json({ error: "missing_fields" }, 400);
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) return json({ error: "invalid_slug" }, 400);
    if (max !== null && (!Number.isInteger(max) || max < 1)) return json({ error: "invalid_duration" }, 400);
    const count = ((await db(env, "GET", "lists?select=id")) || []).length;
    await db(env, "POST", "lists", { name, slug, max_duration_seconds: max, position: count + 1 });
    return json({ ok: true });
  }

  const listEditM = path.match(/^\/mod\/lists\/([0-9a-f-]{36})$/);
  if (listEditM && UUID.test(listEditM[1]) && method === "PATCH") {
    const denied = need("lists.manage"); if (denied) return denied;
    const b = await request.json().catch(() => null);
    const patch = {};
    if (typeof b?.name === "string") {
      const name = clean(b.name, 60);
      if (!name) return json({ error: "missing_fields" }, 400);
      patch.name = name;
    }
    if (typeof b?.slug === "string") {
      const slug = clean(b.slug, 40).toLowerCase();
      if (!/^[a-z0-9-]{1,40}$/.test(slug)) return json({ error: "invalid_slug" }, 400);
      patch.slug = slug;
    }
    if ("maxPlaces" in (b || {})) {
      const mp = Number(b.maxPlaces);
      if (!Number.isInteger(mp) || mp < 1 || mp > 500) return json({ error: "invalid_places" }, 400);
      patch.max_places = mp;
    }
    if ("maxDurationSeconds" in (b || {})) {
      const max = b.maxDurationSeconds === null || b.maxDurationSeconds === "" ? null : Number(b.maxDurationSeconds);
      if (max !== null && (!Number.isInteger(max) || max < 1)) return json({ error: "invalid_duration" }, 400);
      patch.max_duration_seconds = max;
    }
    if (!Object.keys(patch).length) return json({ error: "missing_fields" }, 400);
    await db(env, "PATCH", `lists?id=eq.${listEditM[1]}`, patch);
    return json({ ok: true });
  }

  // Level-Angaben bearbeiten (Liste und Platz bleiben unverändert)
  const levelEditM = path.match(/^\/mod\/levels\/([0-9a-f-]{36})$/);
  if (levelEditM && UUID.test(levelEditM[1]) && method === "PATCH") {
    const denied = need("lists.manage"); if (denied) return denied;
    const b = await request.json().catch(() => null);
    const level = (await db(env, "GET", `levels?id=eq.${levelEditM[1]}&select=id,list_id`))?.[0];
    if (!level) return json({ error: "not_found" }, 404);
    const patch = {};
    const text = (key, max) => { if (typeof b?.[key] === "string") patch[key] = clean(b[key], max); };
    text("name", 80); text("creator", 60); text("verifier", 60);
    text("difficulty", 40); text("song", 80); text("nong", 80); text("creators", 200);
    if ("requirement" in (b || {})) {
      const rq = Number(b.requirement);
      if (!Number.isInteger(rq) || rq < 1 || rq > 100) return json({ error: "invalid_requirement" }, 400);
      patch.requirement = rq;
    }
    if ("objects" in (b || {})) {
      const ob = b.objects === null || b.objects === "" ? null : Number(b.objects);
      if (ob !== null && (!Number.isInteger(ob) || ob < 0)) return json({ error: "invalid_objects" }, 400);
      patch.objects = ob;
    }
    if (typeof b?.gdLevelId === "string") {
      const id = b.gdLevelId.trim();
      if (!/^\d{1,12}$/.test(id)) return json({ error: "invalid_level_id" }, 400);
      patch.gd_level_id = id;
    }
    if (typeof b?.videoUrl === "string") {
      if (!isHttps(clean(b.videoUrl, 300))) return json({ error: "invalid_video" }, 400);
      patch.video_url = clean(b.videoUrl, 300);
    }
    if ("durationSeconds" in (b || {})) {
      const d = Number(b.durationSeconds);
      if (!Number.isInteger(d) || d < 1) return json({ error: "invalid_duration" }, 400);
      const max = (await db(env, "GET", `lists?id=eq.${level.list_id}&select=max_duration_seconds`))?.[0]?.max_duration_seconds;
      if (max && d > max) return json({ error: "too_long", max }, 400);
      patch.duration_seconds = d;
    }
    if (!Object.keys(patch).length) return json({ error: "missing_fields" }, 400);
    if (patch.name === "" || patch.creator === "" || patch.verifier === "") return json({ error: "missing_fields" }, 400);
    await db(env, "PATCH", `levels?id=eq.${levelEditM[1]}`, patch);
    return json({ ok: true });
  }

  // Benachrichtigungen (Webhooks)
  if (path === "/mod/settings" && method === "GET") {
    const denied = need("notifications.manage"); if (denied) return denied;
    const rows = (await db(env, "GET", "settings?key=like.webhook.*&select=key,value")) || [];
    const out = {};
    for (const e of EVENTS) {
      const row = rows.find((r) => r.key === `webhook.${e}`);
      out[e] = row ? `…${row.value.slice(-6)}` : "";
    }
    return json({ webhooks: out });
  }

  if (path === "/mod/settings" && method === "PUT") {
    const denied = need("notifications.manage"); if (denied) return denied;
    const b = await request.json().catch(() => null);
    for (const e of EVENTS) {
      if (!(e in (b || {}))) continue;
      const val = clean(b[e], 300);
      if (val && !WEBHOOK.test(val)) return json({ error: "invalid_webhook" }, 400);
      if (val) {
        await db(env, "POST", "settings", { key: `webhook.${e}`, value: val }, { upsert: true });
      } else {
        await db(env, "DELETE", `settings?key=eq.webhook.${e}`);
      }
    }
    return json({ ok: true });
  }

  if (path === "/mod/settings/test" && method === "POST") {
    const denied = need("notifications.manage"); if (denied) return denied;
    const b = await request.json().catch(() => ({}));
    if (!EVENTS.includes(b?.event)) return json({ error: "invalid_event" }, 400);
    const sent = await notify(env, b.event, {
      title: "Test-Benachrichtigung",
      description: "Wenn du das siehst, ist der Webhook richtig eingerichtet.",
      url: siteUrl,
    });
    return json({ sent });
  }

  return json({ error: "not_found" }, 404);
}
