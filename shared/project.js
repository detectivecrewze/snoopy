(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GiftProject = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 2;
  const MAX_GALLERY_ITEMS = 6;
  const MAX_MUSIC_TRACKS = 3;
  const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

  const THEME_GIFS = Object.freeze({
    welcome: "/assets/gifs/welcome.webp",
    wishWriting: "/assets/gifs/wish-writing-top.webp",
    wish: "/assets/gifs/wish-new.webp",
    hug: "/assets/gifs/hug.webp",
    dance: "/assets/gifs/dance.webp",
    cozy: "/assets/gifs/cozy.webp",
    memoriesLogo: "/assets/gifs/memories-logo.webp",
    letterLogo: "/assets/gifs/letter-logo.gif",
    letter: "/assets/gifs/letter.webp",
    finale: "/assets/gifs/finale.webp"
  });

  function text(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
  }

  function makeId(prefix = "item") {
    const random = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function emptyProject(projectId = "new-gift") {
    return {
      schemaVersion: SCHEMA_VERSION,
      projectId,
      status: "draft",
      identity: {
        recipient: "",
        sender: "",
        birthdayDate: "",
        subtitle: "Empat kejutan kecil yang dibuat khusus untukmu."
      },
      warmWish: { message: "", signature: "" },
      gallery: [{ id: makeId("media"), mediaType: "image", mediaUrl: "", imageUrl: "", title: "", story: "" }],
      music: { tracks: [], sourceType: "catalog", catalogId: "", audioUrl: "", coverUrl: "", title: "", artist: "" },
      letter: { greeting: "", paragraphs: [], signoff: "" },
      settings: { wishEnabled: true },
      createdAt: "",
      updatedAt: "",
      publishedAt: null
    };
  }

  function normalizeProject(input, projectId) {
    const source = input && typeof input === "object" ? input : {};
    const fallback = emptyProject(projectId || text(source.projectId, "new-gift"));
    const identity = source.identity && typeof source.identity === "object" ? source.identity : {};
    const warmWish = source.warmWish && typeof source.warmWish === "object" ? source.warmWish : {};
    const music = source.music && typeof source.music === "object" ? source.music : {};
    const letter = source.letter && typeof source.letter === "object" ? source.letter : {};
    const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
    const gallerySource = Array.isArray(source.gallery) ? source.gallery.slice(0, MAX_GALLERY_ITEMS) : [];
    const gallery = gallerySource.map((item, index) => {
      const mediaType = item && item.mediaType === "video" ? "video" : "image";
      const mediaUrl = text(item && (item.mediaUrl || item.videoUrl || item.imageUrl || item.image), "");
      return {
        id: text(item && item.id, `media-${index + 1}`),
        mediaType,
        mediaUrl,
        imageUrl: mediaType === "image" ? mediaUrl : "",
        title: text(item && item.title, ""),
        story: text(item && (item.story || item.caption), "")
      };
    });
    const legacyTrack = music.audioUrl || music.audioFile || music.title ? [music] : [];
    const musicSource = Array.isArray(music.tracks) ? music.tracks : legacyTrack;
    const tracks = musicSource.slice(0, MAX_MUSIC_TRACKS).map((track, index) => ({
      id: text(track && track.id, `track-${index + 1}`),
      sourceType: track && track.sourceType === "upload" ? "upload" : "catalog",
      catalogId: text(track && track.catalogId, ""),
      audioUrl: text(track && (track.audioUrl || track.audioFile), ""),
      coverUrl: text(track && (track.coverUrl || track.cover), ""),
      title: text(track && track.title, ""),
      artist: text(track && track.artist, "")
    })).filter(track => track.audioUrl || track.title);
    const primaryTrack = tracks[0] || { sourceType: "catalog", catalogId: "", audioUrl: "", coverUrl: "", title: "", artist: "" };

    return {
      schemaVersion: SCHEMA_VERSION,
      projectId: text(projectId || source.projectId, fallback.projectId).toLowerCase(),
      status: source.status === "published" ? "published" : "draft",
      identity: {
        recipient: text(identity.recipient, ""),
        sender: text(identity.sender, ""),
        birthdayDate: text(identity.birthdayDate, ""),
        subtitle: text(identity.subtitle, fallback.identity.subtitle)
      },
      warmWish: {
        message: text(warmWish.message, ""),
        signature: text(warmWish.signature, "")
      },
      gallery: gallery.length ? gallery : fallback.gallery,
      music: {
        tracks,
        ...primaryTrack
      },
      letter: {
        greeting: text(letter.greeting, ""),
        paragraphs: Array.isArray(letter.paragraphs)
          ? letter.paragraphs.map(item => text(item)).filter(Boolean)
          : text(letter.body).split(/\n\s*\n/).map(item => item.trim()).filter(Boolean),
        signoff: text(letter.signoff, "")
      },
      settings: { wishEnabled: settings.wishEnabled !== false },
      createdAt: text(source.createdAt, ""),
      updatedAt: text(source.updatedAt, ""),
      publishedAt: source.publishedAt || null
    };
  }

  function validateProject(project, options = {}) {
    const normalized = normalizeProject(project, project && project.projectId);
    const errors = {};
    const add = (field, message) => { errors[field] = message; };

    if (!PROJECT_ID_PATTERN.test(normalized.projectId)) add("projectId", "Project ID tidak valid.");
    if (normalized.identity.recipient.length < 2) add("recipient", "Nama penerima wajib diisi.");
    if (normalized.identity.sender.length < 2) add("sender", "Nama pengirim wajib diisi.");
    if (!normalized.identity.birthdayDate) add("birthdayDate", "Tanggal ulang tahun wajib diisi.");
    if (normalized.warmWish.message.length < 3) add("warmWish", "Ucapan singkat wajib diisi.");
    if (!normalized.gallery.length || !normalized.gallery[0].mediaUrl) add("gallery", "Tambahkan setidaknya satu foto atau video.");
    if (!normalized.music.tracks.length) add("music", "Pilih atau unggah setidaknya satu lagu.");
    if (normalized.music.tracks.some(track => !track.audioUrl || !track.title)) add("musicTitle", "Setiap lagu wajib memiliki file dan judul.");
    if (!normalized.letter.greeting) add("greeting", "Greeting surat wajib diisi.");
    if (!normalized.letter.paragraphs.length) add("letter", "Isi surat wajib diisi.");
    if (!normalized.letter.signoff) add("signoff", "Signoff surat wajib diisi.");

    if (!options.forPublish) {
      return { valid: true, errors: {}, project: normalized };
    }
    return { valid: Object.keys(errors).length === 0, errors, project: normalized };
  }

  function formatBirthdayDate(value, locale = "id-ID") {
    if (!value) return "Hari spesialmu";
    const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!isoMatch) return value;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
  }

  function projectIdFromPath(pathname, search = "") {
    try {
      const queryProject = text(new URLSearchParams(String(search || "")).get("project"), "");
      if (queryProject) return queryProject.toLowerCase();
    } catch {
      // Continue with the clean production path.
    }
    const match = String(pathname || "").match(/^\/(?:gift|studio)\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]).toLowerCase() : "";
  }

  return {
    SCHEMA_VERSION,
    MAX_GALLERY_ITEMS,
    MAX_MUSIC_TRACKS,
    PROJECT_ID_PATTERN,
    THEME_GIFS,
    emptyProject,
    normalizeProject,
    validateProject,
    formatBirthdayDate,
    projectIdFromPath,
    makeId
  };
});
