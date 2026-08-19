(() => {
  "use strict";

  const Project = window.GiftProject;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
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
    $("#music-title").value = project.music.title;
    $("#music-artist").value = project.music.artist;
    $("#letter-greeting").value = project.letter.greeting;
    $("#letter-body").value = project.letter.paragraphs.join("\n\n");
    $("#letter-signoff").value = project.letter.signoff;
    $("#letter-count").textContent = String($("#letter-body").value.length);
    $("#wish-enabled").checked = project.settings.wishEnabled;
    $("#project-label").textContent = project.projectId;
    renderGallery();
    selectMusicSource(project.music.sourceType);
    updateMusicPreview();
    updatePublishedResult();
  }

  function readForm() {
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
      music: {
        ...draft.music,
        title: $("#music-title").value,
        artist: $("#music-artist").value
      },
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
      if (!draft.music.audioUrl) errors.music = "Pilih lagu katalog atau upload MP3.";
      if (!draft.music.title) errors.musicTitle = "Judul lagu wajib diisi.";
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
      url: String(track.url || track.src || track.audio || track.file || "")
    })).filter(track => track.url);
  }

  async function loadCatalog() {
    try {
      const response = await fetch("/assets/data/music.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Katalog belum tersedia.");
      catalogTracks = normalizeCatalog(await response.json());
      const select = $("#music-catalog");
      select.replaceChildren(new Option("Pilih satu lagu...", ""));
      catalogTracks.forEach(track => select.add(new Option(`${track.title} · ${track.artist}`, track.id)));
      select.value = draft.music.catalogId || "";
      $("#catalog-note").textContent = catalogTracks.length ? `${catalogTracks.length} lagu tersedia di katalog.` : "Katalog masih kosong. Kamu tetap dapat upload MP3.";
    } catch (error) {
      $("#catalog-note").textContent = error.message;
    }
  }

  function selectMusicSource(source) {
    const nextSource = source === "upload" ? "upload" : "catalog";
    draft.music.sourceType = nextSource;
    $$('[data-music-source]').forEach(button => button.classList.toggle("is-active", button.dataset.musicSource === nextSource));
    $$('[data-source-panel]').forEach(panel => { panel.hidden = panel.dataset.sourcePanel !== nextSource; });
  }

  function updateMusicPreview() {
    const audio = $("#studio-audio");
    audio.pause();
    if (draft.music.audioUrl && audio.src !== draft.music.audioUrl) audio.src = draft.music.audioUrl;
    $("#studio-track-title").textContent = draft.music.title || "Belum ada lagu";
    $("#studio-track-artist").textContent = draft.music.artist || "Pilih lagu untuk mendengarkan preview";
    $("#studio-audio-toggle").textContent = "▶";
  }

  async function uploadMusic(file) {
    if (!file) return;
    if (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3")) return setError("music", "Gunakan file MP3.");
    if (file.size > 25 * 1024 * 1024) return setError("music", "Ukuran MP3 maksimal 25 MB.");
    $("#music-upload-status").textContent = "Mengunggah MP3...";
    setSaveState("saving", "Mengunggah lagu...");
    try {
      const result = await api.upload(file, "audio");
      draft.music.audioUrl = result.url;
      draft.music.catalogId = "";
      if (!$("#music-title").value) $("#music-title").value = file.name.replace(/\.mp3$/i, "");
      $("#music-upload-status").textContent = `${file.name} siap digunakan.`;
      readForm();
      updateMusicPreview();
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
      if (event.target === $("#warm-message")) $("#warm-count").textContent = String(event.target.value.length);
      if (event.target === $("#letter-body")) $("#letter-count").textContent = String(event.target.value.length);
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
    $$('[data-music-source]').forEach(button => button.addEventListener("click", () => {
      selectMusicSource(button.dataset.musicSource);
      scheduleSave();
    }));
    $("#music-catalog").addEventListener("change", event => {
      const track = catalogTracks.find(item => item.id === event.target.value);
      if (!track) return;
      draft.music = { sourceType: "catalog", catalogId: track.id, audioUrl: track.url, title: track.title, artist: track.artist };
      $("#music-title").value = track.title;
      $("#music-artist").value = track.artist;
      updateMusicPreview();
      scheduleSave();
    });
    $("#music-file").addEventListener("change", event => uploadMusic(event.target.files[0]));
    $("#studio-audio-toggle").addEventListener("click", async () => {
      const audio = $("#studio-audio");
      if (!draft.music.audioUrl) return setError("music", "Pilih lagu terlebih dahulu.");
      try { audio.paused ? await audio.play() : audio.pause(); } catch (_) { setError("music", "Preview lagu belum dapat diputar."); }
    });
    $("#studio-audio").addEventListener("play", () => { $("#studio-audio-toggle").textContent = "Ⅱ"; });
    $("#studio-audio").addEventListener("pause", () => { $("#studio-audio-toggle").textContent = "▶"; });
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
      $("#music-catalog").value = draft.music.catalogId || "";
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
