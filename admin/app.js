(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const secretKey = "snoopy-admin:secret";
  let adminSecret = sessionStorage.getItem(secretKey) || "";
  let projects = [];
  let searchTimer = null;
  let toastTimer = null;
  let pendingCreateKey = "";
  let pendingDeleteId = "";

  function apiBase() {
    const runtime = window.SNOOPY_RUNTIME?.apiBaseUrl?.trim();
    if (runtime) return runtime.replace(/\/$/, "");
    const meta = document.querySelector('meta[name="gift-api-base"]')?.content?.trim();
    return meta ? meta.replace(/\/$/, "") : "";
  }

  async function adminRequest(path, options = {}) {
    const response = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${adminSecret}`,
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "Permintaan admin belum berhasil.");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function showLogin(message = "") {
    $("#login-screen").hidden = false;
    $("#admin-app").hidden = true;
    $("#login-error").textContent = message;
  }

  function showDashboard() {
    $("#login-screen").hidden = true;
    $("#admin-app").hidden = false;
  }

  function toast(message) {
    const element = $("#toast");
    window.clearTimeout(toastTimer);
    element.textContent = message;
    element.hidden = false;
    toastTimer = window.setTimeout(() => { element.hidden = true; }, 2400);
  }

  async function copyText(value) {
    if (!value) throw new Error("Magic link untuk project ini tidak tersedia.");
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    toast("Link berhasil disalin.");
  }

  function formatDate(value) {
    if (!value) return "Belum ada";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function setStats(stats = {}) {
    $("#stat-total").textContent = String(stats.total || 0);
    $("#stat-draft").textContent = String(stats.draft || 0);
    $("#stat-published").textContent = String(stats.published || 0);
    $("#stat-archived").textContent = String(stats.archived || 0);
  }

  function closeMenus(except = null) {
    $$(".action-menu").forEach(menu => { if (menu !== except) menu.hidden = true; });
  }

  function renderProjects() {
    const grid = $("#project-grid");
    const template = $("#project-card-template");
    grid.replaceChildren();
    $("#empty-projects").hidden = projects.length > 0;

    projects.forEach(project => {
      const card = template.content.firstElementChild.cloneNode(true);
      card.dataset.projectId = project.projectId;
      card.dataset.status = project.status;
      $(".status-pill", card).textContent = project.status;
      $(".project-id", card).textContent = project.projectId;
      $(".project-recipient", card).textContent = project.recipient || "Belum diisi";
      $(".project-sender", card).textContent = project.sender || "Belum diisi";
      $(".project-updated", card).textContent = formatDate(project.updatedAt);
      $(".project-photos", card).textContent = String(project.galleryCount || 0);
      $(".project-source", card).textContent = project.source || "manual";

      const copyButton = $(".copy-studio", card);
      const studioLink = $(".open-studio", card);
      copyButton.disabled = !project.studioUrl;
      studioLink.classList.toggle("is-disabled", !project.studioUrl);
      studioLink.href = project.studioUrl || "#";
      copyButton.addEventListener("click", () => copyText(project.studioUrl).catch(error => toast(error.message)));

      const menu = $(".action-menu", card);
      $(".more-button", card).addEventListener("click", event => {
        event.stopPropagation();
        const nextHidden = !menu.hidden;
        closeMenus(menu);
        menu.hidden = nextHidden;
      });
      const giftLink = $(".menu-open-gift", card);
      giftLink.href = project.giftUrl;
      giftLink.classList.toggle("is-disabled", project.status !== "published");
      giftLink.addEventListener("click", event => { if (project.status !== "published") event.preventDefault(); });
      const archiveButton = $(".menu-archive", card);
      archiveButton.textContent = project.status === "archived" ? "Restore project" : "Archive project";
      archiveButton.addEventListener("click", () => updateProjectStatus(project, project.status === "archived" ? "restore" : "archive"));
      $(".menu-delete", card).addEventListener("click", () => openDeleteDialog(project.projectId));
      grid.appendChild(card);
    });
  }

  async function loadProjects(options = {}) {
    $("#loading-projects").hidden = false;
    $("#project-grid").hidden = true;
    $("#empty-projects").hidden = true;
    const search = $("#project-search").value.trim();
    const status = $("#status-filter").value;
    const query = new URLSearchParams({ status, limit: "100" });
    if (search) query.set("search", search);
    try {
      const payload = await adminRequest(`/api/admin/projects?${query}`);
      projects = Array.isArray(payload.projects) ? payload.projects : [];
      setStats(payload.stats);
      renderProjects();
      if (!options.silent) toast(`${payload.totalMatched ?? projects.length} project ditemukan.`);
    } catch (error) {
      if (error.status === 403) {
        sessionStorage.removeItem(secretKey);
        adminSecret = "";
        showLogin("Admin secret tidak valid atau sudah diganti.");
      } else {
        toast(error.message);
      }
    } finally {
      $("#loading-projects").hidden = true;
      $("#project-grid").hidden = false;
    }
  }

  async function login(event) {
    event.preventDefault();
    const secret = $("#admin-secret").value.trim();
    if (!secret) return;
    const button = $("#login-form button");
    button.disabled = true;
    $("#login-error").textContent = "";
    adminSecret = secret;
    try {
      await adminRequest("/api/admin/projects?limit=1");
      sessionStorage.setItem(secretKey, adminSecret);
      showDashboard();
      await loadProjects({ silent: true });
    } catch (error) {
      adminSecret = "";
      $("#login-error").textContent = error.status === 403 ? "Admin secret tidak cocok." : error.message;
    } finally {
      button.disabled = false;
    }
  }

  function openCreateDialog() {
    pendingCreateKey = `manual-${crypto.randomUUID()}`;
    $("#create-recipient").value = "";
    $("#create-sender").value = "";
    $("#create-birthday").value = "";
    $("#create-error").textContent = "";
    $("#create-modal").showModal();
  }

  async function createProject() {
    const button = $("#create-project");
    button.disabled = true;
    button.textContent = "Membuat project...";
    $("#create-error").textContent = "";
    const initial = window.GiftProject.emptyProject("pending-project");
    initial.identity.recipient = $("#create-recipient").value.trim();
    initial.identity.sender = $("#create-sender").value.trim();
    initial.identity.birthdayDate = $("#create-birthday").value;
    try {
      const result = await adminRequest("/api/admin/projects", {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: pendingCreateKey, project: initial })
      });
      $("#create-modal").close();
      $("#created-studio-url").value = result.studioUrl;
      $("#open-created-studio").href = result.studioUrl;
      $("#result-modal").showModal();
      await loadProjects({ silent: true });
    } catch (error) {
      $("#create-error").textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Generate magic link";
    }
  }

  async function updateProjectStatus(project, action) {
    closeMenus();
    try {
      await adminRequest(`/api/admin/projects/${encodeURIComponent(project.projectId)}`, {
        method: "PATCH",
        body: JSON.stringify({ action })
      });
      toast(action === "archive" ? "Project diarsipkan." : "Project dipulihkan.");
      await loadProjects({ silent: true });
    } catch (error) {
      toast(error.message);
    }
  }

  function openDeleteDialog(projectId) {
    closeMenus();
    pendingDeleteId = projectId;
    $("#delete-project-label").textContent = projectId;
    $("#delete-confirmation").value = "";
    $("#delete-error").textContent = "";
    $("#confirm-delete").disabled = true;
    $("#delete-modal").showModal();
  }

  async function deleteProject() {
    if ($("#delete-confirmation").value.trim() !== pendingDeleteId) return;
    const button = $("#confirm-delete");
    button.disabled = true;
    button.textContent = "Menghapus...";
    try {
      const result = await adminRequest(`/api/admin/projects/${encodeURIComponent(pendingDeleteId)}`, { method: "DELETE" });
      $("#delete-modal").close();
      toast(`${result.projectId} dan seluruh datanya sudah dihapus.`);
      await loadProjects({ silent: true });
    } catch (error) {
      $("#delete-error").textContent = error.message;
    } finally {
      button.textContent = "Hapus permanen";
      button.disabled = $("#delete-confirmation").value.trim() !== pendingDeleteId;
    }
  }

  function bindEvents() {
    $("#login-form").addEventListener("submit", login);
    $("#logout").addEventListener("click", () => {
      sessionStorage.removeItem(secretKey);
      adminSecret = "";
      $("#admin-secret").value = "";
      showLogin();
    });
    $("#refresh-projects").addEventListener("click", () => loadProjects());
    $("#project-search").addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => loadProjects({ silent: true }), 320);
    });
    $("#status-filter").addEventListener("change", () => loadProjects({ silent: true }));
    $("#open-create-modal").addEventListener("click", openCreateDialog);
    $("#create-project").addEventListener("click", createProject);
    $("#close-result").addEventListener("click", () => $("#result-modal").close());
    $("#copy-created-link").addEventListener("click", () => copyText($("#created-studio-url").value));
    $("#delete-confirmation").addEventListener("input", event => { $("#confirm-delete").disabled = event.target.value.trim() !== pendingDeleteId; });
    $("#confirm-delete").addEventListener("click", deleteProject);
    document.addEventListener("click", () => closeMenus());
  }

  async function initialize() {
    bindEvents();
    if (!adminSecret) return showLogin();
    showDashboard();
    await loadProjects({ silent: true });
  }

  initialize();
})();
