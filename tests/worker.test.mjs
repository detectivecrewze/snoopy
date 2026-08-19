import test from "node:test";
import assert from "node:assert/strict";
import { File } from "node:buffer";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.File) globalThis.File = File;
if (!globalThis.btoa) globalThis.btoa = value => Buffer.from(value, "binary").toString("base64");

const { default: worker } = await import("../worker/src/index.js");

class MockKV {
  constructor() { this.values = new Map(); }
  async get(key, type) {
    if (!this.values.has(key)) return null;
    const value = this.values.get(key);
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, String(value)); }
  async delete(key) { this.values.delete(key); }
  async list({ prefix = "", limit = 1000, cursor } = {}) {
    const keys = [...this.values.keys()].filter(key => key.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + limit);
    const next = start + page.length;
    return {
      keys: page.map(name => ({ name })),
      list_complete: next >= keys.length,
      cursor: next >= keys.length ? undefined : String(next)
    };
  }
}

class MockR2 {
  constructor() { this.values = new Map(); }
  async put(key, value, options) {
    const data = value instanceof ReadableStream ? await new Response(value).arrayBuffer() : value;
    this.values.set(key, { data, options });
  }
  async list({ prefix = "", limit = 1000, cursor } = {}) {
    const keys = [...this.values.keys()].filter(key => key.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + limit);
    const next = start + page.length;
    return {
      objects: page.map(key => ({ key })),
      truncated: next < keys.length,
      cursor: next < keys.length ? String(next) : undefined
    };
  }
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key);
  }
}

function makeEnv() {
  return {
    GIFT_KV: new MockKV(),
    MEDIA_BUCKET: new MockR2(),
    ALLOWED_ORIGINS: "https://gift.test",
    PUBLIC_GIFT_BASE_URL: "https://gift.test",
    PUBLIC_STUDIO_BASE_URL: "https://gift.test",
    MEDIA_BASE_URL: "https://media.test",
    PROJECT_SIGNING_SECRET: "project-signing-secret-that-is-long-and-stable",
    ADMIN_SECRET: "admin-secret",
    INTERNAL_GENERATOR_SECRET: "internal-secret"
  };
}

async function call(env, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.origin !== false) headers.set("Origin", options.origin || "https://gift.test");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  const response = await worker.fetch(new Request(`https://api.test${path}`, { method: options.method || "GET", headers, body }), env);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function tokenFromStudioUrl(url) {
  return new URLSearchParams(new URL(url).hash.slice(1)).get("token");
}

function completeProject(project) {
  return {
    ...project,
    identity: { recipient: "Penerima", sender: "Pengirim", birthdayDate: "2030-01-01", subtitle: "Empat kejutan untukmu." },
    warmWish: { message: "Semoga selalu bahagia dan sehat.", signature: "Pengirim" },
    gallery: [{ id: "photo-1", imageUrl: "https://media.test/photo.webp", title: "Birthday star", story: "A little portrait." }],
    music: { tracks: [
      { id: "track-1", sourceType: "catalog", catalogId: "song-1", audioUrl: "https://media.test/song-1.mp3", coverUrl: "https://media.test/cover-1.jpg", title: "First Song", artist: "Artist One" },
      { id: "track-2", sourceType: "catalog", catalogId: "song-2", audioUrl: "https://media.test/song-2.mp3", coverUrl: "https://media.test/cover-2.jpg", title: "Second Song", artist: "Artist Two" }
    ] },
    letter: { greeting: "Untuk kamu yang berulang tahun,", paragraphs: ["Selamat ulang tahun."], signoff: "Dengan kasih,\nPengirim" },
    settings: { wishEnabled: true }
  };
}

test("admin and internal project creation are idempotent", async () => {
  const env = makeEnv();
  const first = await call(env, "/api/admin/projects", { method: "POST", token: env.ADMIN_SECRET, body: { idempotencyKey: "manual-001" } });
  const second = await call(env, "/api/admin/projects", { method: "POST", token: env.ADMIN_SECRET, body: { idempotencyKey: "manual-001" } });
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 200);
  assert.equal(first.payload.projectId, second.payload.projectId);
  assert.equal(first.payload.studioUrl, second.payload.studioUrl);

  const internalOne = await call(env, "/api/internal/projects", { method: "POST", token: env.INTERNAL_GENERATOR_SECRET, body: { source: "pakasir", idempotencyKey: "invoice-001" } });
  const internalTwo = await call(env, "/api/internal/projects", { method: "POST", token: env.INTERNAL_GENERATOR_SECRET, body: { source: "pakasir", idempotencyKey: "invoice-001" } });
  assert.equal(internalOne.payload.projectId, internalTwo.payload.projectId);
});

