// Listen, Level-Einsendungen, Records und Moderation
import { db } from "./db.js";
import { getUserPermissions } from "./admin.js";
import { notifyUsers, usersWithPermission, subscribers } from "./notifications.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMG_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMG = 2 * 1024 * 1024;
const COLOR = 9127158; // Bester Regen-Lila für Discord-Embeds

// Punkte nach Platz: Platz 1 = 500, letzter Platz = 10, dazwischen gleichmäßig. Außerhalb der Liste = 0.
// Punkte-Formel wie bei der Demonlist (score.js): Platz, Prozent und benötigter Fortschritt
export function demonScore(rank, percent, minPercent) {
  if (rank > 150) return 0;
  if (rank > 75 && percent < 100) return 0;
  const min = minPercent || 50;
  let s = (-24.9975 * Math.pow(rank - 1, 0.4) + 200) * ((percent - (min - 1)) / (100 - (min - 1)));
  s = Math.max(0, s);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  if (percent !== 100) return r3(s - s / 3);
  return Math.max(r3(s), 0);
}

// Punkte je nach Punkte-System der Liste
export function scoreFor(list, position, percent, minPercent) {
  if (!position) return 0;
  if ((list?.scoring || "linear") === "demonlist") return demonScore(position, percent ?? 100, minPercent ?? 50);
  return pointsFor(position, list?.max_places);
}

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

