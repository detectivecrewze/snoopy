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
    const response = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "Permintaan belum berhasil.");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function isMockEnabled(projectId) {
    const params = new URLSearchParams(location.search);
    return DEV_HOSTS.has(location.hostname) && (projectId === "cindy-demo" || params.get("mock") === "1");
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
      return jsonRequest("/api/upload", { method: "POST", headers: tokenHeaders(this.token), body });
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
