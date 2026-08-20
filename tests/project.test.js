"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Project = require("../shared/project");

test("normalizes project payload and removes unsupported gallery fields", () => {
  const project = Project.normalizeProject({
    projectId: "sample-demo",
    status: "published",
    identity: { recipient: " Penerima ", sender: " Pengirim ", birthdayDate: "2030-01-01" },
    gallery: [{ image: "/photo.png", title: " Portrait ", caption: " Story " }],
    music: { audioFile: "/song.mp3" },
    letter: { body: "First paragraph.\n\nSecond paragraph." }
  });

  assert.equal(project.schemaVersion, 3);
  assert.equal(project.themeId, "snoopy");
  assert.equal(project.identity.recipient, "Penerima");
  assert.deepEqual(project.gallery[0], { id: "media-1", mediaType: "image", mediaUrl: "/photo.png", imageUrl: "/photo.png", title: "Portrait", story: "Story" });
  assert.equal(project.music.audioUrl, "/song.mp3");
  assert.equal(project.music.tracks.length, 1);
  assert.deepEqual(project.letter.paragraphs, ["First paragraph.", "Second paragraph."]);
  assert.equal(Object.hasOwn(project, "gifs"), false);
});

test("publish validation requires all customer-facing content", () => {
  const result = Project.validateProject(Project.emptyProject("valid-project"), { forPublish: true });
  assert.equal(result.valid, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["birthdayDate", "gallery", "greeting", "letter", "music", "recipient", "sender", "signoff", "warmWish"].sort());
});

test("draft normalization does not block partial autosaves", () => {
  const result = Project.validateProject(Project.emptyProject("valid-project"));
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test("music schema migrates legacy songs and caps playlists at three tracks", () => {
  const legacy = Project.normalizeProject({ projectId: "legacy-demo", music: { audioUrl: "/legacy.mp3", title: "Legacy" } });
  assert.equal(legacy.music.tracks.length, 1);
  assert.equal(legacy.music.tracks[0].title, "Legacy");

  const playlist = Project.normalizeProject({
    projectId: "playlist-demo",
    music: { tracks: [1, 2, 3, 4].map(number => ({ id: `track-${number}`, audioUrl: `/song-${number}.mp3`, title: `Song ${number}` })) }
  });
  assert.equal(playlist.music.tracks.length, Project.MAX_MUSIC_TRACKS);
  assert.equal(playlist.music.tracks[2].title, "Song 3");
});

test("gallery schema supports muted autoplay video media", () => {
  const project = Project.normalizeProject({
    projectId: "video-demo",
    gallery: [{ id: "video-1", mediaType: "video", mediaUrl: "https://media.example/moment.mp4", title: "A short moment" }]
  });
  assert.equal(project.gallery[0].mediaType, "video");
  assert.equal(project.gallery[0].mediaUrl, "https://media.example/moment.mp4");
  assert.equal(project.gallery[0].imageUrl, "");
});

test("gallery supports up to fifteen photo or video items", () => {
  const project = Project.normalizeProject({
    projectId: "gallery-limit-demo",
    gallery: Array.from({ length: 18 }, (_, index) => ({
      id: `media-${index + 1}`,
      mediaType: index % 2 ? "video" : "image",
      mediaUrl: `https://media.example/item-${index + 1}.${index % 2 ? "mp4" : "webp"}`
    }))
  });
  assert.equal(Project.MAX_GALLERY_ITEMS, 15);
  assert.equal(project.gallery.length, 15);
});

test("gallery room title and subtitle are customer-editable project data", () => {
  const project = Project.normalizeProject({
    projectId: "custom-gallery-room",
    galleryRoom: { title: "My Portraits", subtitle: "A collection of my favorite photos." }
  });
  assert.equal(project.galleryRoom.title, "My Portraits");
  assert.equal(project.galleryRoom.subtitle, "A collection of my favorite photos.");
});

test("schema v2 and unknown themes safely normalize to Snoopy", () => {
  const legacy = Project.normalizeProject({ schemaVersion: 2, projectId: "legacy-theme" });
  const unknown = Project.normalizeProject({ schemaVersion: 3, projectId: "unknown-theme", themeId: "other" });
  assert.equal(legacy.schemaVersion, 3);
  assert.equal(legacy.themeId, "snoopy");
  assert.equal(unknown.themeId, "snoopy");
});

test("Dubu and Dudu changes presentation without changing customer content", () => {
  const input = {
    projectId: "dubu-demo",
    themeId: "dubu-duu",
    identity: { recipient: "Rani", sender: "Dio", birthdayDate: "2030-01-01" },
    gallery: [{ mediaUrl: "https://media.example/photo.webp", title: "Portrait" }],
    music: { tracks: [{ audioUrl: "https://media.example/song.mp3", title: "Song" }] },
    letter: { greeting: "Dear Rani", paragraphs: ["Happy birthday"], signoff: "Dio" }
  };
  const project = Project.normalizeProject(input);
  assert.equal(project.themeId, "dubu-duu");
  assert.equal(project.identity.recipient, "Rani");
  assert.equal(project.gallery[0].title, "Portrait");
  assert.equal(project.music.tracks[0].title, "Song");
  assert.equal(project.letter.paragraphs[0], "Happy birthday");
});

test("theme manifest has ten isolated asset slots per theme", () => {
  const expectedSlots = ["welcome", "wishWriting", "wish", "hug", "cozy", "memoriesLogo", "dance", "letterLogo", "letter", "finale"].sort();
  assert.deepEqual(Object.keys(Project.THEMES.snoopy.gifs).sort(), expectedSlots);
  assert.deepEqual(Object.keys(Project.THEMES["dubu-duu"].gifs).sort(), expectedSlots);
  assert.ok(Object.values(Project.THEMES.snoopy.gifs).every(source => source.startsWith("/assets/gifs/")));
  assert.ok(Object.values(Project.THEMES["dubu-duu"].gifs).every(source => source.startsWith("/assets/themes/dubu-duu/")));
  assert.equal(new Set(Object.values(Project.THEMES["dubu-duu"].gifs)).size, 8);
  assert.equal(Project.getTheme("dubu-duu").palette.red, "#e8897d");
});

test("Dubu music and letter-card icons use their dedicated assets", () => {
  const theme = GiftProject.THEMES["dubu-duu"];
  assert.equal(theme.gifs.wish, "/assets/themes/dubu-duu/wish-success.webp");
  assert.equal(theme.gifs.dance, "/assets/themes/dubu-duu/dance.webp");
  assert.equal(theme.gifs.letterLogo, "/assets/themes/dubu-duu/letter-logo.gif");
  assert.equal(theme.gifs.letter, "/assets/themes/dubu-duu/together.webp");
});

test("reads project id from gift and studio deep links", () => {
  assert.equal(Project.projectIdFromPath("/gift/sample-demo"), "sample-demo");
  assert.equal(Project.projectIdFromPath("/studio/ORDER-123"), "order-123");
  assert.equal(Project.projectIdFromPath("/studio/index.html", "?project=GIFT-LOCAL-123"), "gift-local-123");
  assert.equal(Project.projectIdFromPath("/gift/index.html", "?project=GIFT-LOCAL-456"), "gift-local-456");
  assert.equal(Project.projectIdFromPath("/index.html", "?project=GIFT-LOCAL-456"), "gift-local-456");
  assert.equal(Project.projectIdFromPath("/admin"), "");
});
