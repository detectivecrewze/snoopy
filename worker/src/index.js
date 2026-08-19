import {
  MAX_WISH_LENGTH,
  PROJECT_ID_PATTERN,
  emptyProject,
  normalizeProject,
  publicProject,
  validatePublishedProject
} from "./project.js";

const encoder = new TextEncoder();
const PROJECT_PREFIX = "project:";
const STUDIO_DRAFT_PREFIX = "studio-draft:";
const WISH_PREFIX = "wish:";

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function configuredOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function configuredOriginSuffixes(env) {
  return String(env.ALLOWED_ORIGIN_SUFFIXES || "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(value => /^\.[a-z0-9.-]+$/.test(value));
}

function isAllowedOrigin(origin, env) {
  if (!origin) return true;
  if (configuredOrigins(env).includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return true;
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return configuredOriginSuffixes(env).some(suffix => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function responseHeaders(request, env, extra = {}) {
  const origin = request.headers.get("Origin");
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
    ...extra
  });
  if (origin && isAllowedOrigin(origin, env)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

function json(request, env, payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(request, env, extraHeaders)
  });
}

function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const value of new Uint8Array(bytes)) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmac(secret, value) {
  if (!secret) throw new HttpError(500, "PROJECT_SIGNING_SECRET belum dikonfigurasi.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(value));
}

async function deriveProjectCredentials(env, source, idempotencyKey) {
  const identity = `${source}:${idempotencyKey}`;
  const projectSignature = await hmac(env.PROJECT_SIGNING_SECRET, `project:${identity}`);
  const projectId = `gift-${bytesToHex(projectSignature).slice(0, 16)}`;
  const tokenSignature = await hmac(env.PROJECT_SIGNING_SECRET, `edit-token:${projectId}`);
  const editToken = bytesToBase64Url(tokenSignature);
  return { projectId, editToken, editTokenHash: await sha256(editToken) };
}

async function deriveEditToken(env, projectId) {
  return bytesToBase64Url(await hmac(env.PROJECT_SIGNING_SECRET, `edit-token:${projectId}`));
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) throw new HttpError(415, "Gunakan Content-Type application/json.");
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Payload JSON tidak valid.");
  }
}

function assertProjectId(projectId) {
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new HttpError(400, "Project ID tidak valid.");
}

async function getRecord(env, projectId) {
  assertProjectId(projectId);
  return env.GIFT_KV.get(`${PROJECT_PREFIX}${projectId}`, "json");
}

async function requireProject(env, projectId) {
  const record = await getRecord(env, projectId);
  if (!record) throw new HttpError(404, "Project tidak ditemukan.");
  return record;
}

async function authorizeProject(request, env, record, allowAdmin = false) {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, "Magic token diperlukan.");
  if (allowAdmin && env.ADMIN_SECRET && constantTimeEqual(token, env.ADMIN_SECRET)) return "admin";
  const tokenHash = await sha256(token);
  if (!record.auth?.editTokenHash || !constantTimeEqual(tokenHash, record.auth.editTokenHash)) {
    throw new HttpError(403, "Magic token tidak valid.");
  }
  return "studio";
}

function requireAdmin(request, env) {
  if (!env.ADMIN_SECRET) throw new HttpError(500, "ADMIN_SECRET belum dikonfigurasi.");
  if (!constantTimeEqual(bearerToken(request), env.ADMIN_SECRET)) throw new HttpError(403, "Admin secret tidak valid.");
}

function absoluteUrl(base, path) {
  const normalizedBase = String(base || "").replace(/\/$/, "");
  return `${normalizedBase}${path}`;
}

function projectLinks(env, projectId, editToken) {
  return {
    giftUrl: absoluteUrl(env.PUBLIC_GIFT_BASE_URL, `/gift/${projectId}`),
    studioUrl: `${absoluteUrl(env.PUBLIC_STUDIO_BASE_URL || env.PUBLIC_GIFT_BASE_URL, `/studio/${projectId}`)}#token=${editToken}`
  };
}

