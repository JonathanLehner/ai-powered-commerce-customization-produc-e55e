import { pathToFileURL } from "node:url";
import path from "node:path";

const SRC = pathToFileURL(path.join(process.cwd(), "src") + path.sep).href;

export async function resolve(specifier, context, nextResolve) {
  const wanted = specifier.startsWith("@/") ? new URL(specifier.slice(2), SRC).href : specifier;
  try {
    return await nextResolve(wanted, context);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    // ".js" as well as ".ts": a package without an "exports" map — Next itself —
    // publishes "next/server" as a plain file that ESM will not find on its own.
    try {
      return await nextResolve(`${wanted}.ts`, context);
    } catch (tsError) {
      if (tsError?.code !== "ERR_MODULE_NOT_FOUND") throw tsError;
      return nextResolve(`${wanted}.js`, context);
    }
  }
}
