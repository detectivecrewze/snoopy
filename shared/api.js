(function (root) {
  "use strict";

  const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

  function getApiBase() {
    const runtimeBase = root.SNOOPY_RUNTIME?.apiBaseUrl?.trim();
    if (runtimeBase) return runtimeBase.replace(/\/$/, "");
    const configured = document.querySelector('meta[name="gift-api-base"]')?.content?.trim();
    return configured ? configured.replace(/\/$/, "") : "";
  }

  async function jsonRequest(path, options = {}) {
    const { timeoutMs = 30000, ...requestOptions } = options;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`${getApiBase()}${path}`, {
        ...requestOptions,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(requestOptions.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
          ...(requestOptions.headers || {})
        }
      });
    } catch (cause) {
      const timedOut = cause?.name === "AbortError";
      const error = new Error(timedOut
        ? "Upload terlalu lama dan dihentikan. Periksa koneksi, Worker, dan binding R2."
        : "Tidak dapat terhubung ke API. Periksa koneksi dan konfigurasi CORS Worker.");
      error.cause = cause;
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Permintaan gagal dengan status HTTP ${response.status}.`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function isMockEnabled(projectId) {
    const params = new URLSearchParams(location.search);
    return DEV_HOSTS.has(location.hostname) && (projectId === "sample-demo" || params.get("mock") === "1");
  }

  function tokenHeaders(token) {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  class GiftApi {
    constructor(projectId, token = "") {
      this.projectId = projectId;
      this.token = token;
      this.mock = isMockEnabled(projectId) && root.GiftMockApi;
    }

    getPublicGift() {
      return this.mock
        ? this.mock.getPublicGift(this.projectId)
        : jsonRequest(`/api/gift/${encodeURIComponent(this.projectId)}`);
    }

    getHealth() {
      return this.mock
        ? Promise.resolve({ ok: true, schemaVersion: root.GiftProject?.SCHEMA_VERSION || 1, themeIds: Object.keys(root.GiftProject?.THEMES || {}) })
        : jsonRequest("/api/health");
    }

    getStudio() {
      return this.mock
        ? this.mock.getStudio(this.projectId, this.token)
        : jsonRequest(`/api/studio/${encodeURIComponent(this.projectId)}`, { headers: tokenHeaders(this.token) });
    }

    saveStudio(project, status = "draft") {
      return this.mock
        ? this.mock.saveStudio(this.projectId, this.token, project, status)
        : jsonRequest(`/api/studio/${encodeURIComponent(this.projectId)}`, {
            method: "PUT",
            headers: tokenHeaders(this.token),
            body: JSON.stringify({ project, status })
          });
    }

    upload(file, kind) {
      if (this.mock) return this.mock.upload(this.projectId, this.token, file, kind);
      const body = new FormData();
      body.append("projectId", this.projectId);
      body.append("kind", kind);
      body.append("file", file);
      return jsonRequest("/api/upload", { method: "POST", headers: tokenHeaders(this.token), body, timeoutMs: 60000 });
    }

    getWishes() {
      return this.mock
        ? this.mock.getWishes(this.projectId, this.token)
        : jsonRequest(`/api/wishes/${encodeURIComponent(this.projectId)}`, { headers: tokenHeaders(this.token) });
    }

    submitWish(wish, recipient) {
      return this.mock
        ? this.mock.submitWish(this.projectId, wish, recipient)
        : jsonRequest("/api/wishes", {
            method: "POST",
            body: JSON.stringify({ projectId: this.projectId, recipient, wish })
          });
    }
  }

  root.GiftApi = GiftApi;
})(window);
