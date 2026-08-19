"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("studio exposes seven wizard steps and dynamic runtime configuration", () => {
  const studio = read("studio/index.html");
  assert.equal((studio.match(/class="wizard-step/g) || []).length, 7);
  assert.match(studio, /\/runtime-config\.js/);
  assert.match(studio, /id="gift-preview"/);
  assert.match(studio, /id="qr-code"/);
});

test("gift production shell no longer loads customer config.js", () => {
  const gift = read("index.html");
  assert.doesNotMatch(gift, /src=["']\/?config\.js|window\.GIFT_CONFIG/);
  assert.match(gift, /\/shared\/project\.js/);
  assert.match(gift, /\/runtime-config\.js/);
});

test("admin dashboard includes secure login, generator, filters, and destructive confirmation", () => {
  const admin = read("admin/index.html");
  assert.match(admin, /type="password"/);
  assert.match(admin, /id="open-create-modal"/);
  assert.match(admin, /id="status-filter"/);
  assert.match(admin, /id="delete-confirmation"/);
  assert.doesNotMatch(admin, /Admin sedang disiapkan/);
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
  assert.match(build, /assets\/gifs/);
  assert.match(build, /assets\/data/);
  assert.doesNotMatch(build, /worker|tests|fixtures|server\.js|assets\/photos|assets\/audio/);
});
