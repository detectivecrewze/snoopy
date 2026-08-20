(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GiftProject = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 3;
  const MAX_GALLERY_ITEMS = 15;
  const MAX_MUSIC_TRACKS = 3;
  const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
  const DEFAULT_THEME_ID = "snoopy";

  const THEMES = Object.freeze({
    snoopy: Object.freeze({
      id: "snoopy",
      label: "Snoopy",
      description: "Comic scrapbook yang cerah dan playful.",
      thumbnail: "/assets/gifs/cozy.webp",
      palette: Object.freeze({
        red: "#e94238", redDark: "#bd2923", yellow: "#f8d44c", blue: "#7db7df", blueDark: "#3a7ca9",
        cream: "#fff8df", paper: "#fffdf4", ink: "#171717", muted: "#6f695e", navy: "#112444", navyLight: "#213d68",
        cardWarm: "#ffed9b", cardCool: "#d7edff", cardPrimary: "#ffd4d0"
      }),
      gifs: Object.freeze({
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
      }),
      alt: Object.freeze({
        welcome: "Snoopy membawa kejutan ulang tahun",
        wishWriting: "Snoopy menemani menulis harapan",
        wish: "Snoopy merayakan harapan yang terkirim",
        hug: "Snoopy memberikan pelukan hangat",
        dance: "Snoopy menari mengikuti musik",
        cozy: "Snoopy dan Woodstock bersantai",
        memoriesLogo: "Snoopy menjelajahi kenangan",
        letterLogo: "Snoopy menulis surat",
        letter: "Snoopy menemani akhir surat",
        finale: "Snoopy merayakan ulang tahun"
      })
    }),
    "dubu-duu": Object.freeze({
      id: "dubu-duu",
      label: "Dubu & Duu",
      description: "Warm pastel yang lembut dan cozy.",
      thumbnail: "/assets/themes/dubu-duu/welcome.webp",
      palette: Object.freeze({
        red: "#e8897d", redDark: "#b85850", yellow: "#f4d782", blue: "#b9d8e6", blueDark: "#6f99aa",
        cream: "#fff4e7", paper: "#fffdf8", ink: "#4b3832", muted: "#806e65", navy: "#4b3832", navyLight: "#76584d",
        cardWarm: "#f9e9ad", cardCool: "#dcecf1", cardPrimary: "#f6d7d1"
      }),
      gifs: Object.freeze({
        welcome: "/assets/themes/dubu-duu/welcome.webp",
        wishWriting: "/assets/themes/dubu-duu/cozy.webp",
        wish: "/assets/themes/dubu-duu/wish-success.webp",
        hug: "/assets/themes/dubu-duu/hearts.webp",
        cozy: "/assets/themes/dubu-duu/cozy.webp",
        memoriesLogo: "/assets/themes/dubu-duu/together.webp",
        dance: "/assets/themes/dubu-duu/dance.webp",
        letterLogo: "/assets/themes/dubu-duu/letter-logo.gif",
        letter: "/assets/themes/dubu-duu/together.webp",
        finale: "/assets/themes/dubu-duu/celebrate.webp"
      }),
      alt: Object.freeze({
        welcome: "Dubu dan Duu membawa kejutan ulang tahun",
        wishWriting: "Dubu dan Duu menemani menulis harapan",
        wish: "Dubu dan Duu merayakan harapan yang terkirim",
        hug: "Dubu dan Duu memberikan pelukan hangat",
        dance: "Dubu dan Duu menari mengikuti musik",
        cozy: "Dubu dan Duu bersantai bersama",
        memoriesLogo: "Dubu dan Duu menjelajahi galeri",
        letterLogo: "Dubu dan Duu menulis surat",
        letter: "Dubu dan Duu menemani akhir surat",
        finale: "Dubu dan Duu merayakan ulang tahun"
      })
    })
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

  function normalizeThemeId(value) {
    const themeId = text(value, DEFAULT_THEME_ID).toLowerCase();
    return Object.hasOwn(THEMES, themeId) ? themeId : DEFAULT_THEME_ID;
  }

  function getTheme(themeId) {
    return THEMES[normalizeThemeId(themeId)];
  }

  function emptyProject(projectId = "new-gift") {
    return {
      schemaVersion: SCHEMA_VERSION,
      projectId,
      status: "draft",
      themeId: DEFAULT_THEME_ID,
      identity: {
        recipient: "",
        sender: "",
        birthdayDate: "",
        subtitle: "Empat kejutan kecil yang dibuat khusus untukmu."
      },
      warmWish: { message: "", signature: "" },
      galleryRoom: {
        title: "Gallery Room",
        subtitle: "Kumpulan momen yang dipilih khusus untukmu."
      },
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
    const galleryRoom = source.galleryRoom && typeof source.galleryRoom === "object" ? source.galleryRoom : {};
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
      themeId: normalizeThemeId(source.themeId),
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
      galleryRoom: {
        title: text(galleryRoom.title, fallback.galleryRoom.title).slice(0, 80),
        subtitle: text(galleryRoom.subtitle, fallback.galleryRoom.subtitle).slice(0, 160)
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
    if (normalized.galleryRoom.title.length < 2) add("galleryRoomTitle", "Nama gallery room wajib diisi.");
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
    DEFAULT_THEME_ID,
    THEMES,
    emptyProject,
    normalizeProject,
    normalizeThemeId,
    getTheme,
    validateProject,
    formatBirthdayDate,
    projectIdFromPath,
    makeId
  };
});
