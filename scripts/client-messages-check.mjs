// Self-check for the workspace's client messages: npm run client-messages-check
//
// The workspace sends the browser only the message namespaces its client
// components use: the shell's on every page, plus those of the section on
// screen (`src/i18n/workspace-messages.ts`). This follows the imports from
// every workspace route into the client components it renders and fails when
// one of them asks for a namespace its section does not send.
//
// A section is set by `<WorkspaceDocument section="…">` (the root layout and
// everything under it), by `<ClientMessages section="…">` in a layout (every
// route below that layout, not the layout's own markup) or in a page (that page).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SECTION_NAMESPACES, SHELL_NAMESPACES } from "../src/i18n/workspace-messages.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
/** The surfaces rendered inside `WorkspaceDocument`. */
const ENTRY_DIRS = ["app/app", "app/admin", "app/login", "app/invite"].map((dir) => path.join(SRC, dir));
const ROUTE_FILE = /[\\/](page|layout|loading|error|not-found|template|default)\.tsx$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT = /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const NAMESPACE = /useTranslations\(\s*["']([^"']+)["']\s*\)/g;
const UNNAMED = /useTranslations\(\s*\)|useTranslations\(\s*[^"'\s)]/;
const isClient = (source) => /^\s*["']use client["']/.test(source);
const rel = (file) => path.relative(ROOT, file);
const problems = [];

/** Namespaces the client components reachable from `file` ask for, with a file that asks for each. */
function clientNamespaces(file) {
  const used = new Map();
  const seen = new Set();
  const queue = [[file, false]];
  while (queue.length) {
    const [current, inClient] = queue.pop();
    const source = readFileSync(current, "utf8");
    const client = inClient || isClient(source);
    const key = `${current}:${client}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (client) {
      for (const [, namespace] of source.matchAll(NAMESPACE)) if (!used.has(namespace)) used.set(namespace, current);
      if (UNNAMED.test(source)) problems.push(`${rel(current)} calls useTranslations without a literal namespace`);
    }
    for (const [, a, b] of source.matchAll(IMPORT)) {
      const target = resolveImport(current, a ?? b);
      if (target) queue.push([target, client]);
    }
  }
  return used;
}

const routes = ENTRY_DIRS.flatMap(walk).filter((file) => ROUTE_FILE.test(file));

// Where each section starts.
const scopes = [];
for (const file of routes) {
  const source = readFileSync(file, "utf8");
  for (const [, tag, section] of source.matchAll(/<(WorkspaceDocument|ClientMessages)\s+section="([^"]+)"/g)) {
    if (!(section in SECTION_NAMESPACES)) problems.push(`${rel(file)} names an unknown section "${section}"`);
    const layout = /[\\/]layout\.tsx$/.test(file);
    scopes.push({ file, section, dir: layout ? path.dirname(file) : null, self: !layout || tag === "WorkspaceDocument" });
  }
}

/** The section a route file renders in: the innermost scope that covers it. */
function sectionOf(file) {
  const own = scopes.find((scope) => scope.file === file && scope.self);
  if (own) return own.section;
  let best = null;
  for (const scope of scopes) {
    if (!scope.dir || scope.file === file) continue;
    if (!file.startsWith(scope.dir + path.sep)) continue;
    if (!best || scope.dir.length > best.dir.length) best = scope;
  }
  return best?.section ?? null;
}

const covers = (list, namespace) => list.some((listed) => namespace === listed || namespace.startsWith(`${listed}.`));
const usedAnywhere = new Set();
for (const file of routes) {
  const section = sectionOf(file);
  const allowed = section ? [...SHELL_NAMESPACES, ...SECTION_NAMESPACES[section]] : SHELL_NAMESPACES;
  for (const [namespace, user] of clientNamespaces(file)) {
    usedAnywhere.add(namespace);
    if (!covers(allowed, namespace)) {
      problems.push(
        `${rel(file)} renders ${rel(user)}, which reads "${namespace}"; ` +
          (section ? `add it to SECTION_NAMESPACES.${section}` : "give the route a section or add it to SHELL_NAMESPACES"),
      );
    }
  }
}

for (const [section, list] of Object.entries(SECTION_NAMESPACES)) {
  if (!scopes.some((scope) => scope.section === section)) problems.push(`section "${section}" is never rendered`);
  const unused = list.filter((listed) => ![...usedAnywhere].some((namespace) => covers([listed], namespace)));
  if (unused.length) console.log(`SECTION_NAMESPACES.${section} lists namespaces no client component reads: ${unused.join(", ")}`);
}

if (problems.length) {
  console.error(`${problems.length} problem(s):\n- ${[...new Set(problems)].join("\n- ")}`);
  process.exit(1);
}
console.log(`${routes.length} workspace routes checked: every client component's messages are sent with its section.`);
