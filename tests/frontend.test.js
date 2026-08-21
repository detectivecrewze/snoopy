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
  assert.match(studioApp, /openPhotoCropper/);
  assert.match(api, /timeoutMs: 60000/);
  assert.match(api, /Upload terlalu lama dan dihentikan/);
  assert.match(api, /getHealth\(\)/);
});

test("gift production shell no longer loads customer config.js", () => {
  const gift = read("gift/index.html");
  assert.doesNotMatch(gift, /src=["']\/?config\.js|window\.GIFT_CONFIG/);
  assert.match(gift, /\/shared\/project\.js/);
  assert.match(gift, /\/runtime-config\.js/);
  assert.doesNotMatch(gift, /gif-slot--memory-room/);
  assert.doesNotMatch(gift, /assets\/photos\/peony|wish-peony/);
  assert.match(gift, /wish-gif-frame/);
  assert.doesNotMatch(gift, /id="letter-date"|class="letter-date"/);
  assert.doesNotMatch(read("app.js"), /#letter-date/);
});

test("root landing page is isolated from gift runtime and links to the main store", () => {
  const landing = read("index.html");
  const landingStyles = read("landing/styles.css");
  const server = read("server.js");
  assert.match(landing, /Kado kecil,/);
  assert.match(landing, /Lihat Pilihan Gift/);
  assert.match(landing, /href="https:\/\/for-you-always\.my\.id\/"/);
  assert.match(landing, /\/assets\/gifs\/welcome\.webp/);
  assert.match(landing, /\/assets\/themes\/dubu-duu\/welcome\.webp/);
  assert.doesNotMatch(landing, /app\.js|shared\/api\.js|runtime-config\.js|gift-api-base|audio/);
  assert.doesNotMatch(landing, /Kado tidak ditemukan/);
  assert.match(landingStyles, /@media \(max-width: 430px\)/);
  assert.match(landingStyles, /prefers-reduced-motion/);
  assert.match(server, /pathname === "\/"\) requested = "index\.html"/);
  assert.match(server, /requested = "gift\/index\.html"/);
});

test("Studio and shared renderer expose the Snoopy and Dubu & Dudu theme system", () => {
  const studio = read("studio/index.html");
  const studioApp = read("studio/app.js");
  const giftApp = read("app.js");
  const project = read("shared/project.js");
  assert.equal((studio.match(/name="themeId"/g) || []).length, 2);
  assert.match(studio, /value="snoopy"/);
  assert.match(studio, /value="dubu-duu"/);
  assert.match(studioApp, /themeId:/);
  assert.match(studioApp, /hasUnpublishedChanges/);
  assert.match(studioApp, /workerSupportsThemes/);
  assert.match(studioApp, /saveQueue/);
  assert.match(studioApp, /isPublishing/);
  assert.match(studio, /id="backend-theme-warning"/);
  assert.match(studio, /id="publish-sync-note"/);
  assert.match(giftApp, /Project\.getTheme\(config\.themeId\)/);
  assert.match(giftApp, /dataset\.assetState = source \? "loading" : "placeholder"/);
  assert.doesNotMatch(giftApp, /THEME_GIFS/);
  assert.match(project, /const SCHEMA_VERSION = 3/);
  assert.match(project, /"dubu-duu"/);
  assert.match(read("studio/styles.css"), /#publish-button\.is-live:disabled/);
  assert.match(read("styles.css"), /body\[data-theme="dubu-duu"\] \.gif-slot--home-sticker/);
  assert.equal((read("styles.css").match(/body\[data-theme="snoopy"\] \.gift-card \[data-gif=/g) || []).length >= 8, true);
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
  assert.match(studioApp, /drawStandardQr/);
  assert.match(studioApp, /drawQrGiftCard/);
  assert.doesNotMatch(studioApp, /drawHeartQr/);
  assert.match(studioApp, /canvas\.width = 1080/);
  assert.match(studioApp, /canvas\.height = 1350/);
  assert.match(studioApp, /birthday-card-\$\{projectId\}\.png/);
  assert.match(studioApp, /snoopy-barcode-1\.png/);
  assert.match(studioApp, /snoopy-barcode-2\.png/);
  assert.match(studioApp, /dubu-1\.jpg/);
  assert.match(studioApp, /dubu-2\.png/);
  assert.match(studioApp, /dubu-3\.png/);
  assert.doesNotMatch(studioApp, /assets\/themes\/dubu-duu\/welcome\.webp/);
  assert.match(studioApp, /addPngDpiMetadata\(sourceBlob, 300\)/);
  assert.match(studio, /\/assets\/vendor\/qrcodejs\/qrcode\.min\.js/);
  assert.doesNotMatch(studio, /cdnjs\.cloudflare\.com\/ajax\/libs\/qrcodejs/);
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
  assert.doesNotMatch(read("gift/index.html"), /gift-track-cover/);
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
  assert.match(adminApp, /\/gift\/index\.html/);
  assert.match(adminApp, /params\.set\("project"/);
  assert.match(admin, /class="theme-pill"/);
  assert.match(adminApp, /const Project = window\.GiftProject/);
  assert.match(adminApp, /Project\.normalizeThemeId/);
  assert.match(adminApp, /crypto\?\.randomUUID\?\.\(\) \|\| Project\.makeId/);
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
    { source: "/gift/:id", destination: "/gift" },
    { source: "/studio/:id", destination: "/studio" }
  ]);
  assert.match(build, /"gift"/);
  assert.match(build, /"landing"/);
  assert.match(build, /assets\/gifs/);
  assert.match(build, /assets\/data/);
  assert.match(build, /assets\/photos/);
  assert.match(build, /assets\/themes/);
  assert.match(build, /assets\/vendor/);
  assert.doesNotMatch(build, /worker|tests|fixtures|server\.js|assets\/audio/);
});

test("Studio uses local cropper, CSS playback icons, and a Safari-safe date shell", () => {
  const studio = read("studio/index.html");
  const studioApp = read("studio/app.js");
  const studioStyles = read("studio/styles.css");
  const gift = read("gift/index.html");
  const giftApp = read("app.js");
  const giftStyles = read("styles.css");
  assert.ok(fs.existsSync(path.join(root, "assets/vendor/cropperjs/cropper.min.js")));
  assert.ok(fs.existsSync(path.join(root, "assets/vendor/cropperjs/LICENSE")));
  assert.match(studio, /assets\/vendor\/cropperjs\/cropper\.min\.js/);
  assert.match(studio, /id="photo-crop-dialog"/);
  assert.match(studio, /id="add-photo-floating"/);
  assert.match(studio, /class="date-input-shell"/);
  assert.match(studioApp, /selection\.aspectRatio = 4 \/ 3/);
  assert.match(studioApp, /applyDefaultCropZoom/);
  assert.match(studioApp, /coverScale/);
  assert.match(studioApp, /addGalleryItem/);
  assert.match(studioApp, /selection\.\$toCanvas/);
  assert.match(studioApp, /selectedSourceWidth/);
  assert.match(studioApp, /Math\.min\(1600/);
  assert.match(studioApp, /Math\.min\(1200/);
  assert.match(studioApp, /canvas\.toBlob\(resolve, "image\/webp", \.86\)/);
  assert.match(studioStyles, /\.date-input-shell \{[^}]*overflow:hidden/);
  assert.match(studioStyles, /::-webkit-date-and-time-value/);
  assert.match(studioStyles, /\.media-icon::before/);
  assert.match(giftStyles, /\.play-button\.is-playing \.media-icon/);
  assert.match(gift, /class="media-icon"/);
  assert.match(studio, /Dubu &amp; Dudu/);
  assert.match(read("shared/project.js"), /label: "Dubu & Dudu"/);
  assert.match(read("shared/project.js"), /"dubu-duu"/);
  for (const source of [studio, studioApp, gift, giftApp]) assert.doesNotMatch(source, /▶|Ⅱ|⏸/);
});

test("Studio includes photo navigator controls for reordering and setting cover photo", () => {
  const studio = read("studio/index.html");
  const studioApp = read("studio/app.js");
  const studioStyles = read("studio/styles.css");
  assert.match(studio, /class="gallery-nav-controls"/);
  assert.match(studio, /class="gallery-nav-btn make-first-btn"/);
  assert.match(studio, /class="gallery-nav-btn move-up-btn"/);
  assert.match(studio, /class="gallery-nav-btn move-down-btn"/);
  assert.match(studio, /class="first-photo-badge"/);
  assert.match(studioApp, /moveGalleryItem/);
  assert.match(studioApp, /makeFirstGalleryItem/);
  assert.match(studioApp, /syncGalleryInputsFromDom/);
  assert.match(studioStyles, /\.gallery-nav-controls/);
  assert.match(studioStyles, /\.first-photo-badge/);
});