async function createProject(env, sourceInput, idempotencyInput, initialProject) {
  const source = String(sourceInput || "manual").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  const idempotencyKey = String(idempotencyInput || "").trim().slice(0, 200);
  if (!source || idempotencyKey.length < 3) throw new HttpError(400, "source dan idempotencyKey wajib diisi.");

  const credentials = await deriveProjectCredentials(env, source, idempotencyKey);
  const projectKey = `${PROJECT_PREFIX}${credentials.projectId}`;
  const idempotencyStorageKey = `idempotency:${source}:${await sha256(idempotencyKey)}`;
  let record = await env.GIFT_KV.get(projectKey, "json");
  let created = false;

  if (!record) {
    const now = new Date().toISOString();
    const initial = initialProject && typeof initialProject === "object" ? initialProject : emptyProject(credentials.projectId);
    const project = normalizeProject({ ...initial, status: "draft" }, credentials.projectId);
    record = {
      ...project,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      auth: { editTokenHash: credentials.editTokenHash, tokenVersion: 2 },
      source,
      idempotencyKeyHash: await sha256(idempotencyKey)
    };
    await env.GIFT_KV.put(projectKey, JSON.stringify(record));
    created = true;
  }

  await env.GIFT_KV.put(idempotencyStorageKey, credentials.projectId);
  return {
    created,
    projectId: credentials.projectId,
    ...projectLinks(env, credentials.projectId, credentials.editToken)
  };
}

async function handleInternalCreateProject(request, env) {
  if (!env.INTERNAL_GENERATOR_SECRET || !constantTimeEqual(bearerToken(request), env.INTERNAL_GENERATOR_SECRET)) {
    throw new HttpError(403, "Internal generator secret tidak valid.");
  }
  const body = await readJson(request);
  const result = await createProject(env, body.source, body.idempotencyKey, body.project);
  return json(request, env, result, result.created ? 201 : 200, { "Cache-Control": "no-store" });
}

async function handleAdminCreateProject(request, env) {
  requireAdmin(request, env);
  const body = await readJson(request);
  const result = await createProject(env, "manual", body.idempotencyKey, body.project);
  return json(request, env, result, result.created ? 201 : 200, { "Cache-Control": "no-store" });
}

