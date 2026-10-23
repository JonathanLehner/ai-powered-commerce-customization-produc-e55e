import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AbstractIntlMessages } from "next-intl";
import type { Locale } from "./locales";

/**
 * A locale's interface messages, read at run time instead of being bundled.
 *
 * Bundled, the nine message files were copied into the Worker several times
 * over and made up a large share of its upload size. On the Worker they are
 * read from the static assets (`scripts/worker-data.mjs` copies them there);
 * under Node (`next build`, `next dev`) straight from `messages/`.
 */
export const WORKER_MESSAGES_PATH = "/_worker-data/messages/";

type Messages = AbstractIntlMessages;

interface AssetsBinding {
  fetch(input: string): Promise<Response>;
}

/** Parsed once per isolate; the files only change with a deploy. */
const loaded = new Map<Locale, Promise<Messages>>();

export function loadMessages(locale: Locale): Promise<Messages> {
  let messages = loaded.get(locale);
  if (!messages) {
    messages = read(locale);
    messages.catch(() => loaded.delete(locale));
    loaded.set(locale, messages);
  }
  return messages;
}

async function read(locale: Locale): Promise<Messages> {
  if (globalThis.navigator?.userAgent === "Cloudflare-Workers") {
    const assets = (getCloudflareContext().env as unknown as { ASSETS?: AssetsBinding }).ASSETS;
    if (!assets) throw new Error("The ASSETS binding is not configured");
    const response = await assets.fetch(`https://assets.local${WORKER_MESSAGES_PATH}${locale}.json`);
    if (!response.ok) throw new Error(`Messages for "${locale}" are missing from the static assets (${response.status})`);
    return (await response.json()) as Messages;
  }
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  return JSON.parse(await readFile(path.join(process.cwd(), "messages", `${locale}.json`), "utf8")) as Messages;
}
