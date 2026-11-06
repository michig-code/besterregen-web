// Listen, Level-Einreichungen, Records und Moderation
import { db } from "./db.js";
import { getUserPermissions } from "./admin.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMG_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMG = 2 * 1024 * 1024;
const COLOR = 9127158; // Besterregen-Lila für Discord-Embeds

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

  const levelMatch = path.match(/^\/levels\/([0-9a-f-]{36})$/);
  if (levelMatch && UUID.test(levelMatch[1]) && method === "GET") {
    const levels = await db(env, "GET",
      `levels?id=eq.${levelMatch[1]}&select=id,list_id,position,name,creator,verifier,gd_level_id,video_url,image_url,duration_seconds`);
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

  // Statistik: Spieler nach Punkten, Completions und erstellten Levels
  if (path === "/stats" && method === "GET") {
    const [levels, lists, records] = await Promise.all([
      db(env, "GET", "levels?select=id,list_id,position,creator"),
      db(env, "GET", "lists?select=id,max_places"),
      db(env, "GET", "records?status=eq.approved&select=player_name,level_id"),
    ]);
    const listById = Object.fromEntries((lists || []).map((l) => [l.id, l]));
    const levelById = Object.fromEntries((levels || []).map((l) => [l.id, l]));
    const players = new Map();
    const get = (name) => {
      const k = name.trim().toLowerCase();
      if (!players.has(k)) players.set(k, { name: name.trim(), points: 0, completions: 0, created: 0 });
      return players.get(k);
    };
    for (const r of records || []) {
      const lv = levelById[r.level_id];
      if (!lv || !r.player_name) continue;
      const pl = get(r.player_name);
      pl.completions += 1;
      pl.points += pointsFor(lv.position, listById[lv.list_id]?.max_places);
    }
    for (const lv of levels || []) {
      if (lv.creator) get(lv.creator).created += 1;
    }
    const out = [...players.values()]
      .map((p) => ({ ...p, points: Math.round(p.points * 100) / 100 }))
      .sort((a, b) => b.points - a.points || b.completions - a.completions)
      .slice(0, 300);
    return json({ players: out });
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

  // Level einreichen
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

    await notify(env, "level_submitted", {
      title: "Neues Level eingereicht",
      description: `**${name}** von ${creator} für ${lists[0].name} (${duration} s)`,
      url: `${siteUrl}/mod.html`,
    });
    return json({ ok: true, id: rows && rows[0] && rows[0].id });
  }

  // Record einreichen
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
    await notify(env, "record_submitted", {
      title: "Neuer Record eingereicht",
      description: `**${playerName}** hat **${levels[0].name}** eingereicht`,
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
    await db(env, "PATCH", `level_submissions?id=eq.${rejectLevelM[1]}&status=eq.pending`, {
      status: "rejected", reason: clean(b?.reason, 300) || null,
      reviewed_by: session.discord_id, reviewed_at: new Date().toISOString(),
    });
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
    const rec = (await db(env, "GET", `records?id=eq.${recApproveM[1]}&select=id,player_name,level_id,levels(name)`))?.[0];
    if (!rec) return json({ error: "not_found" }, 404);
    await db(env, "PATCH", `records?id=eq.${rec.id}`, {
      status: "approved", approved_at: new Date().toISOString(), reviewed_by: session.discord_id,
    });
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
    await db(env, "PATCH", `records?id=eq.${recRejectM[1]}&status=eq.pending`, {
      status: "rejected", reason: clean(b?.reason, 300) || null, reviewed_by: session.discord_id,
    });
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
    if (typeof b?.name === "string") patch.name = clean(b.name, 60);
    if ("maxDurationSeconds" in (b || {})) {
      const max = b.maxDurationSeconds === null || b.maxDurationSeconds === "" ? null : Number(b.maxDurationSeconds);
      if (max !== null && (!Number.isInteger(max) || max < 1)) return json({ error: "invalid_duration" }, 400);
      patch.max_duration_seconds = max;
    }
    if (!Object.keys(patch).length) return json({ error: "missing_fields" }, 400);
    await db(env, "PATCH", `lists?id=eq.${listEditM[1]}`, patch);
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
