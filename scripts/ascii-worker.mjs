// Escapes every non-ASCII character in the Worker's server code: run by
// wrangler before it bundles (see `build` in wrangler.jsonc).
//
// V8 keeps a script's source in the isolate's heap, as one byte per character
// when the source is all Latin-1 and two bytes otherwise. A few hundred
// characters such as "ä" or a curly quote in regular expressions and comments
// made the whole 50 MB bundle a two-byte string of over 100 MB, against the
// Worker's 128 MB memory limit, so requests ran out of memory ("error code:
// 1102"). Written as \uXXXX escapes they mean the same in string, template and
// regular-expression literals, in identifiers and in comments.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", ".open-next");
/** Served to browsers as files, not loaded into the Worker. */
const SKIP = new Set([path.join(ROOT, "assets"), path.join(ROOT, "cache")]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (SKIP.has(full)) return [];
    return statSync(full).isDirectory() ? walk(full) : /\.(m?js|cjs)$/.test(name) ? [full] : [];
  });
}

const escape = (char) =>
  [...char]
    .flatMap((c) => {
      const code = c.codePointAt(0);
      if (code <= 0xffff) return [code];
      const offset = code - 0x10000;
      return [0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)];
    })
    .map((unit) => `\\u${unit.toString(16).padStart(4, "0")}`)
    .join("");

let files = 0;
let characters = 0;
for (const file of walk(ROOT)) {
  const source = readFileSync(file, "utf8");
  if (!/[^\x00-\x7f]/.test(source)) continue;
  let count = 0;
  const ascii = source.replace(/[^\x00-\x7f]/gu, (char) => {
    count += 1;
    return escape(char);
  });
  writeFileSync(file, ascii);
  files += 1;
  characters += count;
}
console.log(`ascii-worker: escaped ${characters} non-ASCII characters in ${files} files`);
