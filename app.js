(() => {
  "use strict";

  const Project = window.GiftProject;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(location.hostname);
  const previewMode = new URLSearchParams(location.search).get("preview") === "1" && window.self !== window.top;

  let projectId = Project.projectIdFromPath(location.pathname, location.search);
  if (!projectId && isLocal && location.pathname === "/") {
    history.replaceState({}, "", "/gift/cindy-demo?mock=1");
    projectId = "cindy-demo";
  }

  let config = null;
  let api = null;
  let memoryIndex = 0;
  let memories = [];
  let typingTimer = null;
  let fullLetterMarkup = "";

  const screens = $$(".screen");
  const gate = $("#gate");
  const wishScreen = $("#wish-screen");
  const home = $("#home");
  const detailScreen = $("#detail-screen");
  const finale = $("#finale");
  const audio = $("#audio");

  function showScreen(target) {
    screens.forEach(screen => screen.classList.toggle("is-active", screen === target));
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  function showState(type, title, message) {
    document.body.classList.remove("app-ready");
    document.body.classList.add("app-loading");
    $("#app-state").dataset.state = type;
    $("#state-loader").hidden = type !== "loading";
    $("#state-eyebrow").textContent = type === "loading" ? "Sebentar ya..." : type === "not-found" ? "Kado belum ditemukan" : "Pitanya tersangkut";
    $("#state-title").textContent = title;
    $("#state-message").textContent = message;
    $("#state-retry").hidden = type === "not-found";
  }

  function revealGift() {
    document.body.classList.remove("app-loading");
    document.body.classList.add("app-ready");
    showScreen(gate);
  }

  function fillContent() {
    const identity = config.identity;
    $("#recipient-name").textContent = `${identity.recipient || "Birthday Star"}!`;
    $("#gate-recipient").textContent = identity.recipient || "you";
    $("#gate-sender").textContent = identity.sender || "with love";
    $("#birthday-date").textContent = Project.formatBirthdayDate(identity.birthdayDate);
    $("#home-subtitle").textContent = identity.subtitle;
    $("#wish-message").textContent = config.warmWish.message || "Semoga hari istimewamu dipenuhi kebahagiaan.";
    $("#wish-signature").textContent = config.warmWish.signature || identity.sender;
    $("#track-name").textContent = config.music.title || "Our Special Song";
    $("#artist-name").textContent = config.music.artist || "From me, to you";
    $("#letter-date").textContent = Project.formatBirthdayDate(identity.birthdayDate);
    $("#letter-heading").textContent = config.letter.greeting || `Dear ${identity.recipient},`;
    const singlePhoto = config.gallery.length === 1;
    $("#memory-card-title").textContent = singlePhoto ? "The Birthday Star" : "Our Memories";
    $("#memory-card-description").textContent = singlePhoto ? "the face behind this special day" : "tiny moments, big feelings";
    $("#memories-title").textContent = singlePhoto ? "The Birthday Star" : "Our Memories";
    $("#memories-subtitle").textContent = singlePhoto ? "A little portrait for the person behind this special day." : "A few little moments worth keeping.";
    document.title = `A Birthday Surprise for ${identity.recipient || "You"}`;
  }

  function loadGifSlots() {
    $$("[data-gif]").forEach(slot => {
      const source = Project.THEME_GIFS[slot.dataset.gif];
      const image = $("img", slot);
      if (!source || !image) return;
      image.onload = () => { image.hidden = false; };
      image.onerror = () => { image.hidden = true; };
      if (image.src !== new URL(source, location.origin).href) image.src = source;
    });
  }

  function burstConfetti(count = 70) {
    const layer = $("#confetti-layer");
    const colors = ["#e94238", "#f8d44c", "#7db7df", "#ffffff", "#171717"];
    for (let index = 0; index < count; index += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[index % colors.length];
      piece.style.setProperty("--duration", `${2.2 + Math.random() * 2.1}s`);
      piece.style.setProperty("--drift", `${-100 + Math.random() * 200}px`);
      piece.style.setProperty("--rotation", `${Math.random() * 180}deg`);
      piece.style.animationDelay = `${Math.random() * .35}s`;
      layer.appendChild(piece);
      window.setTimeout(() => piece.remove(), 4700);
    }
  }

  function renderMemory(index) {
    if (!memories.length) return;
    memoryIndex = (index + memories.length) % memories.length;
    const memory = memories[memoryIndex];
    const image = $("#memory-image");
    const placeholder = $("#photo-placeholder");
    $("#memory-title").textContent = memory.title || `Foto ${memoryIndex + 1}`;
    $("#memory-caption").textContent = memory.story || "Satu momen kecil yang layak disimpan.";
    placeholder.innerHTML = `FOTO KAMU<br><small>${String(memoryIndex + 1).padStart(2, "0")}</small>`;
    image.hidden = true;
    placeholder.hidden = false;
    image.onload = () => { image.hidden = false; placeholder.hidden = true; };
    image.onerror = () => { image.hidden = true; placeholder.hidden = false; };
    image.src = memory.imageUrl || "";
    $$("button", $("#memory-dots")).forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === memoryIndex));
    $("#memory-card").animate?.(
      [{ opacity: .2, transform: "translateX(12px) rotate(1deg)" }, { opacity: 1, transform: "rotate(-.7deg)" }],
      { duration: reducedMotion ? 1 : 320, easing: "ease-out" }
    );
  }

  function setupMemories() {
    memories = config.gallery.length ? config.gallery : [{ title: "Foto spesialmu", story: "", imageUrl: "" }];
    const memoryDots = $("#memory-dots");
    memoryDots.replaceChildren();
    $(".memory-stage").classList.toggle("is-single", memories.length <= 1);
    $("#memory-prev").hidden = memories.length <= 1;
    $("#memory-next").hidden = memories.length <= 1;
    memoryDots.hidden = memories.length <= 1;
    memories.forEach((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Tampilkan foto ${index + 1}`);
      dot.addEventListener("click", () => renderMemory(index));
      memoryDots.appendChild(dot);
    });
    renderMemory(0);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  }

  function updatePlayerState() {
    const playing = !audio.paused && !audio.ended;
    $("#play-icon").textContent = playing ? "Ⅱ" : "▶";
    $("#play-button").setAttribute("aria-label", playing ? "Pause song" : "Play song");
    $("#record").classList.toggle("is-playing", playing);
  }

  function setupMusicSource() {
    audio.pause();
    audio.preload = "auto";
    audio.src = config.music.audioUrl || "";
    if (audio.src) audio.load();
    $("#external-song").hidden = true;
    $("#music-help").textContent = config.music.audioUrl ? "Your birthday soundtrack is ready." : "Lagu belum dipilih.";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  }

  function buildLetter() {
    const greeting = config.letter.greeting || `Dear ${config.identity.recipient},`;
    const paragraphs = config.letter.paragraphs || [];
    const signoff = config.letter.signoff || config.identity.sender;
    fullLetterMarkup = `<strong>${escapeHtml(greeting)}</strong>${paragraphs.map(value => `\n\n${escapeHtml(value)}`).join("")}\n\n<em>${escapeHtml(signoff)}</em>`;
  }

  function typeLetter() {
    const output = $("#letter-copy");
    const plainText = fullLetterMarkup.replace(/<[^>]*>/g, "");
    let index = 0;
    window.clearInterval(typingTimer);
    output.textContent = "";
    $("#skip-typing").hidden = false;
    $("#finish-button").hidden = true;
    const finish = () => {
      window.clearInterval(typingTimer);
      typingTimer = null;
      output.innerHTML = fullLetterMarkup;
      $("#skip-typing").hidden = true;
      $("#finish-button").hidden = false;
    };
    if (reducedMotion) return finish();
    typingTimer = window.setInterval(() => {
      output.textContent = plainText.slice(0, ++index);
      if (index >= plainText.length) finish();
    }, 25);
    $("#skip-typing").onclick = finish;
  }

  function applyProject(input) {
    config = Project.normalizeProject(input, projectId);
    if (!api && previewMode) api = { submitWish: async wish => ({ wish }) };
    fillContent();
    loadGifSlots();
    setupMemories();
    setupMusicSource();
    buildLetter();
    revealGift();
  }

  async function loadProject() {
    if (!projectId || !Project.PROJECT_ID_PATTERN.test(projectId)) {
      showState("not-found", "Kado ini tidak ada", "Periksa kembali link yang kamu terima. Mungkin ada satu bagian yang terlewat.");
      return;
    }
    if (previewMode) {
      showState("loading", "Menunggu preview studio", "Perubahanmu akan muncul di sini secara langsung.");
      window.addEventListener("message", event => {
        if (event.origin !== location.origin || event.data?.type !== "SNOOPY_PREVIEW_PROJECT") return;
        applyProject(event.data.project);
      });
      window.parent.postMessage({ type: "SNOOPY_PREVIEW_READY", projectId }, location.origin);
      return;
    }

    api = new window.GiftApi(projectId);
    showState("loading", "Menyiapkan kejutan kecilmu", "Kami sedang membuka pita dan merapikan semua kejutan di dalamnya.");
    try {
      const payload = await api.getPublicGift();
      applyProject(payload.project || payload);
    } catch (error) {
      if (error.status === 404) {
        showState("not-found", "Kado ini belum bisa dibuka", "Kadonya mungkin masih disiapkan atau link yang kamu buka kurang tepat.");
      } else {
        showState("error", "Kadonya belum berhasil dibuka", "Koneksi sedang kurang bersahabat. Coba buka kembali dalam beberapa saat.");
      }
    }
  }

  $("#state-retry").addEventListener("click", () => location.reload());
  $("#start-btn").addEventListener("click", async () => {
    showScreen(config.settings.wishEnabled ? wishScreen : home);
    if (!config.music.audioUrl) return;
    audio.volume = .78;
    try { await audio.play(); } catch (_) { /* Browser may require a second interaction. */ }
  });

  const wishInput = $("#wish-input");
  const cakeButton = $("#cake-button");
  wishInput.addEventListener("input", () => {
    $("#wish-count").textContent = String(wishInput.value.length);
    $("#wish-status").textContent = "";
  });
  cakeButton.addEventListener("click", async () => {
    const wish = wishInput.value.trim();
    const status = $("#wish-status");
    if (wish.length < 3) {
      status.textContent = "Tulis harapanmu dulu. Beberapa kata jujur saja sudah cukup.";
      wishInput.focus();
      return;
    }
    cakeButton.disabled = true;
    wishInput.disabled = true;
    status.classList.add("is-loading");
    status.textContent = "Sedang mengirim harapanmu...";
    try {
      const result = await api.submitWish(wish, config.identity.recipient);
      $("#submitted-wish-text").textContent = result.wish || wish;
      status.textContent = "";
      $("#flame").classList.add("is-out");
      burstConfetti(55);
      window.setTimeout(() => {
        $("#wish-composer").classList.add("is-complete");
        $("#wish-reveal").classList.add("is-visible");
      }, reducedMotion ? 20 : 500);
    } catch (error) {
      status.classList.remove("is-loading");
      status.textContent = error.message || "Harapanmu belum terkirim. Coba lagi ya.";
      cakeButton.disabled = false;
      wishInput.disabled = false;
      wishInput.focus();
    }
  });

  $("#open-gift-btn").addEventListener("click", () => { burstConfetti(80); showScreen(home); });
  $$('[data-open-view]').forEach(button => {
    button.addEventListener("click", () => {
      const viewName = button.dataset.openView;
      $$(".detail-view").forEach(view => view.classList.toggle("is-visible", view.dataset.view === viewName));
      showScreen(detailScreen);
      if (viewName === "memories") renderMemory(memoryIndex);
      if (viewName === "letter") typeLetter();
    });
  });
  $("#back-button").addEventListener("click", () => showScreen(home));
  $("#memory-prev").addEventListener("click", () => renderMemory(memoryIndex - 1));
  $("#memory-next").addEventListener("click", () => renderMemory(memoryIndex + 1));

  audio.addEventListener("loadedmetadata", () => { $("#duration").textContent = formatTime(audio.duration); });
  audio.addEventListener("error", () => { $("#music-help").textContent = "Lagu belum dapat dimuat. Silakan coba beberapa saat lagi."; });
  audio.addEventListener("timeupdate", () => {
    $("#current-time").textContent = formatTime(audio.currentTime);
    $("#seek").value = audio.duration ? String((audio.currentTime / audio.duration) * 100) : "0";
  });
  audio.addEventListener("play", updatePlayerState);
  audio.addEventListener("pause", updatePlayerState);
  audio.addEventListener("ended", updatePlayerState);
  $("#play-button").addEventListener("click", async () => {
    try { audio.paused ? await audio.play() : audio.pause(); }
    catch (_) { $("#music-help").textContent = "Lagu belum dapat diputar. Coba tekan play sekali lagi."; }
  });
  $("#restart-button").addEventListener("click", () => { audio.currentTime = 0; });
  $("#seek").addEventListener("input", event => {
    if (audio.duration) audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
  });

  $("#finish-button").addEventListener("click", () => { finale.hidden = false; burstConfetti(100); });
  $("#finale-close").addEventListener("click", () => { finale.hidden = true; });
  $("#replay-button").addEventListener("click", () => {
    finale.hidden = true;
    window.clearInterval(typingTimer);
    $("#letter-copy").textContent = "";
    showScreen(gate);
  });

  loadProject();
})();
