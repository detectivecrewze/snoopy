export const SCHEMA_VERSION = 2;
export const MAX_GALLERY_ITEMS = 15;
export const MAX_MUSIC_TRACKS = 3;
export const MAX_WISH_LENGTH = 280;
export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

function cleanText(value, fallback = "", maximum = 10000) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maximum);
}

function cleanMediaUrl(value) {
  const url = cleanText(value, "", 2048);
  if (!url) return "";
  if (url.startsWith("/assets/") || /^https:\/\//i.test(url)) return url;
  return "";
}

export function emptyProject(projectId) {
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
    galleryRoom: {
      title: "Gallery Room",
      subtitle: "Kumpulan momen yang dipilih khusus untukmu."
    },
    gallery: [{ id: crypto.randomUUID(), mediaType: "image", mediaUrl: "", imageUrl: "", title: "", story: "" }],
    music: { tracks: [], sourceType: "catalog", catalogId: "", audioUrl: "", coverUrl: "", title: "", artist: "" },
    letter: { greeting: "", paragraphs: [], signoff: "" },
    settings: { wishEnabled: true },
    createdAt: "",
    updatedAt: "",
    publishedAt: null
  };
}

export function normalizeProject(input, projectId, existing = null) {
  const source = input && typeof input === "object" ? input : {};
  const previous = existing && typeof existing === "object" ? existing : emptyProject(projectId);
  const identity = source.identity && typeof source.identity === "object" ? source.identity : {};
  const warmWish = source.warmWish && typeof source.warmWish === "object" ? source.warmWish : {};
  const galleryRoom = source.galleryRoom && typeof source.galleryRoom === "object" ? source.galleryRoom : {};
  const music = source.music && typeof source.music === "object" ? source.music : {};
  const letter = source.letter && typeof source.letter === "object" ? source.letter : {};
  const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
  const gallerySource = Array.isArray(source.gallery) ? source.gallery.slice(0, MAX_GALLERY_ITEMS) : [];
  const gallery = gallerySource.map((item, index) => {
    const mediaType = item?.mediaType === "video" ? "video" : "image";
    const mediaUrl = cleanMediaUrl(item?.mediaUrl || item?.videoUrl || item?.imageUrl);
    return {
      id: cleanText(item?.id, `media-${index + 1}`, 100),
      mediaType,
      mediaUrl,
      imageUrl: mediaType === "image" ? mediaUrl : "",
      title: cleanText(item?.title, "", 100),
      story: cleanText(item?.story, "", 350)
    };
  });
  const legacyTrack = music.audioUrl || music.title ? [music] : [];
  const musicSource = Array.isArray(music.tracks) ? music.tracks : legacyTrack;
  const tracks = musicSource.slice(0, MAX_MUSIC_TRACKS).map((track, index) => ({
    id: cleanText(track?.id, `track-${index + 1}`, 100),
    sourceType: track?.sourceType === "upload" ? "upload" : "catalog",
    catalogId: cleanText(track?.catalogId, "", 100),
    audioUrl: cleanMediaUrl(track?.audioUrl),
    coverUrl: cleanMediaUrl(track?.coverUrl),
    title: cleanText(track?.title, "", 100),
    artist: cleanText(track?.artist, "", 100)
  })).filter(track => track.audioUrl || track.title);
  const primaryTrack = tracks[0] || { sourceType: "catalog", catalogId: "", audioUrl: "", coverUrl: "", title: "", artist: "" };

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    status: source.status === "published" ? "published" : "draft",
    identity: {
      recipient: cleanText(identity.recipient, "", 80),
      sender: cleanText(identity.sender, "", 80),
      birthdayDate: cleanText(identity.birthdayDate, "", 40),
      subtitle: cleanText(identity.subtitle, previous.identity?.subtitle || "Empat kejutan kecil yang dibuat khusus untukmu.", 120)
    },
    warmWish: {
      message: cleanText(warmWish.message, "", 650),
      signature: cleanText(warmWish.signature, "", 80)
    },
    galleryRoom: {
      title: cleanText(galleryRoom.title, previous.galleryRoom?.title || "Gallery Room", 80),
      subtitle: cleanText(galleryRoom.subtitle, previous.galleryRoom?.subtitle || "Kumpulan momen yang dipilih khusus untukmu.", 160)
    },
    gallery: gallery.length ? gallery : emptyProject(projectId).gallery,
    music: {
      tracks,
      ...primaryTrack
    },
    letter: {
      greeting: cleanText(letter.greeting, "", 120),
      paragraphs: Array.isArray(letter.paragraphs)
        ? letter.paragraphs.slice(0, 50).map(value => cleanText(value, "", 4000)).filter(Boolean)
        : [],
      signoff: cleanText(letter.signoff, "", 220)
    },
    settings: { wishEnabled: settings.wishEnabled !== false },
    createdAt: previous.createdAt || cleanText(source.createdAt, ""),
    updatedAt: previous.updatedAt || cleanText(source.updatedAt, ""),
    publishedAt: previous.publishedAt || source.publishedAt || null
  };
}

export function validatePublishedProject(project) {
  const errors = {};
  if (!PROJECT_ID_PATTERN.test(project.projectId)) errors.projectId = "Project ID tidak valid.";
  if (project.identity.recipient.length < 2) errors.recipient = "Nama penerima wajib diisi.";
  if (project.identity.sender.length < 2) errors.sender = "Nama pengirim wajib diisi.";
  if (!project.identity.birthdayDate) errors.birthdayDate = "Tanggal ulang tahun wajib diisi.";
  if (project.warmWish.message.length < 3) errors.warmWish = "Warm Wishes wajib diisi.";
  if (project.galleryRoom.title.length < 2) errors.galleryRoomTitle = "Nama gallery room wajib diisi.";
  if (!project.gallery.length || !project.gallery[0].mediaUrl) errors.gallery = "Tambahkan setidaknya satu foto atau video.";
  if (!project.music.tracks.length) errors.music = "Pilih atau unggah setidaknya satu lagu.";
  if (project.music.tracks.some(track => !track.audioUrl || !track.title)) errors.musicTitle = "Setiap lagu wajib memiliki file dan judul.";
  if (!project.letter.greeting) errors.greeting = "Greeting surat wajib diisi.";
  if (!project.letter.paragraphs.length) errors.letter = "Isi surat wajib diisi.";
  if (!project.letter.signoff) errors.signoff = "Signoff surat wajib diisi.";
  return errors;
}

export function publicProject(record) {
  const normalized = normalizeProject(record, record.projectId, record);
  return {
    schemaVersion: normalized.schemaVersion,
    projectId: normalized.projectId,
    status: normalized.status,
    identity: normalized.identity,
    warmWish: normalized.warmWish,
    galleryRoom: normalized.galleryRoom,
    gallery: normalized.gallery,
    music: normalized.music,
    letter: normalized.letter,
    settings: normalized.settings,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    publishedAt: normalized.publishedAt
  };
}