async function handleGetGift(request, env, projectId) {
  const record = await requireProject(env, projectId);
  if (record.status !== "published") throw new HttpError(404, "Kado belum dipublikasikan.");
  return json(request, env, { project: publicProject(record) }, 200, { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" });
}

async function handleGetStudio(request, env, projectId) {
  const record = await requireProject(env, projectId);
  if (record.status === "archived") throw new HttpError(410, "Project sedang diarsipkan.");
  await authorizeProject(request, env, record);
  const savedDraft = await env.GIFT_KV.get(`${STUDIO_DRAFT_PREFIX}${projectId}`, "json");
  const studioProject = savedDraft
    ? normalizeProject({ ...savedDraft, status: record.status }, projectId, record)
    : record;
  return json(request, env, {
    project: publicProject(studioProject),
    giftUrl: absoluteUrl(env.PUBLIC_GIFT_BASE_URL, `/gift/${projectId}`)
  }, 200, { "Cache-Control": "no-store" });
}

async function handleSaveStudio(request, env, projectId) {
  const existing = await requireProject(env, projectId);
  if (existing.status === "archived") throw new HttpError(410, "Project sedang diarsipkan.");
  await authorizeProject(request, env, existing);
  const body = await readJson(request);
  const requestedStatus = body.status === "published" ? "published" : "draft";
  const studioStatus = requestedStatus === "published" ? "published" : existing.status === "published" ? "published" : "draft";
  const normalized = normalizeProject({ ...(body.project || {}), status: studioStatus }, projectId, existing);
  if (requestedStatus === "published") {
    const errors = validatePublishedProject(normalized);
    if (Object.keys(errors).length) throw new HttpError(422, "Project belum lengkap untuk dipublikasikan.", errors);
  }

  const now = new Date().toISOString();
  const record = {
    ...normalized,
    status: studioStatus,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    publishedAt: existing.publishedAt || (requestedStatus === "published" ? now : null),
    auth: existing.auth,
    source: existing.source,
    idempotencyKeyHash: existing.idempotencyKeyHash
  };
  if (requestedStatus === "published") {
    await env.GIFT_KV.put(`${PROJECT_PREFIX}${projectId}`, JSON.stringify(record));
    await env.GIFT_KV.delete(`${STUDIO_DRAFT_PREFIX}${projectId}`);
  } else {
    // Keep the last published record untouched while the owner is editing.
    // This also lets incomplete intermediate states autosave without a 422.
    const { auth, source, idempotencyKeyHash, ...safeDraft } = record;
    await env.GIFT_KV.put(`${STUDIO_DRAFT_PREFIX}${projectId}`, JSON.stringify(safeDraft));
  }
  return json(request, env, {
    project: publicProject(record),
    giftUrl: absoluteUrl(env.PUBLIC_GIFT_BASE_URL, `/gift/${projectId}`)
  }, 200, { "Cache-Control": "no-store" });
}

function safeFileName(value) {
  return String(value || "file").replace(/[^a-z0-9._-]/gi, "-").replace(/-+/g, "-").slice(0, 100);
}

async function handleUpload(request, env) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") || "").trim().toLowerCase();
  const kind = String(form.get("kind") || "").trim().toLowerCase();
  const file = form.get("file");
  const record = await requireProject(env, projectId);
  if (record.status === "archived") throw new HttpError(410, "Project sedang diarsipkan.");
  await authorizeProject(request, env, record);
  if (!(file instanceof File)) throw new HttpError(400, "File upload wajib disertakan.");
  if (!env.MEDIA_BASE_URL) throw new HttpError(500, "MEDIA_BASE_URL belum dikonfigurasi.");

  let directory;
  let extension;
  let contentType;
  const originalExtension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  if (kind === "photo") {
    const mimeExtensions = new Map([["image/jpeg", "jpg"], ["image/jpg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
    const extensionTypes = new Map([["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]);
    const detectedExtension = mimeExtensions.get(file.type.toLowerCase()) || (extensionTypes.has(originalExtension) ? originalExtension : "");
    if (!detectedExtension) throw new HttpError(415, "Foto harus berformat JPG, PNG, atau WEBP.");
    if (file.size > 8 * 1024 * 1024) throw new HttpError(413, "Ukuran foto maksimal 8 MB.");
    directory = "photos";
    extension = detectedExtension === "jpeg" ? "jpg" : detectedExtension;
    contentType = extensionTypes.get(detectedExtension) || "image/jpeg";
  } else if (kind === "video") {
    const mimeExtensions = new Map([["video/mp4", "mp4"], ["video/webm", "webm"], ["video/quicktime", "mov"]]);
    const extensionTypes = new Map([["mp4", "video/mp4"], ["webm", "video/webm"], ["mov", "video/quicktime"]]);
    const detectedExtension = mimeExtensions.get(file.type.toLowerCase()) || (extensionTypes.has(originalExtension) ? originalExtension : "");
    if (!detectedExtension) throw new HttpError(415, "Video harus berformat MP4, WEBM, atau MOV.");
    if (file.size > 20 * 1024 * 1024) throw new HttpError(413, "Ukuran video maksimal 20 MB.");
    directory = "videos";
    extension = detectedExtension;
    contentType = extensionTypes.get(detectedExtension);
  } else if (kind === "audio") {
    if (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3")) throw new HttpError(415, "Audio harus berformat MP3.");
    if (file.size > 25 * 1024 * 1024) throw new HttpError(413, "Ukuran MP3 maksimal 25 MB.");
    directory = "audio";
    extension = "mp3";
    contentType = "audio/mpeg";
  } else {
    throw new HttpError(400, "Jenis upload harus photo, video, atau audio.");
  }

  const key = `snoopy/${projectId}/${directory}/${crypto.randomUUID()}-${safeFileName(file.name.replace(/\.[^.]+$/, ""))}.${extension}`;
  try {
    await env.MEDIA_BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType },
      customMetadata: { projectId, kind, uploadedAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error("R2 media upload failed", { projectId, kind, key, message: error?.message });
    throw new HttpError(502, "Media belum berhasil disimpan ke R2. Periksa binding bucket Worker.");
  }
  return json(request, env, { url: absoluteUrl(env.MEDIA_BASE_URL, `/${key}`), key, kind }, 201, { "Cache-Control": "no-store" });
}

async function enforceWishRateLimit(request, env, projectId) {
  const address = request.headers.get("CF-Connecting-IP") || "unknown";
  const identity = await sha256(`${env.PROJECT_SIGNING_SECRET || "rate"}:${address}`);
  const bucket = Math.floor(Date.now() / 600000);
  const key = `rate:wish:${projectId}:${identity.slice(0, 24)}:${bucket}`;
  const count = Number(await env.GIFT_KV.get(key)) || 0;
  if (count >= 20) throw new HttpError(429, "Terlalu banyak wish dikirim. Coba beberapa saat lagi.");
  await env.GIFT_KV.put(key, String(count + 1), { expirationTtl: 1200 });
}

async function handleSubmitWish(request, env) {
  const body = await readJson(request);
  const projectId = String(body.projectId || "").trim().toLowerCase();
  const record = await requireProject(env, projectId);
  if (record.status !== "published" || record.settings?.wishEnabled === false) throw new HttpError(404, "Wish inbox tidak tersedia.");
  const wish = String(body.wish || "").trim();
  const length = [...wish].length;
  if (length < 3 || length > MAX_WISH_LENGTH) throw new HttpError(400, `Wish harus berisi 3 sampai ${MAX_WISH_LENGTH} karakter.`);
  await enforceWishRateLimit(request, env, projectId);

  const now = new Date();
  const inverseTime = String(9999999999999 - now.getTime()).padStart(13, "0");
  const entry = {
    id: crypto.randomUUID(),
    projectId,
    recipient: record.identity?.recipient || String(body.recipient || "Birthday Star").slice(0, 80),
    wish,
    createdAt: now.toISOString()
  };
  await env.GIFT_KV.put(`${WISH_PREFIX}${projectId}:${inverseTime}:${entry.id}`, JSON.stringify(entry));
  return json(request, env, entry, 201, { "Cache-Control": "no-store" });
}

async function handleGetWishes(request, env, projectId) {
  const record = await requireProject(env, projectId);
  await authorizeProject(request, env, record, true);
  const limitParam = new URL(request.url).searchParams.get("limit");
  const requestedLimit = limitParam === null ? NaN : Number(limitParam);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;
  const listed = await env.GIFT_KV.list({ prefix: `${WISH_PREFIX}${projectId}:`, limit });
  const wishes = (await Promise.all(listed.keys.map(key => env.GIFT_KV.get(key.name, "json")))).filter(Boolean);
  wishes.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  return json(request, env, { wishes, cursor: listed.list_complete ? null : listed.cursor }, 200, { "Cache-Control": "no-store" });
}

async function adminProjectSummary(env, record) {
  const editToken = await deriveEditToken(env, record.projectId);
  const tokenMatches = record.auth?.editTokenHash && constantTimeEqual(await sha256(editToken), record.auth.editTokenHash);
  const links = projectLinks(env, record.projectId, editToken);
  return {
    projectId: record.projectId,
    recipient: record.identity?.recipient || "Belum diisi",
    sender: record.identity?.sender || "Belum diisi",
    birthdayDate: record.identity?.birthdayDate || "",
    status: record.status || "draft",
    source: record.source || "manual",
    galleryCount: Array.isArray(record.gallery) ? record.gallery.filter(item => item?.mediaUrl || item?.imageUrl).length : 0,
    wishEnabled: record.settings?.wishEnabled !== false,
    createdAt: record.createdAt || "",
    updatedAt: record.updatedAt || "",
    publishedAt: record.publishedAt || null,
    archivedAt: record.archivedAt || null,
    giftUrl: links.giftUrl,
    studioUrl: tokenMatches ? links.studioUrl : null
  };
}

async function handleAdminListProjects(request, env) {
  requireAdmin(request, env);
  const url = new URL(request.url);
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
  const statusFilter = String(url.searchParams.get("status") || "all").trim().toLowerCase();
  const limitParam = url.searchParams.get("limit");
  const requestedLimit = limitParam === null ? NaN : Number(limitParam);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;
  const listed = await env.GIFT_KV.list({ prefix: PROJECT_PREFIX, limit: 1000 });
  const records = (await Promise.all(listed.keys.map(key => env.GIFT_KV.get(key.name, "json")))).filter(Boolean);
  const stats = records.reduce((result, record) => {
    const status = ["draft", "published", "archived"].includes(record.status) ? record.status : "draft";
    result.total += 1;
    result[status] += 1;
    return result;
  }, { total: 0, draft: 0, published: 0, archived: 0 });
  const filtered = records.filter(record => {
    if (statusFilter !== "all" && record.status !== statusFilter) return false;
    if (!search) return true;
    const haystack = [record.projectId, record.identity?.recipient, record.identity?.sender, record.source].join(" ").toLowerCase();
    return haystack.includes(search);
  });
  filtered.sort((left, right) => String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt)));
  const projects = await Promise.all(filtered.slice(0, limit).map(record => adminProjectSummary(env, record)));
  return json(request, env, { projects, stats, totalMatched: filtered.length }, 200, { "Cache-Control": "no-store" });
}

async function handleAdminProjectStatus(request, env, projectId) {
  requireAdmin(request, env);
  const body = await readJson(request);
  const action = String(body.action || "").toLowerCase();
  const existing = await requireProject(env, projectId);
  const now = new Date().toISOString();
  let record;
  if (action === "archive") {
    if (existing.status === "archived") return json(request, env, { project: await adminProjectSummary(env, existing) }, 200, { "Cache-Control": "no-store" });
    record = { ...existing, status: "archived", archivedFrom: existing.status, archivedAt: now, updatedAt: now };
  } else if (action === "restore") {
    if (existing.status !== "archived") throw new HttpError(409, "Project tidak sedang diarsipkan.");
    const restoredStatus = existing.archivedFrom === "published" ? "published" : "draft";
    record = { ...existing, status: restoredStatus, archivedAt: null, archivedFrom: null, updatedAt: now };
  } else {
    throw new HttpError(400, "Action harus archive atau restore.");
  }
  await env.GIFT_KV.put(`${PROJECT_PREFIX}${projectId}`, JSON.stringify(record));
  return json(request, env, { project: await adminProjectSummary(env, record) }, 200, { "Cache-Control": "no-store" });
}

async function collectKvKeys(env, prefix) {
  const names = [];
  let cursor;
  do {
    const page = await env.GIFT_KV.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    names.push(...page.keys.map(key => key.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return names;
}

async function deleteKvKeys(env, names) {
  for (let index = 0; index < names.length; index += 100) {
    await Promise.all(names.slice(index, index + 100).map(name => env.GIFT_KV.delete(name)));
  }
}

async function collectR2Keys(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await env.MEDIA_BUCKET.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    keys.push(...page.objects.map(object => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

async function handleAdminDeleteProject(request, env, projectId) {
  requireAdmin(request, env);
  const existing = await requireProject(env, projectId);
  const wishKeys = await collectKvKeys(env, `${WISH_PREFIX}${projectId}:`);
  const rateKeys = await collectKvKeys(env, `rate:wish:${projectId}:`);
  const mediaKeys = await collectR2Keys(env, `snoopy/${projectId}/`);
  await deleteKvKeys(env, [...wishKeys, ...rateKeys]);
  if (mediaKeys.length) await env.MEDIA_BUCKET.delete(mediaKeys);
  if (existing.source && existing.idempotencyKeyHash) {
    await env.GIFT_KV.delete(`idempotency:${existing.source}:${existing.idempotencyKeyHash}`);
  }
  await env.GIFT_KV.delete(`${PROJECT_PREFIX}${projectId}`);
  await env.GIFT_KV.delete(`${STUDIO_DRAFT_PREFIX}${projectId}`);
  return json(request, env, {
    deleted: true,
    projectId,
    removedWishes: wishKeys.length,
    removedMedia: mediaKeys.length
  }, 200, { "Cache-Control": "no-store" });
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(request.headers.get("Origin"), env)) return json(request, env, { error: "Origin tidak diizinkan." }, 403);
    return new Response(null, { status: 204, headers: responseHeaders(request, env) });
  }
  if (!isAllowedOrigin(request.headers.get("Origin"), env)) throw new HttpError(403, "Origin tidak diizinkan.");
  if (request.method === "GET" && path === "/api/health") return json(request, env, { ok: true, service: "snoopy-gift-api" });

  let match = path.match(/^\/api\/gift\/([^/]+)$/);
  if (request.method === "GET" && match) return handleGetGift(request, env, decodeURIComponent(match[1]).toLowerCase());
  match = path.match(/^\/api\/studio\/([^/]+)$/);
  if (request.method === "GET" && match) return handleGetStudio(request, env, decodeURIComponent(match[1]).toLowerCase());
  if (request.method === "PUT" && match) return handleSaveStudio(request, env, decodeURIComponent(match[1]).toLowerCase());
  if (request.method === "POST" && path === "/api/upload") return handleUpload(request, env);
  if (request.method === "POST" && path === "/api/wishes") return handleSubmitWish(request, env);
  match = path.match(/^\/api\/wishes\/([^/]+)$/);
  if (request.method === "GET" && match) return handleGetWishes(request, env, decodeURIComponent(match[1]).toLowerCase());
  if (request.method === "GET" && path === "/api/admin/projects") return handleAdminListProjects(request, env);
  if (request.method === "POST" && path === "/api/admin/projects") return handleAdminCreateProject(request, env);
  match = path.match(/^\/api\/admin\/projects\/([^/]+)$/);
  if (request.method === "PATCH" && match) return handleAdminProjectStatus(request, env, decodeURIComponent(match[1]).toLowerCase());
  if (request.method === "DELETE" && match) return handleAdminDeleteProject(request, env, decodeURIComponent(match[1]).toLowerCase());
  if (request.method === "POST" && path === "/api/internal/projects") return handleInternalCreateProject(request, env);
  throw new HttpError(404, "Endpoint tidak ditemukan.");
}

export default {
  async fetch(request, env) {
    try {
      if (!env.GIFT_KV || !env.MEDIA_BUCKET) throw new HttpError(500, "Binding KV atau R2 belum dikonfigurasi.");
      return await route(request, env);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (!(error instanceof HttpError)) console.error("Unhandled Worker error", error);
      return json(request, env, {
        error: status === 500 ? "Terjadi kesalahan pada server." : error.message,
        ...(error instanceof HttpError && error.details ? { details: error.details } : {})
      }, status, { "Cache-Control": "no-store" });
    }
  }
};
