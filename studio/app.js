(() => {
  "use strict";

  const Project = window.GiftProject;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  const DEFAULT_MUSIC_COVER = "/assets/gifs/dance.webp";
  const WARM_PRESETS = Object.freeze({
    simple: "Selamat ulang tahun! Semoga hari spesialmu dipenuhi kebahagiaan, tawa, dan banyak momen indah yang layak dikenang.",
    heartfelt: "Di hari spesial ini, semoga kamu selalu dikelilingi orang-orang baik, diberi kesehatan, dan menemukan kebahagiaan dalam setiap langkah yang kamu jalani.",
    cheerful: "Selamat membuka babak baru! Semoga tahun ini membawa lebih banyak keberanian, kesempatan baik, cerita seru, dan alasan untuk terus tersenyum."
  });
  const projectId = Project.projectIdFromPath(location.pathname, location.search);
  const tokenStorageKey = `snoopy-studio:token:${projectId}`;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const incomingToken = hash.get("token") || "";
  if (incomingToken) {
    sessionStorage.setItem(tokenStorageKey, incomingToken);
    history.replaceState({}, "", `${location.pathname}${location.search}`);
  }
  const token = incomingToken || sessionStorage.getItem(tokenStorageKey) || "";

  let api = null;
  let draft = Project.emptyProject(projectId || "new-gift");
  let currentStep = 1;
  let saveTimer = null;
  let previewTimer = null;
  let catalogTracks = [];
  let previewTrackId = "";
  let activeMusicIndex = 0;
  let qrInstance = null;
  let studioReady = false;

  function showState(title, message, options = {}) {
    $("#studio-state").hidden = false;
    $("#studio-shell").hidden = true;
    $("#studio-state-title").textContent = title;
    $("#studio-state-message").textContent = message;
    $("#state-sticker").textContent = options.sticker || "STUDIO";
    $("#studio-retry").hidden = !options.retry;
  }

  function showStudio() {
    $("#studio-state").hidden = true;
    $("#studio-shell").hidden = false;
    studioReady = true;
  }

  function setSaveState(state, message) {
    const element = $("#save-state");
    element.dataset.state = state;
    $("span", element).textContent = message;
  }

  function setError(name, message = "") {
    const target = $(`[data-error-for="${name}"]`);
    if (target) target.textContent = message;
  }

  function clearErrors() {
    $$('[data-error-for]').forEach(element => { element.textContent = ""; });
    $("#publish-errors").hidden = true;
    $("#publish-errors").replaceChildren();
  }

  function fillForm(project) {
    $("#recipient").value = project.identity.recipient;
    $("#sender").value = project.identity.sender;
    $("#birthday-date-input").value = /^\d{4}-\d{2}-\d{2}$/.test(project.identity.birthdayDate) ? project.identity.birthdayDate : "";
    $("#subtitle").value = project.identity.subtitle;
    $("#warm-message").value = project.warmWish.message;
    $("#warm-signature").value = project.warmWish.signature;
    $("#warm-count").textContent = String(project.warmWish.message.length);
    $("#letter-greeting").value = project.letter.greeting;
    $("#letter-body").value = project.letter.paragraphs.join("\n\n");
    $("#letter-signoff").value = project.letter.signoff;
    $("#letter-count").textContent = String($("#letter-body").value.length);
    $("#wish-enabled").checked = project.settings.wishEnabled;
    $("#project-label").textContent = project.projectId;
    renderGallery();
    activeMusicIndex = Math.min(activeMusicIndex, Math.max(0, project.music.tracks.length - 1));
    renderPlaylist();
    updateActiveMusicEditor();
    updatePublishedResult();
  }

  function readForm() {
    const musicTracks = (draft.music.tracks || []).map(track => ({ ...track }));
    if (musicTracks[activeMusicIndex]) {
      musicTracks[activeMusicIndex].title = $("#music-title").value.trim();
      musicTracks[activeMusicIndex].artist = $("#music-artist").value.trim();
    }
    draft = Project.normalizeProject({
      ...draft,
      identity: {
        recipient: $("#recipient").value,
        sender: $("#sender").value,
        birthdayDate: $("#birthday-date-input").value,
        subtitle: $("#subtitle").value
      },
      warmWish: {
        message: $("#warm-message").value,
        signature: $("#warm-signature").value
      },
      gallery: draft.gallery,
      music: { tracks: musicTracks },
      letter: {
        greeting: $("#letter-greeting").value,
        paragraphs: $("#letter-body").value.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean),
        signoff: $("#letter-signoff").value
      },
      settings: { wishEnabled: $("#wish-enabled").checked }
    }, projectId);
    return draft;
  }

  function scheduleSave() {
    if (!studioReady) return;
    readForm();
    setSaveState("saving", "Menyimpan perubahan...");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveDraft(draft.status === "published" ? "published" : "draft"), 750);
    schedulePreview();
  }

  async function saveDraft(status = "draft") {
    window.clearTimeout(saveTimer);
    readForm();
    try {
      const payload = await api.saveStudio(draft, status);
      draft = Project.normalizeProject(payload.project || draft, projectId);
      setSaveState("saved", status === "published" ? "Kado sudah dipublikasikan" : "Draft tersimpan");
      updatePublishedResult(payload.giftUrl);
      return payload;
    } catch (error) {
      setSaveState("error", error.message || "Draft belum tersimpan");
      throw error;
    }
  }

  function stepErrors(step) {
    readForm();
    const errors = {};
    if (step === 1) {
      if (draft.identity.recipient.length < 2) errors.recipient = "Nama penerima wajib diisi.";
      if (draft.identity.sender.length < 2) errors.sender = "Nama pengirim wajib diisi.";
      if (!draft.identity.birthdayDate) errors.birthdayDate = "Tanggal ulang tahun wajib diisi.";
    }
    if (step === 2 && draft.warmWish.message.length < 3) errors.warmWish = "Ucapan singkat wajib diisi.";
    if (step === 3 && (!draft.gallery.length || !draft.gallery[0].imageUrl)) errors.gallery = "Tambahkan setidaknya satu foto.";
    if (step === 4) {
      if (!draft.music.tracks.length) errors.music = "Pilih atau upload setidaknya satu lagu.";
      if (draft.music.tracks.some(track => !track.audioUrl || !track.title)) errors.musicTitle = "Setiap lagu wajib memiliki file dan judul.";
    }
    if (step === 5) {
      if (!draft.letter.greeting) errors.greeting = "Greeting surat wajib diisi.";
      if (!draft.letter.paragraphs.length) errors.letter = "Isi surat wajib diisi.";
      if (!draft.letter.signoff) errors.signoff = "Signoff wajib diisi.";
    }
    return errors;
  }

  function validateStep(step) {
    clearErrors();
    const errors = stepErrors(step);
    Object.entries(errors).forEach(([name, message]) => setError(name, message));
    if (Object.keys(errors).length) {
      $(`[data-error-for="${Object.keys(errors)[0]}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  function goToStep(nextStep, options = {}) {
    const target = Math.max(1, Math.min(7, nextStep));
    if (target > currentStep && !options.skipValidation && !validateStep(currentStep)) return;
    currentStep = target;
    $$(".wizard-step").forEach(step => step.classList.toggle("is-active", Number(step.dataset.step) === currentStep));
    $$("#step-list li").forEach(item => {
      const step = Number(item.dataset.stepTarget);
      item.classList.toggle("is-active", step === currentStep);
      item.classList.toggle("is-complete", step < currentStep);
    });
    $("#previous-step").hidden = currentStep === 1;
    $("#next-step").hidden = currentStep === 7;
    $("#mobile-step-label").textContent = `Langkah ${currentStep} dari 7`;
    $("#mobile-progress-bar").style.width = `${(currentStep / 7) * 100}%`;
    if (currentStep === 6) loadWishes();
    if (currentStep === 7) {
      sendPreview();
      updatePublishedResult();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderGallery() {
    const editor = $("#gallery-editor");
    const template = $("#gallery-item-template");
    editor.replaceChildren();
    draft.gallery.forEach((item, index) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.galleryId = item.id;
      $(".gallery-number", node).textContent = String(index + 1).padStart(2, "0");
      const image = $("img", node);
      const upload = $(".polaroid-upload", node);
      if (item.imageUrl) {
        image.src = item.imageUrl;
        image.hidden = false;
        upload.classList.add("has-image");
        $(".polaroid-upload label span", node).textContent = "Ganti foto";
        image.addEventListener("error", () => {
          const errorBox = $(".photo-upload-error", node);
          errorBox.textContent = "Foto sudah tersimpan, tetapi belum dapat dibuka dari CDN. Periksa domain R2 atau coba refresh sebentar lagi.";
          errorBox.hidden = false;
        });
      }
      $(".gallery-title", node).value = item.title;
      $(".gallery-story", node).value = item.story;
      $(".gallery-title", node).addEventListener("input", event => { item.title = event.target.value; scheduleSave(); });
      $(".gallery-story", node).addEventListener("input", event => { item.story = event.target.value; scheduleSave(); });
      $(".remove-photo", node).disabled = draft.gallery.length === 1;
      $(".remove-photo", node).addEventListener("click", () => {
        if (draft.gallery.length === 1) return;
        draft.gallery.splice(index, 1);
        renderGallery();
        scheduleSave();
      });
      $(".gallery-file", node).addEventListener("change", event => uploadPhoto(event.target.files[0], item, node));
      editor.appendChild(node);
    });
    $("#add-photo").disabled = draft.gallery.length >= Project.MAX_GALLERY_ITEMS;
  }

  function loadPhoto(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Browser terlalu lama membaca foto. Coba gunakan file JPG, PNG, atau WEBP lain."));
      }, 15000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
      };
      image.onload = () => {
        cleanup();
        resolve({ image, objectUrl });
      };
      image.onerror = () => {
        cleanup();
        URL.revokeObjectURL(objectUrl);
        reject(new Error("File foto tidak dapat dibaca oleh browser."));
      };
      image.src = objectUrl;
    });
  }

  async function compressPhoto(file) {
    const extension = file?.name?.split(".").pop()?.toLowerCase() || "";
    const allowedType = ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file?.type?.toLowerCase());
    const allowedExtension = ["jpg", "jpeg", "png", "webp"].includes(extension);
    if (!file || (!allowedType && !allowedExtension)) throw new Error("Gunakan foto JPG, PNG, atau WEBP.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Ukuran foto maksimal 8 MB.");
    const { image, objectUrl } = await loadPhoto(file);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(objectUrl);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .86));
    if (!blob) throw new Error("Foto belum berhasil dikompresi.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.webp`, { type: "image/webp" });
  }

  async function uploadPhoto(file, item, node) {
    if (!file) return;
    const badge = $(".uploading-badge", node);
    const errorBox = $(".photo-upload-error", node);
    const image = $("img", node);
    const upload = $(".polaroid-upload", node);
    const previewUrl = URL.createObjectURL(file);
    image.src = previewUrl;
    image.hidden = false;
    upload.classList.add("has-image");
    $(".polaroid-upload label span", node).textContent = "Ganti foto";
    image.addEventListener("load", () => URL.revokeObjectURL(previewUrl), { once: true });
    image.addEventListener("error", () => URL.revokeObjectURL(previewUrl), { once: true });
    badge.hidden = false;
    badge.textContent = "Membaca foto...";
    errorBox.hidden = true;
    errorBox.textContent = "";
    setError("gallery", "");
    setSaveState("saving", "Mengunggah foto...");
    try {
      const optimized = await compressPhoto(file);
      badge.textContent = "Mengunggah...";
      const result = await api.upload(optimized, "photo");
      item.imageUrl = result.url;
      renderGallery();
      scheduleSave();
    } catch (error) {
      const message = error.message || "Foto belum berhasil diunggah.";
      console.error("Photo upload failed", { message, status: error.status, response: error.payload });
      errorBox.textContent = `Upload gagal: ${message}`;
      errorBox.hidden = false;
      setError("gallery", message);
      setSaveState("error", "Foto belum terunggah");
    } finally {
      badge.hidden = true;
    }
  }

  function normalizeCatalog(payload) {
    const source = Array.isArray(payload) ? payload : Array.isArray(payload?.tracks) ? payload.tracks : [];
    return source.map((track, index) => ({
      id: String(track.id || `track-${index + 1}`),
      title: String(track.title || track.name || "Untitled"),
      artist: String(track.artist || track.singer || ""),
      genre: String(track.genre || ""),
      coverUrl: String(track.coverUrl || track.cover || track.imageUrl || DEFAULT_MUSIC_COVER),
      url: String(track.audioUrl || track.url || track.src || track.audio || track.file || "")
    })).filter(track => track.url);
  }

  function renderCatalog(query = "") {
    const grid = $("#music-catalog-grid");
    const needle = query.trim().toLocaleLowerCase("id-ID");
    const tracks = catalogTracks.filter(track => `${track.title} ${track.artist} ${track.genre}`.toLocaleLowerCase("id-ID").includes(needle));
    grid.replaceChildren();
    if (!tracks.length) {
      const empty = document.createElement("p");
      empty.className = "catalog-empty";
      empty.textContent = needle ? "Lagu yang kamu cari belum ada di katalog." : "Katalog masih kosong. Kamu tetap dapat upload MP3.";
      grid.appendChild(empty);
      return;
    }
    tracks.forEach(track => {
      const selectedIndex = draft.music.tracks.findIndex(item => item.catalogId === track.id);
      const isSelected = selectedIndex >= 0;
      const card = document.createElement("article");
      card.className = `catalog-track${isSelected ? " is-selected" : ""}`;
      card.dataset.trackId = track.id;
      card.setAttribute("role", "option");
      card.setAttribute("aria-selected", String(isSelected));

      const cover = document.createElement("img");
      cover.className = "catalog-cover";
      cover.src = track.coverUrl;
      cover.alt = `Cover ${track.title}`;
      cover.loading = "lazy";
      cover.addEventListener("error", () => {
        if (!cover.src.endsWith(DEFAULT_MUSIC_COVER)) cover.src = DEFAULT_MUSIC_COVER;
      }, { once: true });

      const copy = document.createElement("div");
      copy.className = "catalog-track-copy";
      const title = document.createElement("strong");
      title.textContent = track.title;
      const artist = document.createElement("span");
      artist.textContent = track.artist || "Unknown artist";
      copy.append(title, artist);

      const actions = document.createElement("div");
      actions.className = "catalog-track-actions";
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "catalog-preview";
      preview.dataset.previewTrack = track.id;
      preview.textContent = previewTrackId === track.id && !$("#studio-audio").paused ? "Ⅱ Pause" : "▶ Preview";
      preview.addEventListener("click", () => previewCatalogTrack(track));
      const select = document.createElement("button");
      select.type = "button";
      select.className = "catalog-select";
      select.textContent = isSelected ? "Ditambahkan" : "Tambah lagu";
      select.disabled = !isSelected && draft.music.tracks.length >= Project.MAX_MUSIC_TRACKS;
      select.addEventListener("click", () => selectCatalogTrack(track));
      actions.append(preview, select);
      card.append(cover, copy, actions);
      grid.appendChild(card);
    });
  }

  async function loadCatalog() {
    try {
      const response = await fetch("/assets/data/music.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Katalog belum tersedia.");
      catalogTracks = normalizeCatalog(await response.json());
      $("#catalog-note").textContent = catalogTracks.length ? `${catalogTracks.length} lagu tersedia di katalog.` : "Katalog masih kosong. Kamu tetap dapat upload MP3.";
      renderCatalog();
    } catch (error) {
      $("#catalog-note").textContent = error.message;
      renderCatalog();
    }
  }

  function selectMusicSource(source) {
    const nextSource = source === "upload" ? "upload" : "catalog";
    $$('[data-music-source]').forEach(button => button.classList.toggle("is-active", button.dataset.musicSource === nextSource));
    $$('[data-source-panel]').forEach(panel => { panel.hidden = panel.dataset.sourcePanel !== nextSource; });
  }

  function replaceMusicTracks(tracks) {
    draft = Project.normalizeProject({ ...draft, music: { tracks } }, projectId);
    activeMusicIndex = Math.min(activeMusicIndex, Math.max(0, draft.music.tracks.length - 1));
  }

  function renderPlaylist() {
    const playlist = $("#studio-playlist");
    const tracks = draft.music.tracks || [];
    $("#playlist-count").textContent = `${tracks.length}/${Project.MAX_MUSIC_TRACKS}`;
    playlist.replaceChildren();
    if (!tracks.length) {
      const empty = document.createElement("p");
      empty.className = "playlist-empty";
      empty.textContent = "Belum ada lagu. Preview katalog, lalu tambahkan lagu yang paling cocok.";
      playlist.appendChild(empty);
      return;
    }
    tracks.forEach((track, index) => {
      const card = document.createElement("article");
      card.className = `playlist-track${index === activeMusicIndex ? " is-active" : ""}`;
      const cover = document.createElement("img");
      cover.src = track.coverUrl || DEFAULT_MUSIC_COVER;
      cover.alt = `Cover ${track.title || `lagu ${index + 1}`}`;
      cover.addEventListener("error", () => { cover.src = DEFAULT_MUSIC_COVER; }, { once: true });
      const copy = document.createElement("div");
      copy.className = "playlist-track-copy";
      const title = document.createElement("strong");
      title.textContent = track.title || `Lagu ${index + 1}`;
      const artist = document.createElement("span");
      artist.textContent = track.artist || "Artis belum diisi";
      copy.append(title, artist);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "playlist-remove";
      remove.textContent = "Hapus dari playlist";
      remove.addEventListener("click", event => {
        event.stopPropagation();
        const nextTracks = tracks.filter((_, trackIndex) => trackIndex !== index);
        if (index < activeMusicIndex) activeMusicIndex -= 1;
        replaceMusicTracks(nextTracks);
        renderPlaylist();
        renderCatalog($("#music-search").value);
        updateActiveMusicEditor();
        scheduleSave();
      });
      card.addEventListener("click", () => {
        readForm();
        activeMusicIndex = index;
        renderPlaylist();
        updateActiveMusicEditor();
      });
      card.append(cover, copy, remove);
      playlist.appendChild(card);
    });
  }

  function updateActiveMusicEditor() {
    const track = draft.music.tracks[activeMusicIndex] || null;
    $("#music-title").value = track?.title || "";
    $("#music-artist").value = track?.artist || "";
    $("#music-title").disabled = !track;
    $("#music-artist").disabled = !track;
    selectMusicSource(track?.sourceType || "catalog");
    previewTrackId = track?.catalogId || track?.id || "";
    showPlayerTrack(track || {});
  }

  function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  }

  function showPlayerTrack(track) {
    const audio = $("#studio-audio");
    audio.pause();
    const audioUrl = track.audioUrl || track.url || "";
    if (audioUrl && audio.src !== new URL(audioUrl, location.href).href) {
      audio.src = audioUrl;
      audio.load();
    }
    if (!audioUrl) audio.removeAttribute("src");
    $("#studio-track-title").textContent = track.title || "Belum ada lagu";
    $("#studio-track-artist").textContent = track.artist || "Pilih lagu untuk mendengarkan preview";
    const cover = $("#studio-track-cover");
    const placeholder = $("#studio-cover-placeholder");
    cover.onerror = () => {
      cover.onerror = () => {
        cover.hidden = true;
        placeholder.hidden = false;
      };
      cover.src = DEFAULT_MUSIC_COVER;
    };
    cover.src = track.coverUrl || DEFAULT_MUSIC_COVER;
    cover.hidden = false;
    placeholder.hidden = true;
    $("#studio-current-time").textContent = "0:00";
    $("#studio-duration").textContent = "0:00";
    $("#studio-seek").value = "0";
    $("#studio-audio-toggle").textContent = "▶";
  }

  function updateMusicPreview() {
    const track = draft.music.tracks[activeMusicIndex] || {};
    previewTrackId = track.catalogId || track.id || "";
    showPlayerTrack(track);
  }

  async function previewCatalogTrack(track) {
    const audio = $("#studio-audio");
    const targetUrl = new URL(track.url, location.href).href;
    if (previewTrackId === track.id && audio.src === targetUrl && !audio.paused) {
      audio.pause();
      return;
    }
    previewTrackId = track.id;
    showPlayerTrack(track);
    try {
      await audio.play();
      setError("music", "");
    } catch (error) {
      setError("music", "Preview belum dapat diputar. Periksa akses file audio dari CDN.");
      console.error("Music preview failed", { trackId: track.id, message: error.message });
    }
  }

  function syncCatalogPlaybackButtons() {
    const audio = $("#studio-audio");
    $$('[data-preview-track]').forEach(button => {
      button.textContent = button.dataset.previewTrack === previewTrackId && !audio.paused ? "Ⅱ Pause" : "▶ Preview";
    });
  }

  function selectCatalogTrack(track) {
    const audio = $("#studio-audio");
    const keepPlaying = previewTrackId === track.id && !audio.paused;
    const existingIndex = draft.music.tracks.findIndex(item => item.catalogId === track.id);
    if (existingIndex >= 0) {
      activeMusicIndex = existingIndex;
      renderPlaylist();
      updateActiveMusicEditor();
      return;
    }
    if (draft.music.tracks.length >= Project.MAX_MUSIC_TRACKS) {
      setError("music", "Playlist sudah penuh. Hapus satu lagu sebelum menambahkan lagu lain.");
      return;
    }
    const nextTrack = {
      id: Project.makeId("track"),
      sourceType: "catalog",
      catalogId: track.id,
      audioUrl: track.url,
      coverUrl: track.coverUrl,
      title: track.title,
      artist: track.artist
    };
    replaceMusicTracks([...draft.music.tracks, nextTrack]);
    activeMusicIndex = draft.music.tracks.length - 1;
    renderPlaylist();
    updateActiveMusicEditor();
    if (keepPlaying) {
      previewTrackId = track.id;
      $("#studio-audio").play().catch(() => {});
    }
    renderCatalog($("#music-search").value);
    setError("music", "");
    scheduleSave();
  }

  async function uploadMusic(file) {
    if (!file) return;
    if (draft.music.tracks.length >= Project.MAX_MUSIC_TRACKS) return setError("music", "Playlist maksimal berisi tiga lagu.");
    if (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3")) return setError("music", "Gunakan file MP3.");
    if (file.size > 25 * 1024 * 1024) return setError("music", "Ukuran MP3 maksimal 25 MB.");
    $("#music-upload-status").textContent = "Mengunggah MP3...";
    setSaveState("saving", "Mengunggah lagu...");
    try {
      const result = await api.upload(file, "audio");
      const uploadedTrack = {
        id: Project.makeId("track"),
        sourceType: "upload",
        catalogId: "",
        audioUrl: result.url,
        coverUrl: DEFAULT_MUSIC_COVER,
        title: file.name.replace(/\.mp3$/i, ""),
        artist: ""
      };
      replaceMusicTracks([...draft.music.tracks, uploadedTrack]);
      activeMusicIndex = draft.music.tracks.length - 1;
      $("#music-upload-status").textContent = `${file.name} siap digunakan.`;
      renderPlaylist();
      renderCatalog($("#music-search").value);
      updateActiveMusicEditor();
      scheduleSave();
    } catch (error) {
      $("#music-upload-status").textContent = error.message;
      setSaveState("error", "Lagu belum terunggah");
    }
  }

  async function loadWishes() {
    const inbox = $("#wish-inbox");
    inbox.setAttribute("aria-busy", "true");
    try {
      const payload = await api.getWishes();
      const wishes = Array.isArray(payload.wishes) ? payload.wishes : [];
      inbox.replaceChildren();
      if (!wishes.length) {
        inbox.innerHTML = '<div class="empty-inbox"><strong>Belum ada wish</strong><p>Nanti pesan pertama akan muncul seperti secarik catatan kecil di sini.</p></div>';
        return;
      }
      wishes.forEach(entry => {
        const note = document.createElement("article");
        note.className = "wish-note";
        const quote = document.createElement("blockquote");
        quote.textContent = entry.wish;
        const footer = document.createElement("footer");
        const name = document.createElement("span");
        name.textContent = entry.recipient || draft.identity.recipient;
        const time = document.createElement("time");
        time.dateTime = entry.createdAt || "";
        time.textContent = entry.createdAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt)) : "Baru saja";
        footer.append(name, time);
        note.append(quote, footer);
        inbox.appendChild(note);
      });
    } catch (error) {
      inbox.innerHTML = `<div class="empty-inbox"><strong>Inbox belum dapat dimuat</strong><p>${escapeHtml(error.message)}</p></div>`;
    } finally {
      inbox.removeAttribute("aria-busy");
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  }

  function schedulePreview() {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(sendPreview, 180);
  }

  function sendPreview() {
    readForm();
    const frame = $("#gift-preview");
    if (!frame.src) frame.src = previewGiftUrl();
    frame.contentWindow?.postMessage({ type: "SNOOPY_PREVIEW_PROJECT", project: draft }, location.origin);
  }

  function previewGiftUrl(cacheBust = "") {
    if (isLocalHost) {
      const params = new URLSearchParams({ project: projectId, preview: "1" });
      if (cacheBust) params.set("t", cacheBust);
      return `/index.html?${params}`;
    }
    const suffix = cacheBust ? `&t=${encodeURIComponent(cacheBust)}` : "";
    return `/gift/${encodeURIComponent(projectId)}?preview=1${suffix}`;
  }

  function giftUrl() {
    return isLocalHost
      ? `${location.origin}/index.html?project=${encodeURIComponent(projectId)}`
      : `${location.origin}/gift/${encodeURIComponent(projectId)}`;
  }

  function renderQr(url) {
    const target = $("#qr-code");
    target.replaceChildren();
    qrInstance = null;
    if (!window.QRCode) {
      target.textContent = "QR generator belum termuat. Refresh halaman untuk mencoba lagi.";
      return;
    }
    qrInstance = new window.QRCode(target, {
      text: url,
      width: 360,
      height: 360,
      colorDark: "#171717",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.H
    });
  }

  function updatePublishedResult(explicitUrl) {
    const published = draft.status === "published";
    $("#publish-status").textContent = published ? "PUBLISHED" : "DRAFT";
    $("#published-result").hidden = !published;
    $("#publish-button").textContent = published ? "Publish perubahan" : "Publish kado";
    if (!published) return;
    const url = explicitUrl || giftUrl();
    $("#gift-url").value = url;
    $("#open-public-gift").href = url;
    renderQr(url);
  }

  async function publishProject() {
    clearErrors();
    readForm();
    const validation = Project.validateProject(draft, { forPublish: true });
    if (!validation.valid) {
      const box = $("#publish-errors");
      const list = document.createElement("ul");
      Object.values(validation.errors).forEach(message => {
        const item = document.createElement("li");
        item.textContent = message;
        list.appendChild(item);
      });
      box.appendChild(list);
      box.hidden = false;
      return;
    }
    const button = $("#publish-button");
    button.disabled = true;
    button.textContent = "Mempublikasikan...";
    try {
      const payload = await saveDraft("published");
      draft.status = "published";
      updatePublishedResult(payload.giftUrl);
    } catch (error) {
      const box = $("#publish-errors");
      box.textContent = error.message;
      box.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = draft.status === "published" ? "Publish perubahan" : "Publish kado";
    }
  }

  async function downloadQr() {
    const status = $("#download-status");
    status.textContent = "Menyiapkan QR...";
    const qrCanvas = $("#qr-code canvas");
    const qrImage = $("#qr-code img");
    let canvas = qrCanvas;
    if (!canvas && qrImage) {
      canvas = document.createElement("canvas");
      canvas.width = qrImage.naturalWidth || 360;
      canvas.height = qrImage.naturalHeight || 360;
      canvas.getContext("2d").drawImage(qrImage, 0, 0, canvas.width, canvas.height);
    }
    if (!canvas) {
      status.textContent = "QR belum siap. Coba lagi sebentar.";
      return;
    }

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      status.textContent = "QR belum dapat diunduh. Coba lagi.";
      return;
    }

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `qr-${projectId}.png`;
    link.href = downloadUrl;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    status.textContent = `QR ${projectId} berhasil disiapkan.`;
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
  }

  function bindEvents() {
    $("#studio-form").addEventListener("input", event => {
      if (event.target.type === "file") return;
      if (event.target === $("#music-search")) return;
      if (event.target === $("#warm-message")) $("#warm-count").textContent = String(event.target.value.length);
      if (event.target === $("#letter-body")) $("#letter-count").textContent = String(event.target.value.length);
      if (event.target === $("#music-title") || event.target === $("#music-artist")) {
        readForm();
        renderPlaylist();
      }
      scheduleSave();
    });
    $("#studio-form").addEventListener("change", event => {
      if (event.target.type !== "file") scheduleSave();
    });
    $("#next-step").addEventListener("click", () => goToStep(currentStep + 1));
    $("#previous-step").addEventListener("click", () => goToStep(currentStep - 1, { skipValidation: true }));
    $$("#step-list button").forEach(button => button.addEventListener("click", () => goToStep(Number(button.closest("li").dataset.stepTarget), { skipValidation: true })));
    $("#add-photo").addEventListener("click", () => {
      if (draft.gallery.length >= Project.MAX_GALLERY_ITEMS) return;
      draft.gallery.push({ id: Project.makeId("photo"), imageUrl: "", title: "", story: "" });
      renderGallery();
      scheduleSave();
    });
    $$('[data-warm-preset]').forEach(button => button.addEventListener("click", () => {
      $("#warm-message").value = WARM_PRESETS[button.dataset.warmPreset] || "";
      $("#warm-count").textContent = String($("#warm-message").value.length);
      setError("warmWish", "");
      scheduleSave();
    }));
    $$('[data-music-source]').forEach(button => button.addEventListener("click", () => selectMusicSource(button.dataset.musicSource)));
    $("#music-search").addEventListener("input", event => renderCatalog(event.target.value));
    $("#music-file").addEventListener("change", event => uploadMusic(event.target.files[0]));
    $("#studio-audio-toggle").addEventListener("click", async () => {
      const audio = $("#studio-audio");
      if (!audio.src) return setError("music", "Pilih atau preview lagu terlebih dahulu.");
      try { audio.paused ? await audio.play() : audio.pause(); } catch (_) { setError("music", "Preview lagu belum dapat diputar."); }
    });
    $("#studio-audio").addEventListener("play", () => {
      $("#studio-audio-toggle").textContent = "Ⅱ";
      syncCatalogPlaybackButtons();
    });
    $("#studio-audio").addEventListener("pause", () => {
      $("#studio-audio-toggle").textContent = "▶";
      syncCatalogPlaybackButtons();
    });
    $("#studio-audio").addEventListener("loadedmetadata", event => {
      $("#studio-duration").textContent = formatAudioTime(event.target.duration);
    });
    $("#studio-audio").addEventListener("timeupdate", event => {
      const audio = event.target;
      $("#studio-current-time").textContent = formatAudioTime(audio.currentTime);
      $("#studio-seek").value = audio.duration ? String((audio.currentTime / audio.duration) * 100) : "0";
    });
    $("#studio-audio").addEventListener("error", () => {
      setError("music", "File audio tidak dapat dibuka dari CDN. Coba lagu lain atau periksa URL medianya.");
    });
    $("#studio-seek").addEventListener("input", event => {
      const audio = $("#studio-audio");
      if (audio.duration) audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
    });
    $("#refresh-wishes").addEventListener("click", loadWishes);
    $("#refresh-preview").addEventListener("click", () => { $("#gift-preview").src = previewGiftUrl(String(Date.now())); });
    $("#gift-preview").addEventListener("load", () => window.setTimeout(sendPreview, 60));
    window.addEventListener("message", event => {
      if (event.origin === location.origin && event.data?.type === "SNOOPY_PREVIEW_READY") sendPreview();
    });
    $("#publish-button").addEventListener("click", publishProject);
    $("#copy-gift-url").addEventListener("click", async () => {
      await navigator.clipboard.writeText($("#gift-url").value);
      $("#copy-gift-url").textContent = "Copied";
      window.setTimeout(() => { $("#copy-gift-url").textContent = "Copy"; }, 1200);
    });
    $("#download-qr").addEventListener("click", downloadQr);
    $("#studio-retry").addEventListener("click", () => location.reload());
  }

  async function initialize() {
    if (!projectId || !Project.PROJECT_ID_PATTERN.test(projectId)) {
      showState("Magic link tidak valid", "Project ID tidak ditemukan pada alamat studio ini.", { sticker: "LINK ERROR" });
      return;
    }
    if (!token) {
      showState("Magic link tidak lengkap", "Buka kembali link studio asli yang memiliki token setelah tanda pagar.", { sticker: "TOKEN MISSING" });
      return;
    }
    api = new window.GiftApi(projectId, token);
    showState("Membuka meja kerja...", "Sebentar, kami sedang menyiapkan draft kadomu.");
    try {
      const payload = await api.getStudio();
      draft = Project.normalizeProject(payload.project || payload, projectId);
      fillForm(draft);
      await loadCatalog();
      bindEvents();
      showStudio();
      goToStep(1, { skipValidation: true });
    } catch (error) {
      const unauthorized = error.status === 401 || error.status === 403;
      showState(
        unauthorized ? "Magic link sudah tidak valid" : "Studio belum dapat dibuka",
        unauthorized ? "Pastikan kamu membuka magic link yang diberikan setelah pembelian." : error.message,
        { sticker: unauthorized ? "ACCESS DENIED" : "LOAD ERROR", retry: !unauthorized }
      );
    }
  }

  initialize();
})();
