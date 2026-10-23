// Copies the interface messages into the Worker's static assets, where
// src/i18n/load-messages.ts reads them at run time: run by wrangler before it
// bundles (see `build` in wrangler.jsonc), after the OpenNext build.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "messages");
// Keep in step with WORKER_MESSAGES_PATH in src/i18n/load-messages.ts.
const TARGET = path.join(ROOT, ".open-next", "assets", "_worker-data", "messages");

mkdirSync(TARGET, { recursive: true });
const files = readdirSync(SOURCE).filter((name) => name.endsWith(".json"));
for (const name of files) copyFileSync(path.join(SOURCE, name), path.join(TARGET, name));
console.log(`worker-data: copied ${files.length} message files into the static assets`);
