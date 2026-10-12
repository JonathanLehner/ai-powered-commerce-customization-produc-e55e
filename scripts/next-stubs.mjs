// Import hook for checks that run store operations outside a Next request:
// "next-intl/server" reads the messages files directly and "next/cache" does
// nothing, so an operation's translated refusals and its revalidation run as
// they would in the app. Use together with server-only-stub.mjs.
import { register } from "node:module";

const intl = new URL("./stubs/next-intl-server.mjs", import.meta.url).href;
const cache = new URL("./stubs/next-cache.mjs", import.meta.url).href;

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === "next-intl/server") return { url: ${JSON.stringify(intl)}, shortCircuit: true };
        if (specifier === "next/cache") return { url: ${JSON.stringify(cache)}, shortCircuit: true };
        return next(specifier, context);
      }
    `),
);
