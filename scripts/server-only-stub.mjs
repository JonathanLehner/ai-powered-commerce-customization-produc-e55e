// Import hook for checks that load server modules which also use next-intl's
// shared translator. Under the react-server condition next-intl resolves to a
// build that needs React's server bundle, so those checks run as plain Node
// instead, and "server-only", which refuses to load outside it, becomes an
// empty module.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
        return next(specifier, context);
      }
    `),
);
