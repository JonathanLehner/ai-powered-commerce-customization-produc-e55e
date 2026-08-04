// Import hook for the self-check scripts.
//
// The app's modules import each other the way TypeScript wants — "./countries",
// "@/lib/util" — which Node cannot resolve on its own even with type stripping
// switched on. This registers a resolver that fills in the ".ts" extension and
// the "@/" alias, so a check script can exercise the real module rather than a
// copy of it.
import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);
