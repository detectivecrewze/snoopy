(function (root) {
  "use strict";

  const fixtureUrl = "/fixtures/sample.json";
  const projectKey = id => `snoopy-studio:project:${id}`;
  const studioDraftKey = id => `snoopy-studio:draft:${id}`;
  const wishesKey = id => `snoopy-studio:wishes:${id}`;

  function wait(value, delay = 120) {
    return new Promise(resolve => window.setTimeout(() => resolve(value), delay));
  }

  async function getFixture() {
    const response = await fetch(fixtureUrl, { cache: "no-store" });
    if (!response.ok) throw Object.assign(new Error("Fixture development tidak ditemukan."), { status: 404 });
    return response.json();
  }

  async function getProject(id) {
    const stored = localStorage.getItem(projectKey(id));
    return stored ? JSON.parse(stored) : getFixture();
  }

  function requireToken(token) {
    if (!token) throw Object.assign(new Error("Magic link studio tidak valid."), { status: 401 });
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("File tidak dapat dibaca."));
      reader.readAsDataURL(file);
    });
  }

  root.GiftMockApi = {
    async getPublicGift(id) {
      const project = await getProject(id);
      if (project.status !== "published") throw Object.assign(new Error("Kado belum dipublikasikan."), { status: 404 });
      return wait({ project: root.GiftProject.normalizeProject(project, id), mock: true });
    },
    async getStudio(id, token) {
      requireToken(token);
      const published = await getProject(id);
      const savedDraft = localStorage.getItem(studioDraftKey(id));
      const project = root.GiftProject.normalizeProject(savedDraft ? JSON.parse(savedDraft) : published, id);
      return wait({ project, mock: true });
    },
    async saveStudio(id, token, input, status) {
      requireToken(token);
      const published = await getProject(id);
      const studioStatus = status === "published" ? "published" : published.status === "published" ? "published" : "draft";
      const project = root.GiftProject.normalizeProject({ ...input, status: studioStatus }, id);
      const now = new Date().toISOString();
      project.updatedAt = now;
      project.createdAt ||= now;
      if (status === "published") project.publishedAt ||= now;
      if (status === "published") {
        localStorage.setItem(projectKey(id), JSON.stringify(project));
        localStorage.removeItem(studioDraftKey(id));
      } else {
        localStorage.setItem(studioDraftKey(id), JSON.stringify(project));
      }
      return wait({ project, giftUrl: `${location.origin}/gift/${id}`, mock: true });
    },
    async upload(id, token, file, kind) {
      requireToken(token);
      const url = await fileToDataUrl(file);
      return wait({ url, kind, mock: true });
    },
    async getWishes(id, token) {
      requireToken(token);
      const wishes = JSON.parse(localStorage.getItem(wishesKey(id)) || "[]");
      return wait({ wishes, mock: true });
    },
    async deleteWish(id, token, wishId) {
      requireToken(token);
      const wishes = JSON.parse(localStorage.getItem(wishesKey(id)) || "[]");
      const nextWishes = wishes.filter(entry => entry.id !== wishId);
      localStorage.setItem(wishesKey(id), JSON.stringify(nextWishes));
      return wait({ deleted: true, wishId, mock: true });
    },
    async submitWish(id, wish, recipient) {
      const wishes = JSON.parse(localStorage.getItem(wishesKey(id)) || "[]");
      const entry = { id: root.GiftProject.makeId("wish"), wish, recipient, createdAt: new Date().toISOString() };
      wishes.unshift(entry);
      localStorage.setItem(wishesKey(id), JSON.stringify(wishes));
      return wait(entry);
    }
  };
})(window);