test("complete buyer and recipient flow uses KV and keeps private fields private", async () => {
  const env = makeEnv();
  const created = await call(env, "/api/admin/projects", { method: "POST", token: env.ADMIN_SECRET, body: { idempotencyKey: "full-flow-001" } });
  const projectId = created.payload.projectId;
  const editToken = tokenFromStudioUrl(created.payload.studioUrl);

  const draftPublic = await call(env, `/api/gift/${projectId}`);
  assert.equal(draftPublic.response.status, 404);
  const wrongStudio = await call(env, `/api/studio/${projectId}`, { token: "wrong-token" });
  assert.equal(wrongStudio.response.status, 403);

  const studio = await call(env, `/api/studio/${projectId}`, { token: editToken });
  assert.equal(studio.response.status, 200);
  const incompletePublish = await call(env, `/api/studio/${projectId}`, { method: "PUT", token: editToken, body: { project: studio.payload.project, status: "published" } });
  assert.equal(incompletePublish.response.status, 422);

  const photoForm = new FormData();
  photoForm.append("projectId", projectId);
  photoForm.append("kind", "photo");
  photoForm.append("file", new File([new Uint8Array([1, 2, 3])], "portrait.webp", { type: "image/webp" }));
  const upload = await call(env, "/api/upload", { method: "POST", token: editToken, body: photoForm });
  assert.equal(upload.response.status, 201);
  assert.match(upload.payload.url, new RegExp(`^https://media\\.test/snoopy/${projectId}/photos/`));

  const videoForm = new FormData();
  videoForm.append("projectId", projectId);
  videoForm.append("kind", "video");
  videoForm.append("file", new File([new Uint8Array([1, 2, 3])], "moment.mp4", { type: "video/mp4" }));
  const videoUpload = await call(env, "/api/upload", { method: "POST", token: editToken, body: videoForm });
  assert.equal(videoUpload.response.status, 201);
  assert.match(videoUpload.payload.url, new RegExp(`^https://media\\.test/snoopy/${projectId}/videos/`));

  const publish = await call(env, `/api/studio/${projectId}`, {
    method: "PUT",
    token: editToken,
    body: { project: completeProject(studio.payload.project), status: "published" }
  });
  assert.equal(publish.response.status, 200);
  assert.equal(publish.payload.project.status, "published");

  const publicGift = await call(env, `/api/gift/${projectId}`);
  assert.equal(publicGift.response.status, 200);
  assert.equal(publicGift.payload.project.identity.recipient, "Penerima");
  assert.equal(publicGift.payload.project.music.tracks.length, 2);
  assert.equal(publicGift.payload.project.music.tracks[1].title, "Second Song");
  assert.equal(Object.hasOwn(publicGift.payload.project, "auth"), false);
  assert.equal(Object.hasOwn(publicGift.payload, "wishes"), false);

  const shortWish = await call(env, "/api/wishes", { method: "POST", body: { projectId, wish: "a" } });
  assert.equal(shortWish.response.status, 400);
  const firstWish = await call(env, "/api/wishes", { method: "POST", body: { projectId, wish: "Semoga aku selalu bahagia." } });
  const secondWish = await call(env, "/api/wishes", { method: "POST", body: { projectId, wish: "Semoga semua impianku tercapai.\nAmin." } });
  assert.equal(firstWish.response.status, 201);
  assert.equal(secondWish.response.status, 201);

  const inbox = await call(env, `/api/wishes/${projectId}`, { token: editToken });
  assert.equal(inbox.response.status, 200);
  assert.equal(inbox.payload.wishes.length, 2);
  assert.match(inbox.payload.wishes.map(item => item.wish).join(" "), /impianku/);

  const adminList = await call(env, "/api/admin/projects", { token: env.ADMIN_SECRET });
  assert.equal(adminList.response.status, 200);
  assert.equal(adminList.payload.stats.published, 1);
  assert.equal(adminList.payload.projects[0].studioUrl, created.payload.studioUrl);
});

test("archive, restore, and permanent delete control public access and cleanup", async () => {
  const env = makeEnv();
  const created = await call(env, "/api/admin/projects", { method: "POST", token: env.ADMIN_SECRET, body: { idempotencyKey: "cleanup-001" } });
  const projectId = created.payload.projectId;
  const token = tokenFromStudioUrl(created.payload.studioUrl);
  const studio = await call(env, `/api/studio/${projectId}`, { token });
  await call(env, `/api/studio/${projectId}`, { method: "PUT", token, body: { project: completeProject(studio.payload.project), status: "published" } });
  await call(env, "/api/wishes", { method: "POST", body: { projectId, wish: "Wish yang akan dibersihkan." } });
  env.MEDIA_BUCKET.values.set(`snoopy/${projectId}/photos/manual.webp`, { data: new ArrayBuffer(0) });

  const archived = await call(env, `/api/admin/projects/${projectId}`, { method: "PATCH", token: env.ADMIN_SECRET, body: { action: "archive" } });
  assert.equal(archived.payload.project.status, "archived");
  assert.equal((await call(env, `/api/gift/${projectId}`)).response.status, 404);
  assert.equal((await call(env, `/api/studio/${projectId}`, { token })).response.status, 410);

  const restored = await call(env, `/api/admin/projects/${projectId}`, { method: "PATCH", token: env.ADMIN_SECRET, body: { action: "restore" } });
  assert.equal(restored.payload.project.status, "published");
  assert.equal((await call(env, `/api/gift/${projectId}`)).response.status, 200);

  const deleted = await call(env, `/api/admin/projects/${projectId}`, { method: "DELETE", token: env.ADMIN_SECRET });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.payload.removedWishes, 1);
  assert.equal(deleted.payload.removedMedia, 1);
  assert.equal((await call(env, `/api/gift/${projectId}`)).response.status, 404);
  assert.equal([...env.GIFT_KV.values.keys()].some(key => key.includes(projectId)), false);
  assert.equal([...env.MEDIA_BUCKET.values.keys()].some(key => key.includes(projectId)), false);
});

test("admin authentication and CORS reject unauthorized requests", async () => {
  const env = makeEnv();
  assert.equal((await call(env, "/api/admin/projects", { token: "wrong" })).response.status, 403);
  assert.equal((await call(env, "/api/admin/projects", { token: env.ADMIN_SECRET, origin: "https://evil.test" })).response.status, 403);
  const allowed = await call(env, "/api/health");
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.response.headers.get("Access-Control-Allow-Origin"), "https://gift.test");
});
