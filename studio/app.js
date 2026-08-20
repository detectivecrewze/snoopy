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
  const LETTER_PRESETS = Object.freeze({
    warm: ({ recipient, sender }) => ({
      greeting: `Untuk ${recipient || "kamu yang istimewa"},`,
      paragraphs: [
        "Selamat ulang tahun. Semoga hari spesial ini menjadi awal dari banyak hal baik yang akan datang dalam hidupmu.",
        "Aku berharap kamu selalu diberi kesehatan, ketenangan, dan keberanian untuk menjalani setiap langkah. Semoga ada banyak alasan sederhana yang membuatmu tersenyum setiap hari.",
        "Terima kasih sudah menjadi dirimu sendiri. Tetaplah bertumbuh dengan caramu dan nikmati setiap cerita baru yang menantimu."
      ],
      signoff: `Dengan penuh kasih,\n${sender || "Seseorang yang menyayangimu"}`
    }),
    prayer: ({ recipient, sender }) => ({
      greeting: `Untuk ${recipient || "kamu"} di hari spesialmu,`,
      paragraphs: [
        "Di hari ulang tahunmu, aku ingin mengirimkan doa-doa baik untuk setiap perjalanan yang akan kamu jalani.",
        "Semoga langkahmu selalu dipertemukan dengan kesempatan yang baik, orang-orang yang tulus, serta kekuatan untuk melewati hari yang tidak mudah.",
        "Semoga semua hal yang sedang kamu usahakan menemukan jalannya pada waktu yang tepat. Jangan lupa memberi ruang untuk beristirahat, bersyukur, dan menikmati prosesnya."
      ],
      signoff: `Dengan doa terbaik,\n${sender || "Seseorang yang peduli padamu"}`
    }),
    cheerful: ({ recipient, sender }) => ({
      greeting: `Hai ${recipient || "birthday star"},`,
      paragraphs: [
        "Selamat ulang tahun. Hari ini adalah waktunya merayakan dirimu dan semua cerita seru yang sudah berhasil kamu lewati.",
        "Semoga tahun baru dalam hidupmu dipenuhi kejutan menyenangkan, kesempatan baru, tawa yang lebih banyak, dan kenangan yang ingin kamu simpan selamanya.",
        "Teruslah mencoba hal baru, percaya pada kemampuanmu, dan jangan takut membuat cerita yang benar-benar kamu sukai."
      ],
      signoff: `Dengan semangat terbaik,\n${sender || "Seseorang yang mendukungmu"}`
    })
  });
  const QR_PALETTES = Object.freeze({
    berry: { ink: "#ef7297", accent: "#f5adc1", paper: "#fffaf1" },
    comic: { ink: "#e94238", accent: "#f8d44c", paper: "#fffdf4" },
    midnight: { ink: "#173560", accent: "#7db7df", paper: "#fff8d8" },
    lavender: { ink: "#7251a3", accent: "#d9b8ee", paper: "#fff9fc" }
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
  let saveQueue = Promise.resolve();
  let isPublishing = false;
  let previewTimer = null;
  let catalogTracks = [];
  let previewTrackId = "";
  let activeMusicIndex = 0;
  let qrInstance = null;
  let qrPaletteKey = "berry";
  let studioReady = false;
  let pendingDeleteMediaId = "";
  let pendingDeleteWishId = "";
  let pendingDeleteWishNode = null;
  let photoCropper = null;
  let pendingPhotoCrop = null;
  let cropZoomValue = 0;
  let cropRotation = 0;
  let hasUnpublishedChanges = false;
  let workerSupportsThemes = true;

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
    const themeInput = $(`input[name="themeId"][value="${project.themeId}"]`) || $('input[name="themeId"][value="snoopy"]');
    if (themeInput) themeInput.checked = true;
    $("#recipient").value = project.identity.recipient;
    $("#sender").value = project.identity.sender;
    $("#birthday-date-input").value = /^\d{4}-\d{2}-\d{2}$/.test(project.identity.birthdayDate) ? project.identity.birthdayDate : "";
    $("#subtitle").value = project.identity.subtitle;
    $("#warm-message").value = project.warmWish.message;
    $("#warm-signature").value = project.warmWish.signature;
    $("#warm-count").textContent = String(project.warmWish.message.length);
    $("#gallery-room-title").value = project.galleryRoom.title;
    $("#gallery-room-subtitle").value = project.galleryRoom.subtitle;
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
      themeId: $('input[name="themeId"]:checked')?.value || Project.DEFAULT_THEME_ID,
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
      galleryRoom: {
        title: $("#gallery-room-title").value,
        subtitle: $("#gallery-room-subtitle").value
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
    if (draft.status === "published") hasUnpublishedChanges = true;
    setSaveState("saving", "Menyimpan perubahan...");
    window.clearTimeout(saveTimer);
    // Autosave must never run the full publish validation. A published gift can
    // temporarily be incomplete while its owner replaces media or edits a field.
    saveTimer = window.setTimeout(() => {
      saveDraft("draft").catch(() => {});
    }, 750);
    schedulePreview();
    updatePublishedResult();
  }

  async function performSaveDraft(status = "draft") {
    window.clearTimeout(saveTimer);
    readForm();
    const intendedThemeId = draft.themeId;
    try {
      const payload = await api.saveStudio(draft, status);
      draft = Project.normalizeProject(payload.project || draft, projectId);
      const themeWasDropped = intendedThemeId !== Project.DEFAULT_THEME_ID && draft.themeId !== intendedThemeId;
      if (themeWasDropped) {
        workerSupportsThemes = false;
        draft.themeId = intendedThemeId;
        updateBackendThemeWarning();
        if (status === "published") throw new Error("Tema belum dapat dipublish karena Worker production masih memakai schema lama. Deploy Worker v3 lalu coba lagi.");
      }
      if (status === "published") hasUnpublishedChanges = false;
      setSaveState("saved", status === "published"
        ? "Kado sudah dipublikasikan"
        : draft.status === "published" ? "Draft perubahan tersimpan, belum live" : "Draft tersimpan");
      updatePublishedResult(payload.giftUrl);
      return payload;
    } catch (error) {
      setSaveState("error", error.message || "Draft belum tersimpan");
      throw error;
    }
  }

  function saveDraft(status = "draft") {
    // Keep autosave and Publish ordered. A slower autosave must never finish
    // after Publish and leave the Studio looking out of sync with the live gift.
    window.clearTimeout(saveTimer);
    const operation = saveQueue.catch(() => {}).then(() => performSaveDraft(status));
    saveQueue = operation;
    return operation;
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
    if (step === 3) {
      if (draft.galleryRoom.title.length < 2) errors.galleryRoomTitle = "Nama gallery room wajib diisi.";
      if (!draft.gallery.length || !draft.gallery[0].mediaUrl) errors.gallery = "Tambahkan setidaknya satu foto atau video.";
    }
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
    $("#add-photo-floating").hidden = currentStep !== 3;
    if (currentStep === 6) loadWishes();
    if (currentStep === 7) {
      sendPreview();
      updatePublishedResult();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function currentGalleryItem(itemId, node) {
    if (itemId) {
      const found = draft.gallery.find(item => item.id === itemId);
      if (found) return found;
    }
    if (node) {
      const nodeId = node.dataset?.galleryId;
      if (nodeId) {
        const found = draft.gallery.find(item => item.id === nodeId);
        if (found) return found;
      }
      const editor = $("#gallery-editor");
      if (editor) {
        const index = Array.from(editor.children).indexOf(node);
        if (index >= 0 && draft.gallery[index]) return draft.gallery[index];
      }
    }
    return null;
  }

  function requestDeleteGalleryItem(itemId, displayIndex) {
    const item = currentGalleryItem(itemId);
    if (!item) return;
    pendingDeleteMediaId = itemId;
    const label = item.title ? `Media ${String(displayIndex + 1).padStart(2, "0")}: ${item.title}` : `Media ${String(displayIndex + 1).padStart(2, "0")}`;
    $("#delete-media-name").textContent = label;
    const dialog = $("#delete-media-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  function closeDeleteMediaDialog() {
    pendingDeleteMediaId = "";
    const dialog = $("#delete-media-dialog");
    if (dialog.open) dialog.close();
  }

  function confirmDeleteGalleryItem() {
    const currentIndex = draft.gallery.findIndex(entry => entry.id === pendingDeleteMediaId);
    if (currentIndex < 0) return closeDeleteMediaDialog();
    if (draft.gallery.length === 1) {
      draft.gallery = [{ id: Project.makeId("media"), mediaType: "image", mediaUrl: "", imageUrl: "", title: "", story: "" }];
    } else {
      draft.gallery.splice(currentIndex, 1);
    }
    closeDeleteMediaDialog();
    renderGallery();
    scheduleSave();
  }

  function renderGallery() {
    const editor = $("#gallery-editor");
    const template = $("#gallery-item-template");
    editor.replaceChildren();
    draft.gallery.forEach((item, index) => {
      const node = template.content.firstElementChild.cloneNode(true);
      const itemId = item.id;
      node.dataset.galleryId = itemId;
      $(".gallery-number", node).textContent = String(index + 1).padStart(2, "0");
      const image = $("img", node);
      const video = $("video", node);
      const upload = $(".polaroid-upload", node);
      const mediaUrl = item.mediaUrl || item.imageUrl || "";
      if (mediaUrl) {
        const media = item.mediaType === "video" ? video : image;
        media.src = mediaUrl;
        media.hidden = false;
        upload.classList.add("has-image");
        $(".polaroid-upload label span", node).textContent = "Ganti media";
        media.addEventListener("error", () => {
          const errorBox = $(".photo-upload-error", node);
          errorBox.textContent = "Media sudah tersimpan, tetapi belum dapat dibuka dari CDN. Periksa domain R2 atau coba refresh sebentar lagi.";
          errorBox.hidden = false;
        });
        if (item.mediaType === "video") video.play().catch(() => {});
      }
      $(".gallery-title", node).value = item.title;
      $(".gallery-story", node).value = item.story;
      $(".gallery-title", node).addEventListener("input", event => {
        const current = currentGalleryItem(itemId);
        if (current) current.title = event.target.value;
        scheduleSave();
      });
      $(".gallery-story", node).addEventListener("input", event => {
        const current = currentGalleryItem(itemId);
        if (current) current.story = event.target.value;
        scheduleSave();
      });
      $(".remove-photo", node).addEventListener("click", () => {
        requestDeleteGalleryItem(itemId, index);
      });
      $(".gallery-file", node).addEventListener("change", event => {
        const file = event.target.files[0];
        event.target.value = "";
        uploadGalleryMedia(file, itemId, node);
      });
      editor.appendChild(node);
    });
    const galleryFull = draft.gallery.length >= Project.MAX_GALLERY_ITEMS;
    $("#add-photo").disabled = galleryFull;
    $("#add-photo-floating").disabled = galleryFull;
  }

  function galleryUploadError(node, message) {
    const errorBox = $(".photo-upload-error", node);
    errorBox.textContent = `Upload gagal: ${message}`;
    errorBox.hidden = false;
    setError("gallery", message);
  }

  function closePhotoCropper() {
    if (photoCropper) photoCropper.destroy();
    photoCropper = null;
    if (pendingPhotoCrop?.objectUrl) URL.revokeObjectURL(pendingPhotoCrop.objectUrl);
    pendingPhotoCrop = null;
    cropZoomValue = 0;
    cropRotation = 0;
    $("#cropper-source").removeAttribute("src");
    $("#cropper-error").hidden = true;
    $("#cropper-zoom").value = "0";
    const dialog = $("#photo-crop-dialog");
    if (dialog.open) dialog.close();
  }

  async function openPhotoCropper(file, itemId, node) {
    const CropperConstructor = window.Cropper?.default;
    if (typeof CropperConstructor !== "function") return galleryUploadError(node, "Editor foto belum termuat. Refresh halaman lalu coba lagi.");
    if (file.size > 8 * 1024 * 1024) return galleryUploadError(node, "ukuran foto maksimal 8 MB.");
    closePhotoCropper();
    const source = $("#cropper-source");
    const objectUrl = URL.createObjectURL(file);
    pendingPhotoCrop = { file, itemId, node, objectUrl };
    source.src = objectUrl;
    $("#photo-crop-dialog").showModal();
    try {
      await source.decode();
      if (!pendingPhotoCrop || pendingPhotoCrop.objectUrl !== objectUrl) return;
      photoCropper = new CropperConstructor(source, { container: $("#cropper-stage") });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const selection = photoCropper.getCropperSelection();
      if (!selection) throw new Error("Area crop belum siap.");
      selection.aspectRatio = 4 / 3;
      selection.initialAspectRatio = 4 / 3;
      selection.initialCoverage = .82;
      selection.$reset();
      await applyDefaultCropZoom();
    } catch (error) {
      $("#cropper-error").textContent = error.message || "Foto belum dapat dibuka di editor.";
      $("#cropper-error").hidden = false;
    }
  }

  async function applyDefaultCropZoom() {
    if (!photoCropper) return;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const image = photoCropper.getCropperImage();
    const selection = photoCropper.getCropperSelection();
    if (!image || !selection) return;
    const imageRect = image.getBoundingClientRect();
    const selectionRect = selection.getBoundingClientRect();
    const coverScale = Math.max(
      selectionRect.width / Math.max(1, imageRect.width),
      selectionRect.height / Math.max(1, imageRect.height)
    );
    const zoomAmount = Math.min(1, Math.max(.25, coverScale - 1 + .04));
    image.$zoom(zoomAmount);
    cropZoomValue = Math.round(zoomAmount * 100);
    $("#cropper-zoom").value = String(cropZoomValue);
  }

  async function resetPhotoCropper() {
    if (!photoCropper) return;
    photoCropper.getCropperImage()?.$resetTransform();
    const selection = photoCropper.getCropperSelection();
    if (selection) {
      selection.aspectRatio = 4 / 3;
      selection.initialAspectRatio = 4 / 3;
      selection.initialCoverage = .82;
      selection.$reset();
    }
    cropZoomValue = 0;
    cropRotation = 0;
    $("#cropper-zoom").value = "0";
    await applyDefaultCropZoom();
  }

  async function confirmPhotoCrop() {
    if (!photoCropper || !pendingPhotoCrop) return;
    const confirmButton = $("#confirm-photo-crop");
    const errorBox = $("#cropper-error");
    confirmButton.disabled = true;
    confirmButton.textContent = "Menyiapkan foto...";
    errorBox.hidden = true;
    try {
      const selection = photoCropper.getCropperSelection();
      if (!selection) throw new Error("Area crop belum siap.");
      const source = $("#cropper-source");
      const cropperImage = photoCropper.getCropperImage();
      const swapDimensions = Math.abs(cropRotation / 90) % 2 === 1;
      const naturalWidth = swapDimensions ? source.naturalHeight : source.naturalWidth;
      const naturalHeight = swapDimensions ? source.naturalWidth : source.naturalHeight;
      const baseWidth = Math.max(1, swapDimensions ? cropperImage?.clientHeight || 1 : cropperImage?.clientWidth || 1);
      const [matrixA = 1, matrixB = 0] = cropperImage?.$getTransform?.() || [];
      const transformScale = Math.max(.0001, Math.hypot(matrixA, matrixB));
      const selectedSourceWidth = selection.width * (naturalWidth / baseWidth) / transformScale;
      const largestCropWidth = Math.max(1, Math.min(naturalWidth, naturalHeight * (4 / 3), selectedSourceWidth));
      const outputWidth = Math.max(1, Math.min(1600, Math.round(largestCropWidth)));
      const outputHeight = Math.max(1, Math.min(1200, Math.round(outputWidth * (3 / 4))));
      const canvas = await selection.$toCanvas({
        width: outputWidth,
        height: outputHeight,
        beforeDraw(context, outputCanvas) {
          context.fillStyle = "#fffdf8";
          context.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
        }
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .86));
      if (!blob) throw new Error("Hasil crop belum dapat dibuat.");
      const { file, itemId, node } = pendingPhotoCrop;
      const croppedFile = new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}-cropped.webp`, { type: "image/webp" });
      closePhotoCropper();
      await uploadFinalGalleryMedia(croppedFile, false, itemId, node);
    } catch (error) {
      errorBox.textContent = error.message || "Foto belum berhasil dipotong.";
      errorBox.hidden = false;
    } finally {
      confirmButton.disabled = false;
      confirmButton.textContent = "Gunakan foto";
    }
  }

  async function uploadFinalGalleryMedia(file, isVideo, itemId, node) {
    const badge = $(".uploading-badge", node);
    const errorBox = $(".photo-upload-error", node);
    if (badge) {
      badge.hidden = false;
      badge.textContent = "Mengunggah...";
    }
    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }
    setError("gallery", "");
    setSaveState("saving", "Mengunggah media...");
    try {
      const result = await api.upload(file, isVideo ? "video" : "photo");
      let current = currentGalleryItem(itemId, node);
      if (!current) {
        const editor = $("#gallery-editor");
        const nodeIndex = node && editor ? Array.from(editor.children).indexOf(node) : -1;
        if (nodeIndex >= 0 && draft.gallery[nodeIndex]) {
          current = draft.gallery[nodeIndex];
        } else if (draft.gallery.length > 0) {
          current = draft.gallery[draft.gallery.length - 1];
        }
      }
      if (!current) throw new Error("Slot media tidak ditemukan. Silakan tambahkan slot foto baru.");
      current.mediaType = isVideo ? "video" : "image";
      current.mediaUrl = result.url;
      current.imageUrl = isVideo ? "" : result.url;
      renderGallery();
      scheduleSave();
    } catch (error) {
      const message = error.message || "Media belum berhasil diunggah.";
      console.error("Gallery media upload failed", { message, status: error.status, response: error.payload });
      if (errorBox) {
        errorBox.textContent = `Upload gagal: ${message}`;
        errorBox.hidden = false;
      }
      setError("gallery", message);
      setSaveState("error", "Media belum terunggah");
    } finally {
      if (badge) badge.hidden = true;
    }
  }

  async function uploadGalleryMedia(file, itemId, node) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const imageExtensions = ["jpg", "jpeg", "png", "webp"];
    const videoExtensions = ["mp4", "webm", "mov"];
    const fileType = (file.type || "").toLowerCase();
    const isVideo = ["video/mp4", "video/webm", "video/quicktime"].includes(fileType) || videoExtensions.includes(extension);
    const isImage = ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(fileType) || imageExtensions.includes(extension);
    if (!isVideo && !isImage) return galleryUploadError(node, "gunakan foto JPG, PNG, WEBP atau video MP4, WEBM, MOV.");
    if (isVideo && file.size > 20 * 1024 * 1024) return galleryUploadError(node, "ukuran video maksimal 20 MB.");
    if (isImage) return openPhotoCropper(file, itemId, node);
    const expectedVideoType = extension === "webm" ? "video/webm" : extension === "mov" ? "video/quicktime" : "video/mp4";
    const normalizedVideo = file.type === expectedVideoType ? file : new File([file], file.name, { type: expectedVideoType });
    await uploadFinalGalleryMedia(normalizedVideo, true, itemId, node);
  }

  function addGalleryItem() {
    if (draft.gallery.length >= Project.MAX_GALLERY_ITEMS) return;
    draft.gallery.push({ id: Project.makeId("media"), mediaType: "image", mediaUrl: "", imageUrl: "", title: "", story: "" });
    renderGallery();
    scheduleSave();
    requestAnimationFrame(() => $("#gallery-editor .gallery-item:last-child")?.scrollIntoView({ behavior: "smooth", block: "center" }));
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
      preview.append(
        Object.assign(document.createElement("span"), { className: "media-icon", ariaHidden: "true" }),
        Object.assign(document.createElement("span"), { className: "media-control-label" })
      );
      setPlaybackButton(preview, previewTrackId === track.id && !$("#studio-audio").paused, true);
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

  function setPlaybackButton(button, playing, showLabel = false) {
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-label", playing ? "Jeda preview lagu" : "Putar preview lagu");
    if (showLabel) {
      const label = $(".media-control-label", button);
      if (label) label.textContent = playing ? "Pause" : "Preview";
    }
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
    setPlaybackButton($("#studio-audio-toggle"), false);
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
      setPlaybackButton(button, button.dataset.previewTrack === previewTrackId && !audio.paused, true);
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
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "wish-delete-button";
        deleteBtn.setAttribute("aria-label", "Hapus catatan wish");
        deleteBtn.setAttribute("title", "Hapus wish");
        deleteBtn.textContent = "×";
        deleteBtn.addEventListener("click", event => {
          event.stopPropagation();
          requestDeleteWish(entry.id, entry.wish, note);
        });
        const quote = document.createElement("blockquote");
        quote.textContent = entry.wish;
        const footer = document.createElement("footer");
        const name = document.createElement("span");
        name.textContent = entry.recipient || draft.identity.recipient;
        const time = document.createElement("time");
        time.dateTime = entry.createdAt || "";
        time.textContent = entry.createdAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt)) : "Baru saja";
        footer.append(name, time);
        note.append(deleteBtn, quote, footer);
        inbox.appendChild(note);
      });
    } catch (error) {
      inbox.innerHTML = `<div class="empty-inbox"><strong>Inbox belum dapat dimuat</strong><p>${escapeHtml(error.message)}</p></div>`;
    } finally {
      inbox.removeAttribute("aria-busy");
    }
  }

  function requestDeleteWish(wishId, wishText, noteElement) {
    if (!wishId) return;
    pendingDeleteWishId = wishId;
    pendingDeleteWishNode = noteElement || null;
    const previewText = String(wishText || "").trim();
    $("#delete-wish-preview").textContent = previewText ? `"${previewText.slice(0, 60)}${previewText.length > 60 ? "..." : ""}"` : "Pesan wish";
    const dialog = $("#delete-wish-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  function closeDeleteWishDialog() {
    pendingDeleteWishId = "";
    pendingDeleteWishNode = null;
    const dialog = $("#delete-wish-dialog");
    if (dialog.open) dialog.close();
  }

  async function confirmDeleteWish() {
    const wishId = pendingDeleteWishId;
    const node = pendingDeleteWishNode;
    if (!wishId) return closeDeleteWishDialog();
    const confirmButton = $("#confirm-delete-wish");
    confirmButton.disabled = true;
    confirmButton.textContent = "Menghapus...";
    try {
      await api.deleteWish(wishId);
      closeDeleteWishDialog();
      if (node) {
        node.classList.add("is-removing");
        window.setTimeout(() => {
          node.remove();
          const inbox = $("#wish-inbox");
          if (inbox && !inbox.querySelector(".wish-note")) {
            inbox.innerHTML = '<div class="empty-inbox"><strong>Belum ada wish</strong><p>Nanti pesan pertama akan muncul seperti secarik catatan kecil di sini.</p></div>';
          }
        }, 250);
      } else {
        loadWishes();
      }
    } catch (error) {
      alert(`Gagal menghapus wish: ${error.message}`);
      closeDeleteWishDialog();
    } finally {
      confirmButton.disabled = false;
      confirmButton.textContent = "Ya, hapus wish";
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
      return `/gift/index.html?${params}`;
    }
    const suffix = cacheBust ? `&t=${encodeURIComponent(cacheBust)}` : "";
    return `/gift/${encodeURIComponent(projectId)}?preview=1${suffix}`;
  }

  function giftUrl() {
    return isLocalHost
      ? `${location.origin}/gift/index.html?project=${encodeURIComponent(projectId)}`
      : `${location.origin}/gift/${encodeURIComponent(projectId)}`;
  }

  function drawHeartQr(model, palette) {
    const size = 720;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.className = "heart-qr-canvas";
    const context = canvas.getContext("2d");
    context.fillStyle = palette.paper;
    context.fillRect(0, 0, size, size);

    const moduleCount = model.getModuleCount();
    const moduleSize = Math.max(6, Math.floor(390 / (moduleCount + 8)));
    const qrSize = (moduleCount + 8) * moduleSize;
    const quietX = Math.round((size - qrSize) / 2);
    const quietY = 190;

    const heart = new Path2D();
    heart.moveTo(360, 682);
    heart.bezierCurveTo(300, 622, 78, 474, 72, 252);
    heart.bezierCurveTo(68, 108, 178, 45, 274, 82);
    heart.bezierCurveTo(326, 102, 351, 142, 360, 174);
    heart.bezierCurveTo(369, 142, 394, 102, 446, 82);
    heart.bezierCurveTo(542, 45, 652, 108, 648, 252);
    heart.bezierCurveTo(642, 474, 420, 622, 360, 682);
    heart.closePath();

    for (let y = 48; y <= 688; y += 11) {
      for (let x = 48; x <= 672; x += 11) {
        const insideQuietZone = x >= quietX - 8 && x <= quietX + qrSize + 8 && y >= quietY - 8 && y <= quietY + qrSize + 8;
        if (!insideQuietZone && context.isPointInPath(heart, x, y)) {
          context.beginPath();
          context.fillStyle = Math.round((x + y) / 11) % 5 === 0 ? palette.accent : palette.ink;
          context.arc(x, y, 2.5, 0, Math.PI * 2);
          context.fill();
        }
      }
    }

    context.fillStyle = palette.paper;
    context.fillRect(quietX, quietY, qrSize, qrSize);
    const dataX = quietX + 4 * moduleSize;
    const dataY = quietY + 4 * moduleSize;
    context.fillStyle = palette.ink;
    for (let row = 0; row < moduleCount; row += 1) {
      for (let column = 0; column < moduleCount; column += 1) {
        if (!model.isDark(row, column)) continue;
        const x = dataX + column * moduleSize;
        const y = dataY + row * moduleSize;
        const finder = (row < 7 && column < 7) || (row < 7 && column >= moduleCount - 7) || (row >= moduleCount - 7 && column < 7);
        if (finder) {
          context.fillRect(x, y, moduleSize + .25, moduleSize + .25);
        } else {
          context.beginPath();
          context.arc(x + moduleSize / 2, y + moduleSize / 2, moduleSize * .43, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    return canvas;
  }

  function renderQr(url) {
    const target = $("#qr-code");
    target.replaceChildren();
    qrInstance = null;
    if (!window.QRCode) {
      target.textContent = "QR generator belum termuat. Refresh halaman untuk mencoba lagi.";
      return;
    }
    const probe = document.createElement("div");
    probe.hidden = true;
    target.appendChild(probe);
    qrInstance = new window.QRCode(probe, {
      text: url,
      width: 360,
      height: 360,
      colorDark: QR_PALETTES[qrPaletteKey].ink,
      colorLight: QR_PALETTES[qrPaletteKey].paper,
      correctLevel: window.QRCode.CorrectLevel.H
    });
    const model = qrInstance._oQRCode;
    if (model?.getModuleCount && model?.isDark) {
      const canvas = drawHeartQr(model, QR_PALETTES[qrPaletteKey]);
      target.replaceChildren(canvas);
    } else {
      probe.hidden = false;
    }
  }

  function updatePublishedResult(explicitUrl) {
    const published = draft.status === "published";
    const pending = published && hasUnpublishedChanges;
    const button = $("#publish-button");
    $("#publish-status").textContent = pending ? "CHANGES NOT LIVE" : published ? "PUBLISHED" : "DRAFT";
    $("#published-result").hidden = !published;
    button.classList.toggle("is-publishing", isPublishing);
    button.classList.toggle("is-live", published && !pending && !isPublishing);
    button.textContent = isPublishing
      ? "Mempublikasikan..."
      : pending ? "Publish perubahan" : published ? "Kado sudah live" : "Publish kado";
    button.disabled = isPublishing || (published && !pending);
    if (!published) return;
    const url = explicitUrl || giftUrl();
    $("#gift-url").value = url;
    $("#open-public-gift").href = url;
    const syncNote = $("#publish-sync-note");
    syncNote.dataset.state = pending ? "pending" : "live";
    syncNote.textContent = pending
      ? "Preview terbaru belum ada di link gift. Publish perubahan dahulu sebelum menyalin link atau QR."
      : "Link gift sudah memakai versi terbaru yang dipublish.";
    $("#copy-gift-url").disabled = pending;
    $("#download-qr").disabled = pending;
    $("#open-public-gift").classList.toggle("is-disabled", pending);
    $("#open-public-gift").setAttribute("aria-disabled", String(pending));
    renderQr(url);
  }

  function updateBackendThemeWarning() {
    const selectedTheme = $('input[name="themeId"]:checked')?.value || draft.themeId;
    $("#backend-theme-warning").hidden = workerSupportsThemes || selectedTheme === Project.DEFAULT_THEME_ID;
  }

  async function publishProject() {
    clearErrors();
    readForm();
    if (!workerSupportsThemes && draft.themeId !== Project.DEFAULT_THEME_ID) {
      updateBackendThemeWarning();
      const box = $("#publish-errors");
      box.textContent = "Tema Dubu & Dudu belum bisa dipublish karena Worker production belum schema v3.";
      box.hidden = false;
      return;
    }
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
    isPublishing = true;
    updatePublishedResult();
    try {
      const payload = await saveDraft("published");
      draft.status = "published";
      updatePublishedResult(payload.giftUrl);
    } catch (error) {
      const box = $("#publish-errors");
      box.textContent = error.message;
      box.hidden = false;
    } finally {
      isPublishing = false;
      updatePublishedResult();
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
      if (event.target.name === "themeId") updateBackendThemeWarning();
    });
    $("#next-step").addEventListener("click", () => goToStep(currentStep + 1));
    $("#previous-step").addEventListener("click", () => goToStep(currentStep - 1, { skipValidation: true }));
    $$("#step-list button").forEach(button => button.addEventListener("click", () => goToStep(Number(button.closest("li").dataset.stepTarget), { skipValidation: true })));
    $("#add-photo").addEventListener("click", addGalleryItem);
    $("#add-photo-floating").addEventListener("click", addGalleryItem);
    $("#close-delete-media").addEventListener("click", closeDeleteMediaDialog);
    $("#cancel-delete-media").addEventListener("click", closeDeleteMediaDialog);
    $("#confirm-delete-media").addEventListener("click", confirmDeleteGalleryItem);
    $("#delete-media-dialog").addEventListener("click", event => {
      if (event.target === event.currentTarget) closeDeleteMediaDialog();
    });
    $("#delete-media-dialog").addEventListener("close", () => { pendingDeleteMediaId = ""; });
    $("#close-delete-wish").addEventListener("click", closeDeleteWishDialog);
    $("#cancel-delete-wish").addEventListener("click", closeDeleteWishDialog);
    $("#confirm-delete-wish").addEventListener("click", confirmDeleteWish);
    $("#delete-wish-dialog").addEventListener("click", event => {
      if (event.target === event.currentTarget) closeDeleteWishDialog();
    });
    $("#delete-wish-dialog").addEventListener("close", () => { pendingDeleteWishId = ""; pendingDeleteWishNode = null; });
    $("#close-photo-crop").addEventListener("click", closePhotoCropper);
    $("#cancel-photo-crop").addEventListener("click", closePhotoCropper);
    $("#confirm-photo-crop").addEventListener("click", confirmPhotoCrop);
    $("#photo-crop-dialog").addEventListener("cancel", event => {
      event.preventDefault();
      closePhotoCropper();
    });
    $("#photo-crop-dialog").addEventListener("click", event => {
      if (event.target === event.currentTarget) closePhotoCropper();
    });
    $$('[data-crop-action]').forEach(button => button.addEventListener("click", () => {
      if (!photoCropper) return;
      if (button.dataset.cropAction === "reset") return resetPhotoCropper();
      const degrees = button.dataset.cropAction === "rotate-left" ? -90 : 90;
      photoCropper.getCropperImage()?.$rotate(`${degrees}deg`);
      cropRotation = (cropRotation + degrees) % 360;
    }));
    $("#cropper-zoom").addEventListener("input", event => {
      if (!photoCropper) return;
      const nextZoomValue = Number(event.target.value);
      photoCropper.getCropperImage()?.$zoom((nextZoomValue - cropZoomValue) / 100);
      cropZoomValue = nextZoomValue;
    });
    $$('[data-warm-preset]').forEach(button => button.addEventListener("click", () => {
      $("#warm-message").value = WARM_PRESETS[button.dataset.warmPreset] || "";
      $("#warm-count").textContent = String($("#warm-message").value.length);
      setError("warmWish", "");
      scheduleSave();
    }));
    $$('[data-letter-preset]').forEach(button => button.addEventListener("click", () => {
      const createPreset = LETTER_PRESETS[button.dataset.letterPreset];
      if (!createPreset) return;
      const preset = createPreset({
        recipient: $("#recipient").value.trim(),
        sender: $("#sender").value.trim()
      });
      $("#letter-greeting").value = preset.greeting;
      $("#letter-body").value = preset.paragraphs.join("\n\n");
      $("#letter-signoff").value = preset.signoff;
      $("#letter-count").textContent = String($("#letter-body").value.length);
      setError("greeting", "");
      setError("letter", "");
      setError("signoff", "");
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
      setPlaybackButton($("#studio-audio-toggle"), true);
      syncCatalogPlaybackButtons();
    });
    $("#studio-audio").addEventListener("pause", () => {
      setPlaybackButton($("#studio-audio-toggle"), false);
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
      if (hasUnpublishedChanges) return;
      await navigator.clipboard.writeText($("#gift-url").value);
      $("#copy-gift-url").textContent = "Copied";
      window.setTimeout(() => { $("#copy-gift-url").textContent = "Copy"; }, 1200);
    });
    $$('[data-qr-palette]').forEach(button => button.addEventListener("click", () => {
      qrPaletteKey = button.dataset.qrPalette;
      $$('[data-qr-palette]').forEach(option => option.classList.toggle("is-active", option === button));
      if (draft.status === "published") renderQr($("#gift-url").value || giftUrl());
    }));
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
      const [payload, health] = await Promise.all([api.getStudio(), api.getHealth().catch(() => null)]);
      workerSupportsThemes = Number(health?.schemaVersion || 0) >= Project.SCHEMA_VERSION
        && Array.isArray(health?.themeIds)
        && health.themeIds.includes("dubu-duu");
      draft = Project.normalizeProject(payload.project || payload, projectId);
      fillForm(draft);
      await loadCatalog();
      bindEvents();
      showStudio();
      updateBackendThemeWarning();
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
