"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Project = require("../shared/project");

test("normalizes project payload and removes unsupported gallery fields", () => {
  const project = Project.normalizeProject({
    projectId: "cindy-demo",
    status: "published",
    identity: { recipient: " Cindy ", sender: " Rapi ", birthdayDate: "2026-08-20" },
    gallery: [{ image: "/photo.png", title: " Portrait ", caption: " Story " }],
    music: { audioFile: "/song.mp3" },
    letter: { body: "First paragraph.\n\nSecond paragraph." }
  });

  assert.equal(project.schemaVersion, 1);
  assert.equal(project.identity.recipient, "Cindy");
  assert.deepEqual(project.gallery[0], { id: "photo-1", imageUrl: "/photo.png", title: "Portrait", story: "Story" });
  assert.equal(project.music.audioUrl, "/song.mp3");
  assert.deepEqual(project.letter.paragraphs, ["First paragraph.", "Second paragraph."]);
  assert.equal(Object.hasOwn(project, "gifs"), false);
});

test("publish validation requires all customer-facing content", () => {
  const result = Project.validateProject(Project.emptyProject("valid-project"), { forPublish: true });
  assert.equal(result.valid, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["birthdayDate", "gallery", "greeting", "letter", "music", "musicTitle", "recipient", "sender", "signoff", "warmWish"].sort());
});

test("draft normalization does not block partial autosaves", () => {
  const result = Project.validateProject(Project.emptyProject("valid-project"));
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test("reads project id from gift and studio deep links", () => {
  assert.equal(Project.projectIdFromPath("/gift/cindy-demo"), "cindy-demo");
  assert.equal(Project.projectIdFromPath("/studio/ORDER-123"), "order-123");
  assert.equal(Project.projectIdFromPath("/studio/index.html", "?project=GIFT-LOCAL-123"), "gift-local-123");
  assert.equal(Project.projectIdFromPath("/index.html", "?project=GIFT-LOCAL-456"), "gift-local-456");
  assert.equal(Project.projectIdFromPath("/admin"), "");
});
