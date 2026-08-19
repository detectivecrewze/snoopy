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

function isAllowedOrigin(origin, env) {
  if (!origin) return true;
  if (configuredOrigins(env).includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
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
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
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
  const tokenSignature = await hmac(env.PROJECT_SIGNING_SECRET, `edit-token:${identity}`);
  const projectId = `gift-${bytesToHex(projectSignature).slice(0, 16)}`;
  const editToken = bytesToBase64Url(tokenSignature);
  return { projectId, editToken, editTokenHash: await sha256(editToken) };
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

async function handleCreateProject(request, env) {
  const internalSecret = bearerToken(request);
  if (!env.INTERNAL_GENERATOR_SECRET || !constantTimeEqual(internalSecret, env.INTERNAL_GENERATOR_SECRET)) {
    throw new HttpError(403, "Internal generator secret tidak valid.");
  }
  const body = await readJson(request);
  const source = String(body.source || "manual").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  const idempotencyKey = String(body.idempotencyKey || "").trim().slice(0, 200);
  if (!source || idempotencyKey.length < 3) throw new HttpError(400, "source dan idempotencyKey wajib diisi.");

  const credentials = await deriveProjectCredentials(env, source, idempotencyKey);
  const projectKey = `${PROJECT_PREFIX}${credentials.projectId}`;
  const idempotencyStorageKey = `idempotency:${source}:${await sha256(idempotencyKey)}`;
  let record = await env.GIFT_KV.get(projectKey, "json");
  let created = false;

  if (!record) {
    const now = new Date().toISOString();
    const initial = body.project && typeof body.project === "object" ? body.project : emptyProject(credentials.projectId);
    const project = normalizeProject({ ...initial, status: "draft" }, credentials.projectId);
    record = {
      ...project,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      auth: { editTokenHash: credentials.editTokenHash },
      source,
      idempotencyKeyHash: await sha256(idempotencyKey)
    };
    await env.GIFT_KV.put(projectKey, JSON.stringify(record));
    created = true;
  }

  await env.GIFT_KV.put(idempotencyStorageKey, credentials.projectId);
  return json(request, env, {
    created,
    projectId: credentials.projectId,
    ...projectLinks(env, credentials.projectId, credentials.editToken)
  }, created ? 201 : 200, { "Cache-Control": "no-store" });
}

async function handleGetGift(request, env, projectId) {
  const record = await requireProject(env, projectId);
  if (record.status !== "published") throw new HttpError(404, "Kado belum dipublikasikan.");
  return json(request, env, { project: publicProject(record) }, 200, { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" });
}

async function handleGetStudio(request, env, projectId) {
  const record = await requireProject(env, projectId);
  await authorizeProject(request, env, record);
  return json(request, env, {
    project: publicProject(record),
    giftUrl: absoluteUrl(env.PUBLIC_GIFT_BASE_URL, `/gift/${projectId}`)
  }, 200, { "Cache-Control": "no-store" });
}

async function handleSaveStudio(request, env, projectId) {
  const existing = await requireProject(env, projectId);
  await authorizeProject(request, env, existing);
  const body = await readJson(request);
  const requestedStatus = body.status === "published" ? "published" : "draft";
  const normalized = normalizeProject({ ...(body.project || {}), status: requestedStatus }, projectId, existing);
  if (requestedStatus === "published") {
    const errors = validatePublishedProject(normalized);
    if (Object.keys(errors).length) throw new HttpError(422, "Project belum lengkap untuk dipublikasikan.", errors);
  }

  const now = new Date().toISOString();
  const record = {
    ...normalized,
    status: requestedStatus,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    publishedAt: requestedStatus === "published" ? existing.publishedAt || now : null,
    auth: existing.auth,
    source: existing.source,
    idempotencyKeyHash: existing.idempotencyKeyHash
  };
  await env.GIFT_KV.put(`${PROJECT_PREFIX}${projectId}`, JSON.stringify(record));
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
  await authorizeProject(request, env, record);
  if (!(file instanceof File)) throw new HttpError(400, "File upload wajib disertakan.");
  if (!env.MEDIA_BASE_URL) throw new HttpError(500, "MEDIA_BASE_URL belum dikonfigurasi.");

  let directory;
  let extension;
  if (kind === "photo") {
    const allowed = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
    if (!allowed.has(file.type)) throw new HttpError(415, "Foto harus berformat JPG, PNG, atau WEBP.");
    if (file.size > 8 * 1024 * 1024) throw new HttpError(413, "Ukuran foto maksimal 8 MB.");
    directory = "photos";
    extension = allowed.get(file.type);
  } else if (kind === "audio") {
    if (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3")) throw new HttpError(415, "Audio harus berformat MP3.");
    if (file.size > 25 * 1024 * 1024) throw new HttpError(413, "Ukuran MP3 maksimal 25 MB.");
    directory = "audio";
    extension = "mp3";
  } else {
    throw new HttpError(400, "Jenis upload harus photo atau audio.");
  }

  const key = `snoopy/${projectId}/${directory}/${crypto.randomUUID()}-${safeFileName(file.name.replace(/\.[^.]+$/, ""))}.${extension}`;
  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || (kind === "audio" ? "audio/mpeg" : `image/${extension}`) },
    customMetadata: { projectId, kind, uploadedAt: new Date().toISOString() }
  });
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
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;
  const listed = await env.GIFT_KV.list({ prefix: `${WISH_PREFIX}${projectId}:`, limit });
  const wishes = (await Promise.all(listed.keys.map(key => env.GIFT_KV.get(key.name, "json")))).filter(Boolean);
  wishes.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  return json(request, env, { wishes, cursor: listed.list_complete ? null : listed.cursor }, 200, { "Cache-Control": "no-store" });
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
  if (request.method === "POST" && path === "/api/internal/projects") return handleCreateProject(request, env);
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
