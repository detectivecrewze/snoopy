"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("studio exposes seven wizard steps and dynamic runtime configuration", () => {
  const studio = read("studio/index.html");
  const studioApp = read("studio/app.js");
  const api = read("shared/api.js");
  assert.equal((studio.match(/class="wizard-step/g) || []).length, 7);
  assert.match(studio, /\/runtime-config\.js/);
  assert.match(studio, /id="gift-preview"/);
  assert.match(studio, /id="qr-code"/);
  assert.match(studioApp, /\/index\.html\?\$\{params\}/);
  assert.match(studioApp, /Membaca foto/);
  assert.match(api, /timeoutMs: 60000/);
  assert.match(api, /Upload terlalu lama dan dihentikan/);
});

test("gift production shell no longer loads customer config.js", () => {
  const gift = read("index.html");
  assert.doesNotMatch(gift, /src=["']\/?config\.js|window\.GIFT_CONFIG/);
  assert.match(gift, /\/shared\/project\.js/);
  assert.match(gift, /\/runtime-config\.js/);
  assert.doesNotMatch(gift, /gif-slot--memory-room/);
});

test("music catalog supports covers, selection, and audio preview", () => {
  const catalog = JSON.parse(read("assets/data/music.json"));
  const studio = read("studio/index.html");
  const studioApp = read("studio/app.js");
  const sharedProject = read("shared/project.js");
  const workerProject = read("worker/src/project.js");
  assert.ok(Array.isArray(catalog) && catalog.length > 1);
  assert.ok(catalog.every(track => track.audioUrl || track.url));
  assert.match(studio, /id="music-catalog-grid"/);
  assert.match(studio, /id="studio-track-cover"/);
  assert.match(studio, /id="studio-seek"/);
  assert.match(studio, /id="studio-playlist"/);
  assert.equal((studio.match(/data-warm-preset=/g) || []).length, 3);
  assert.equal((studio.match(/data-letter-preset=/g) || []).length, 3);
  assert.equal((studio.match(/data-qr-palette=/g) || []).length, 4);
  assert.match(studio, /video\/mp4/);
  assert.match(studio, /muted autoplay loop playsinline/);
  assert.match(studioApp, /track\.audioUrl \|\| track\.url/);
  assert.match(studioApp, /previewCatalogTrack/);
  assert.match(studioApp, /selectCatalogTrack/);
  assert.match(studioApp, /MAX_MUSIC_TRACKS/);
  assert.match(studioApp, /drawHeartQr/);
  assert.match(studioApp, /20 \* 1024 \* 1024/);
  assert.match(studioApp, /currentGalleryItem\(itemId\)/);
  assert.doesNotMatch(studioApp, /uploadGalleryMedia\(event\.target\.files\[0\], item, node\)/);
  assert.match(studio, /id="gallery-room-title"/);
  assert.match(studio, /id="delete-media-dialog"/);
  assert.match(studio, /id="confirm-delete-media"/);
  assert.match(studioApp, /requestDeleteGalleryItem/);
  assert.match(studioApp, /confirmDeleteGalleryItem/);
  assert.match(sharedProject, /coverUrl/);
  assert.match(workerProject, /coverUrl/);
  assert.doesNotMatch(read("index.html"), /gift-track-cover/);
  assert.doesNotMatch(read("app.js"), /gift-track-cover/);
});

test("admin dashboard includes secure login, generator, filters, and destructive confirmation", () => {
  const admin = read("admin/index.html");
  const adminApp = read("admin/app.js");
  assert.match(admin, /type="password"/);
  assert.match(admin, /id="generate-project"/);
  assert.match(admin, /id="status-filter"/);
  assert.match(admin, /id="delete-confirmation"/);
  assert.doesNotMatch(admin, /create-recipient|create-sender|create-birthday/);
  assert.doesNotMatch(admin, /Admin sedang disiapkan/);
  assert.match(adminApp, /DEV_HOSTS/);
  assert.match(adminApp, /\/studio\/index\.html/);
  assert.match(adminApp, /params\.set\("project"/);
});

test("runtime config does not contain a secret", () => {
  const runtime = read("runtime-config.js");
  assert.doesNotMatch(runtime, /ADMIN_SECRET|PROJECT_SIGNING_SECRET|INTERNAL_GENERATOR_SECRET|Bearer\s+[A-Za-z0-9]/);
});

test("Vercel is forced to deploy the allowlisted static dist output", () => {
  const config = JSON.parse(read("vercel.json"));
  const build = read("build.mjs");
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, "npm run build");
  assert.equal(config.outputDirectory, "dist");
  assert.deepEqual(config.rewrites, [
    { source: "/gift/:id", destination: "/" },
    { source: "/studio/:id", destination: "/studio" }
  ]);
  assert.match(build, /assets\/gifs/);
  assert.match(build, /assets\/data/);
  assert.doesNotMatch(build, /worker|tests|fixtures|server\.js|assets\/photos|assets\/audio/);
});
