import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(root, "dist", "public"), { recursive: true });
await copyFile(resolve(root, "public", "coaching-widget.html"), resolve(root, "dist", "public", "coaching-widget.html"));
await copyFile(resolve(root, "schema.sql"), resolve(root, "dist", "schema.sql"));
