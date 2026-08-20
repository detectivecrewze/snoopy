import { cp, mkdir, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, "dist");

if (dirname(output) !== root || basename(output) !== "dist") {
  throw new Error("Output build harus tetap berada di folder dist project.");
}

const files = [
  "index.html",
  "app.js",
  "styles.css",
  "runtime-config.js"
];

const directories = [
  "shared",
  "studio",
  "admin",
  "assets/gifs",
  "assets/data",
  "assets/themes"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of files) {
  await cp(resolve(root, file), resolve(output, file));
}

for (const directory of directories) {
  await cp(resolve(root, directory), resolve(output, directory), { recursive: true });
}

await rm(resolve(output, "assets/gifs/README.md"), { force: true });
await rm(resolve(output, "assets/themes/dubu-duu/README.md"), { force: true });

console.log("Static Vercel output dibuat di dist/.");