export async function buildRanking(env) {
  const [links, users, levels, lists, records] = await Promise.all([
    db(env, "GET", "gd_links?select=discord_id,gd_name"),
    db(env, "GET", "users?select=discord_id,avatar"),
    db(env, "GET", "levels?select=id,list_id,position,creator,requirement"),
    db(env, "GET", "lists?select=id,max_places,scoring"),
    db(env, "GET", "records?status=eq.approved&select=level_id,submitted_by,percent"),
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
    if (!done.has(r.submitted_by)) done.set(r.submitted_by, new Map());
    const m2 = done.get(r.submitted_by);
    m2.set(r.level_id, Math.max(m2.get(r.level_id) || 0, r.percent ?? 100));
  }

  const rows = [];
  for (const [discordId, levelMap] of done) {
    const gd = gdByDiscord.get(discordId);
    let points = 0;
    for (const [lid, pct] of levelMap) {
      const lv = levelById[lid];
      points += scoreFor(listById[lv.list_id], lv.position, pct, lv.requirement);
    }
    const levelIds = new Set(levelMap.keys());
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

  // Community Beats: Punkte werden gleichmäßig auf alle Mitwirkenden verteilt.
  // Gezählt werden nur Mitwirkende, die einen GD-Account verknüpft haben.
  const beatLevels = (levels || []).filter((lv) => lv.is_beat);
  if (beatLevels.length) {
    const beatIds = beatLevels.map((lv) => lv.id).join(",");
    const contribs = (await db(env, "GET", `level_contributors?level_id=in.(${beatIds})&select=level_id,discord_id,name`)) || [];
    // Mitwirkende werden über ihren GD-Namen mit einem verknüpften Discord-Konto verbunden
    const discordByGdName = new Map((links || []).map((l2) => [String(l2.gd_name).toLowerCase(), l2.discord_id]));
    contribs.forEach((c) => {
      if (!c.discord_id) c.discord_id = discordByGdName.get(String(c.name).toLowerCase()) || null;
    });
    const byLevel = new Map();
    contribs.forEach((c) => {
      if (!byLevel.has(c.level_id)) byLevel.set(c.level_id, []);
      byLevel.get(c.level_id).push(c);
    });
    for (const lv of beatLevels) {
      const list2 = byLevel.get(lv.id) || [];
      if (!list2.length) continue;
      const share = pointsFor(lv.position, listById[lv.list_id]?.max_places) / list2.length;
      for (const c of list2) {
        const gd = c.discord_id && gdByDiscord.get(c.discord_id);
        if (!gd) continue;
        let row = rows.find((r) => r.discordId === c.discord_id);
        if (!row) {
          row = { discordId: c.discord_id, name: gd, avatar: avatarByDiscord.get(c.discord_id)
            ? `https://cdn.discordapp.com/avatars/${c.discord_id}/${avatarByDiscord.get(c.discord_id)}.png?size=64` : null,
            points: 0, completions: 0, created: 0 };
          rows.push(row);
        }
        row.points += share;
        row.completions += 1;
      }
    }
    rows.forEach((r) => { r.points = Math.round(r.points * 100) / 100; });
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
  return players.slice(0, 300);
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
      `levels?id=eq.${levelMatch[1]}&select=id,list_id,position,name,creator,verifier,gd_level_id,video_url,image_url,duration_seconds,difficulty,requirement,song,objects,nong,creators,is_beat`);
    if (!levels || !levels[0]) return json({ error: "not_found" }, 404);
    const level = levels[0];
    const list = (await db(env, "GET", `lists?id=eq.${level.list_id}&select=name,max_places,scoring`))?.[0] || {};
    const records = (await db(env, "GET",
      `records?level_id=eq.${level.id}&status=eq.approved&select=id,player_name,video_url,approved_at,percent&order=approved_at.asc`)) || [];
    const contributors = (await db(env, "GET",
      `level_contributors?level_id=eq.${level.id}&select=name,part,position&order=position.asc`)) || [];
    const points = scoreFor(list, level.position, 100, level.requirement);
    const isBeat = !!level.is_beat;
    const share = isBeat && contributors.length ? Math.round((points / contributors.length) * 100) / 100 : null;
    return json({
      level: {
        ...level,
        listName: list.name,
        maxPlaces: list.max_places,
        points,
        completions: isBeat ? (contributors.length ? 1 : records.length) : records.length,
        isBeat,
        shareEach: share,
      },
      records,
      contributors: contributors.map((c) => ({ ...c, points: share })),
    });
  }

  // Profil einer Person (nach GD-Namen): Rang, Punkte, erstellte Level, Completions
  const profM = path.match(/^\/profiles\/(.{1,60})$/);
  const profDM = path.match(/^\/profiles\/d\/(\d{5,25})$/);
  if ((profM || profDM) && method === "GET") {
    let name;
    let discordHint = null;
    if (profDM) {
      discordHint = profDM[1];
      const u = (await db(env, "GET", `users?discord_id=eq.${discordHint}&select=name`))?.[0]
        || (await db(env, "GET", `guild_members?discord_id=eq.${discordHint}&select=name`))?.[0];
      if (!u) return json({ error: "not_found" }, 404);
      name = u.name;
    } else {
      name = decodeURIComponent(profM[1]).trim();
    }
    const key = name.toLowerCase();
    const ranking = await buildRanking(env);
    const me = discordHint
      ? ranking.find((p) => p.discordId === discordHint) || null
      : ranking.find((p) => p.name.toLowerCase() === key) || null;
    const [levels, lists] = await Promise.all([
      db(env, "GET", "levels?select=id,list_id,position,name,creator,creators,verifier,requirement"),
      db(env, "GET", "lists?select=id,name,slug,max_places,scoring"),
    ]);
    const listById = Object.fromEntries((lists || []).map((x) => [x.id, x]));
    const created = (levels || []).filter((lv) => {
      const names = `${lv.creator || ""}, ${lv.creators || ""}`.toLowerCase().replace(/ and more/g, "");
      return names.split(",").map((s) => s.trim()).includes(key);
    }).map((lv) => ({
      id: lv.id, name: lv.name, position: lv.position, listName: listById[lv.list_id]?.name || "",
      listSlug: listById[lv.list_id]?.slug || "", verifier: lv.verifier,
      points: scoreFor(listById[lv.list_id], lv.position, 100, lv.requirement),
    })).sort((x, y) => (x.position || 9999) - (y.position || 9999));

    let completions = [];
    if (me) {
      const recs = (await db(env, "GET", `records?submitted_by=eq.${encodeURIComponent(me.discordId)}&status=eq.approved&select=level_id,percent`)) || [];
      const best = new Map();
      recs.forEach((r) => best.set(r.level_id, Math.max(best.get(r.level_id) || 0, r.percent ?? 100)));
      const levelById = Object.fromEntries((levels || []).map((x) => [x.id, x]));
      completions = [...best.entries()].map(([lid, pct]) => {
        const lv = levelById[lid];
        if (!lv) return null;
        return {
          levelId: lid, name: lv.name, position: lv.position, listName: listById[lv.list_id]?.name || "",
          percent: pct, points: scoreFor(listById[lv.list_id], lv.position, pct, lv.requirement),
        };
      }).filter(Boolean).sort((x, y) => (x.position || 9999) - (y.position || 9999));
    }
    // Tags: Rollen ohne Rechte, die dem Profil zugeordnet sind
    let tags = [];
    if (me) {
      const links = (await db(env, "GET", `user_site_roles?discord_id=eq.${encodeURIComponent(me.discordId)}&select=role_id`)) || [];
      if (links.length) {
        const roles = (await db(env, "GET", `site_roles?id=in.(${links.map((x) => x.role_id).join(",")})&select=name,color,permissions`)) || [];
        tags = roles.filter((r) => !r.permissions || r.permissions.length === 0).map((r) => ({ name: r.name, color: r.color }));
      }
    }
    return json({
      tags,
      name: me ? me.name : name,
      avatar: me ? me.avatar : null,
      rank: me ? me.rank : null,
      tied: me ? me.tied : false,
      points: me ? me.points : 0,
      completionCount: completions.length,
      createdCount: created.length,
      completions,
      created,
    });
  }

  // Rangliste: nur verifizierte GD-Accounts, die mindestens ein Listen-Level geschafft haben.
  // Punkte = Summe der Punkte je Level (jedes Level zählt einmal). Gleiche Punkte = gleicher Platz.
  if (path === "/stats" && method === "GET") {
    return json({ players: await buildRanking(env) });
  }

  // Sync-Empfang vom GitHub-Ablauf (Authentifizierung über geheimen Schlüssel, nicht über Login)
  if ((path === "/sync/ingest" || path === "/sync/fail") && method === "POST") {
    const auth = request.headers.get("Authorization") || "";
    if (!env.SYNC_INGEST_SECRET || auth !== `Bearer ${env.SYNC_INGEST_SECRET}`) return json({ error: "forbidden" }, 403);
    const b = await request.json().catch(() => null);
    if (!UUID.test(b?.listId || "")) return json({ error: "invalid_list" }, 400);
    const list = (await db(env, "GET", `lists?id=eq.${b.listId}&select=id,max_duration_seconds,sync_enabled`))?.[0];
    if (!list) return json({ error: "not_found" }, 404);
    if (path === "/sync/fail") {
      await db(env, "PATCH", `lists?id=eq.${list.id}`, { sync_running: false, sync_status: "fehler", sync_message: clean(b?.message, 300) || "Unbekannter Fehler" });
      return json({ ok: true });
    }
    if (!list.sync_enabled) return json({ error: "sync_disabled" }, 403);
    try {
      const result = await mergeImport(env, list, Array.isArray(b?.levels) ? b.levels : []);
      const msg = `${result.updated} aktualisiert, ${result.added} neu, ${result.recordsAdded} Records neu, ${result.notInImport} nicht mehr im Import`;
      await db(env, "PATCH", `lists?id=eq.${list.id}`, { sync_running: false, sync_status: "ok", sync_message: msg });
      return json(result);
    } catch (err) {
      await db(env, "PATCH", `lists?id=eq.${list.id}`, { sync_running: false, sync_status: "fehler", sync_message: String(err.message || err).slice(0, 300) });
      return json({ error: "merge_failed" }, 500);
    }
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

  // Synchronisation pro Liste: nur Admins
  const syncM = path.match(/^\/mod\/lists\/([0-9a-f-]{36})\/sync$/);
  if (syncM && UUID.test(syncM[1])) {
    if (!perms.includes("admin")) return json({ error: "forbidden" }, 403);
    if (method === "GET") {
      const row = (await db(env, "GET", `lists?id=eq.${syncM[1]}&select=sync_enabled,sync_url,sync_last_run,sync_running,sync_status,sync_message`))?.[0];
      if (!row) return json({ error: "not_found" }, 404);
      return json(row);
    }
    if (method === "PUT") {
      const b = await request.json().catch(() => ({}));
      const patch = { sync_enabled: !!b.enabled };
      if (b.url !== undefined) {
        const u = b.url ? clean(b.url, 300) : null;
        if (u && !isHttps(u)) return json({ error: "invalid_url" }, 400);
        patch.sync_url = u;
      }
      if (patch.sync_enabled && !(patch.sync_url || (await db(env, "GET", `lists?id=eq.${syncM[1]}&select=sync_url`))?.[0]?.sync_url)) {
        return json({ error: "no_url" }, 400);
      }
      await db(env, "PATCH", `lists?id=eq.${syncM[1]}`, patch);
      return json({ ok: true });
    }
  }

  const syncNowM = path.match(/^\/mod\/lists\/([0-9a-f-]{36})\/sync-now$/);
  if (syncNowM && UUID.test(syncNowM[1]) && method === "POST") {
    if (!perms.includes("admin")) return json({ error: "forbidden" }, 403);
    const row = (await db(env, "GET", `lists?id=eq.${syncNowM[1]}&select=sync_enabled,sync_url,sync_last_run,sync_running`))?.[0];
    if (!row) return json({ error: "not_found" }, 404);
    if (!row.sync_enabled) return json({ error: "sync_disabled" }, 400);
    if (!row.sync_url) return json({ error: "no_url" }, 400);
    if (row.sync_running) return json({ error: "already_running" }, 409);
    const COOLDOWN = 15 * 60 * 1000;
    const since = row.sync_last_run ? Date.now() - new Date(row.sync_last_run).getTime() : Infinity;
    if (since < COOLDOWN) return json({ error: "cooldown", waitSeconds: Math.ceil((COOLDOWN - since) / 1000) }, 429);
    await db(env, "PATCH", `lists?id=eq.${syncNowM[1]}`, {
      sync_running: true, sync_last_run: new Date().toISOString(), sync_status: "läuft", sync_message: null,
    });
    const gh = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/sync-list.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GH_SYNC_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "besterregen-api",
      },
      body: JSON.stringify({ ref: "main", inputs: { list_id: syncNowM[1], source_url: row.sync_url } }),
    });
    if (!gh.ok) {
      await db(env, "PATCH", `lists?id=eq.${syncNowM[1]}`, { sync_running: false, sync_status: "fehler", sync_message: `Start bei GitHub fehlgeschlagen (${gh.status})` });
      return json({ error: "github_failed" }, 502);
    }
    return json({ ok: true, started: true });
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

  // JSON-Import (Ausgabe des Import-Skripts). Überschreibt nie vorhandene Level.
  if (path === "/mod/import" && method === "POST") {
    const denied = need("lists.manage"); if (denied) return denied;
    const b = await request.json().catch(() => null);
    if (!UUID.test(b?.listId || "") || !Array.isArray(b?.levels) || !b.levels.length) {
      return json({ error: "invalid_import" }, 400);
    }
    if (b.levels.length > 500) return json({ error: "too_many" }, 400);
    const list = (await db(env, "GET", `lists?id=eq.${b.listId}&select=id,max_duration_seconds`))?.[0];
    if (!list) return json({ error: "invalid_list" }, 400);
    const existing = (await db(env, "GET", `levels?list_id=eq.${b.listId}&select=position`)) || [];
    if (existing.length && b.mode !== "merge") {
      return json({ error: "list_not_empty", count: existing.length }, 409);
    }
    if (existing.length && b.mode === "merge") {
      return json(await mergeImport(env, list, b.levels));
    }
    const rows = [];
    const skipped = [];
    const seen = new Set();
    for (const e of b.levels) {
      const rank = Number(e?.rank);
      const why = (msg) => skipped.push({ rank: e?.rank ?? null, name: e?.name ?? null, reason: msg });
      if (!Number.isInteger(rank) || rank < 1) { why("Platz fehlt oder ist ungültig"); continue; }
      if (seen.has(rank)) { why("Platz kommt doppelt vor"); continue; }
      const name = clean(e.name, 80);
      if (!name) { why("Name fehlt"); continue; }
      const gd = String(e.levelId || "").trim();
      if (!/^\d{1,12}$/.test(gd)) { why("Level-ID fehlt (wird übersprungen)"); continue; }
      const dur = e.lengthSeconds == null ? null : Number(e.lengthSeconds);
      if (dur !== null && (!Number.isInteger(dur) || dur < 1)) { why("Länge ist ungültig"); continue; }
      if (dur && list.max_duration_seconds && dur > list.max_duration_seconds) { why(`Länger als ${list.max_duration_seconds} s`); continue; }
      const vid = String(e.videoId || "");
      seen.add(rank);
      rows.push({
        list_id: b.listId,
        position: rank,
        name,
        creator: clean(e.publisher, 60) || clean(e.verifier, 60) || "Unbekannt",
        verifier: clean(e.verifier, 60) || clean(e.publisher, 60) || "Unbekannt",
        gd_level_id: gd,
        video_url: /^[\w-]{11}$/.test(vid) ? `https://www.youtube.com/watch?v=${vid}` : "https://www.youtube.com/",
        // Vorschaubild direkt von YouTube, damit wir kein Bild speichern müssen
        image_url: /^[\w-]{11}$/.test(vid) ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null,
        duration_seconds: dur,
        difficulty: clean(e.difficulty, 40) || null,
        requirement: Number.isInteger(Number(e.requirement ?? e.percentToQualify)) && Number(e.requirement ?? e.percentToQualify) >= 1 && Number(e.requirement ?? e.percentToQualify) <= 100 ? Number(e.requirement ?? e.percentToQualify) : 100,
        song: clean(e.song, 80) || null,
        objects: Number.isInteger(Number(e.objects)) ? Number(e.objects) : null,
        nong: clean(e.nong, 80) || null,
        creators: clean(e.creators, 200) || null,
      });
    }
    const created = [];
    for (let i = 0; i < rows.length; i += 200) {
      const got = await db(env, "POST", "levels", rows.slice(i, i + 200), { prefer: "return=representation" });
      created.push(...(got || []));
    }
    // Records der Einzelseiten (bestätigt, Fortschritt als Anmerkung)
    const idByPos = Object.fromEntries(created.map((c) => [c.position, c.id]));
    const recRows = [];
    for (const e of b.levels) {
      const levelId = idByPos[Number(e?.rank)];
      if (!levelId || !Array.isArray(e.records)) continue;
      for (const r of e.records.slice(0, 50)) {
        const player = clean(r?.player, 40);
        if (!player) continue;
        recRows.push({
          level_id: levelId,
          player_name: player,
          percent: Number.isInteger(Number(r?.percent)) ? Number(r.percent) : (parseInt(String(r?.progress), 10) || 100),
          video_url: isHttps(String(r?.videoUrl || "")) ? String(r.videoUrl).slice(0, 300) : "https://www.youtube.com/",
          notes: r?.progress ? `Fortschritt beim Import: ${clean(r.progress, 20)}` : null,
          submitted_by: "import",
          status: "approved",
          approved_at: new Date().toISOString(),
        });
      }
    }
    for (let i = 0; i < recRows.length; i += 200) {
      await db(env, "POST", "records", recRows.slice(i, i + 200), { prefer: "return=minimal" });
    }
    return json({ ok: true, imported: rows.length, records: recRows.length, skipped });
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

  // Liste löschen (inkl. Level, Records, Team und Abos). Nur mit Bestätigung durch den genauen Namen.
  const listDelM = path.match(/^\/mod\/lists\/([0-9a-f-]{36})$/);
  if (listDelM && UUID.test(listDelM[1]) && method === "DELETE") {
    const denied = need("lists.manage"); if (denied) return denied;
    const b = await request.json().catch(() => ({}));
    const list = (await db(env, "GET", `lists?id=eq.${listDelM[1]}&select=id,name`))?.[0];
    if (!list) return json({ error: "not_found" }, 404);
    if (String(b?.confirm || "").trim() !== list.name) return json({ error: "confirm_mismatch" }, 400);
    await db(env, "DELETE", `lists?id=eq.${listDelM[1]}`);
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
    if (b?.scoring === "linear" || b?.scoring === "demonlist") patch.scoring = b.scoring;
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
    if (typeof b?.isBeat === "boolean") patch.is_beat = b.isBeat;
    let contributorRows = null;
    if (Array.isArray(b?.contributors)) {
      contributorRows = b.contributors
        .map((c) => ({ name: clean(c?.name, 40), part: clean(c?.part, 20) || null }))
        .filter((c) => c.name)
        .slice(0, 30)
        .map((c, i) => ({ level_id: levelEditM[1], name: c.name, part: c.part, position: i + 1 }));
    }
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
    if (!Object.keys(patch).length && contributorRows === null) return json({ error: "missing_fields" }, 400);
    if (patch.name === "" || patch.creator === "" || patch.verifier === "") return json({ error: "missing_fields" }, 400);
    if (Object.keys(patch).length) await db(env, "PATCH", `levels?id=eq.${levelEditM[1]}`, patch);
    if (contributorRows !== null) {
      await db(env, "DELETE", `level_contributors?level_id=eq.${levelEditM[1]}`);
      if (contributorRows.length) await db(env, "POST", "level_contributors", contributorRows, { prefer: "return=minimal" });
    }
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

// Erneuter Import: bekannte Level (gleiche Level-ID) werden aktualisiert und behalten ihre Records.
// Neue Level werden angelegt. Level, die im Import fehlen, bleiben unverändert.
export async function mergeImport(env, list, levels) {
  const existing = (await db(env, "GET", `levels?list_id=eq.${list.id}&select=id,gd_level_id,position`)) || [];
  const byGd = new Map(existing.map((x) => [String(x.gd_level_id), x]));
  const seen = new Set();
  const skipped = [];
  const updates = [];
  const news = [];
  for (const e of levels) {
    const rank = Number(e?.rank);
    const gd = String(e?.levelId || "").trim();
    const name = clean(e?.name, 80);
    if (!Number.isInteger(rank) || rank < 1 || !name) { skipped.push({ rank: e?.rank ?? null, name: e?.name ?? null, reason: "Platz oder Name fehlt" }); continue; }
    if (!/^\d{1,12}$/.test(gd)) { skipped.push({ rank, name, reason: "Level-ID fehlt" }); continue; }
    const dur = e.lengthSeconds == null ? null : Number(e.lengthSeconds);
    if (dur !== null && (!Number.isInteger(dur) || dur < 1)) { skipped.push({ rank, name, reason: "Länge ist ungültig" }); continue; }
    if (dur && list.max_duration_seconds && dur > list.max_duration_seconds) { skipped.push({ rank, name, reason: `Länger als ${list.max_duration_seconds} s` }); continue; }
    const vid = String(e.videoId || "");
    const fields = {
      position: rank,
      name,
      creator: clean(e.publisher, 60) || clean(e.verifier, 60) || "Unbekannt",
      verifier: clean(e.verifier, 60) || clean(e.publisher, 60) || "Unbekannt",
      gd_level_id: gd,
      video_url: /^[\w-]{11}$/.test(vid) ? `https://www.youtube.com/watch?v=${vid}` : "https://www.youtube.com/",
      image_url: /^[\w-]{11}$/.test(vid) ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null,
      duration_seconds: dur,
      difficulty: clean(e.difficulty, 40) || null,
      requirement: Number.isInteger(Number(e.requirement ?? e.percentToQualify)) && Number(e.requirement ?? e.percentToQualify) >= 1 && Number(e.requirement ?? e.percentToQualify) <= 100 ? Number(e.requirement ?? e.percentToQualify) : 100,
      song: clean(e.song, 80) || null,
      objects: Number.isInteger(Number(e.objects)) ? Number(e.objects) : null,
      nong: clean(e.nong, 80) || null,
      creators: clean(e.creators, 200) || null,
    };
    seen.add(gd);
    const ex = byGd.get(gd);
    if (ex) updates.push({ id: ex.id, fields, records: Array.isArray(e.records) ? e.records : [] });
    else news.push({ fields, records: Array.isArray(e.records) ? e.records : [] });
  }

  // Alle vorhandenen Records der Liste mit einer Abfrage holen (nicht pro Level)
  const levelIds = existing.map((x) => x.id);
  const haveByLevel = new Map();
  for (let i = 0; i < levelIds.length; i += 100) {
    const chunk = levelIds.slice(i, i + 100).join(",");
    const rows = (await db(env, "GET", `records?level_id=in.(${chunk})&select=level_id,player_name`)) || [];
    rows.forEach((r) => {
      if (!haveByLevel.has(r.level_id)) haveByLevel.set(r.level_id, new Set());
      haveByLevel.get(r.level_id).add(String(r.player_name).toLowerCase());
    });
  }
  const recordRows = (levelId, incoming, done) => {
    const names = done || new Set();
    return incoming
      .map((r) => ({ player: clean(r?.player, 40), progress: clean(r?.progress, 20), videoUrl: r?.videoUrl }))
      .filter((r) => r.player && !names.has(r.player.toLowerCase()))
      .slice(0, 50)
      .map((r) => {
        names.add(r.player.toLowerCase());
        return {
          level_id: levelId,
          player_name: r.player,
          percent: Number.isInteger(Number(r?.percent)) ? Number(r.percent) : (parseInt(String(r?.progress), 10) || 100),
          video_url: isHttps(String(r.videoUrl || "")) ? String(r.videoUrl).slice(0, 300) : "https://www.youtube.com/",
          notes: r.progress ? `Fortschritt beim Import: ${r.progress}` : null,
          submitted_by: "import",
          status: "approved",
          approved_at: new Date().toISOString(),
        };
      });
  };

  // Bekannte Level: alle in einer Sammel-Anfrage aktualisieren (Zeilen-ID bleibt, Records bleiben)
  const existingById = new Map(existing.map((x) => [String(x.gd_level_id), x]));
  if (updates.length) {
    await db(env, "POST", "levels", updates.map((u) => ({ id: u.id, list_id: list.id, ...u.fields })),
      { upsert: true, prefer: "return=minimal,resolution=merge-duplicates" });
  }
  let recordsAdded = 0;
  const allRecs = [];
  for (const u of updates) allRecs.push(...recordRows(u.id, u.records, haveByLevel.get(u.id)));

  // Neue Level: eine Sammel-Anfrage, dann ihre Records
  let added = 0;
  if (news.length) {
    const created = (await db(env, "POST", "levels", news.map((n) => ({ ...n.fields, list_id: list.id })), { prefer: "return=representation" })) || [];
    added = created.length;
    const idByGd = new Map(created.map((c) => [String(c.gd_level_id), c.id]));
    for (const n of news) {
      const id = idByGd.get(n.fields.gd_level_id);
      if (id) allRecs.push(...recordRows(id, n.records, new Set()));
    }
  }
  for (let i = 0; i < allRecs.length; i += 200) {
    await db(env, "POST", "records", allRecs.slice(i, i + 200), { prefer: "return=minimal" });
  }
  recordsAdded = allRecs.length;
  void existingById;
  const missing = existing.filter((x) => !seen.has(String(x.gd_level_id))).length;
  return { ok: true, merged: true, updated: updates.length, added, recordsAdded, notInImport: missing, skipped };
}
