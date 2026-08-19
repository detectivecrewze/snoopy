"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function serveStatic(response, pathname) {
  let requested = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (pathname === "/" || /^\/gift\/[a-z0-9][a-z0-9-]{2,63}\/?$/i.test(pathname)) requested = "index.html";
  if (/^\/studio(?:\/[a-z0-9][a-z0-9-]{2,63})?\/?$/i.test(pathname)) requested = "studio/index.html";
  if (/^\/admin\/?$/i.test(pathname)) requested = "admin/index.html";
  const filePath = path.resolve(ROOT, requested);
  const privateFiles = new Set(["server.js", "package.json", "package-lock.json"]);
  const blocked = requested.startsWith(".") || requested.startsWith("api/") || requested.startsWith("tests/") || privateFiles.has(requested);
  if (blocked || !filePath.startsWith(`${ROOT}${path.sep}`)) return sendJson(response, 404, { error: "Not found." });

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) return sendJson(response, 404, { error: "Not found." });
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": [".html", ".js", ".css"].includes(extension) ? "no-cache" : "public, max-age=604800",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "SAMEORIGIN"
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Run the Cloudflare Worker for production API routes." });
    } else {
      serveStatic(response, url.pathname);
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, error.statusCode || 500, { error: error.statusCode ? error.message : "Something went wrong." });
  }
});

server.listen(PORT, () => {
  console.log(`Birthday gift ready at http://localhost:${PORT}`);
  console.log(`Development gift: http://localhost:${PORT}/gift/cindy-demo?mock=1`);
  console.log(`Development studio: http://localhost:${PORT}/studio/cindy-demo?mock=1#token=demo-token`);
});
