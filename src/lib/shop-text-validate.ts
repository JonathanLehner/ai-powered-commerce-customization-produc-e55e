/**
 * Whether a store's wording of a built-in string can be shown. Kept apart from
 * `shop-text.ts` so the message parser stays out of the editor's bundle.
 */
import { TYPE, parse, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

function slots(message: string): Set<string> {
  const found = new Set<string>();
  (function walk(nodes: MessageFormatElement[]) {
    for (const node of nodes) {
      if (node.type === TYPE.argument || node.type === TYPE.number || node.type === TYPE.date || node.type === TYPE.time) {
        found.add(`{${node.value}}`);
      } else if (node.type === TYPE.select || node.type === TYPE.plural) {
        found.add(`{${node.value}}`);
        for (const option of Object.values(node.options)) walk(option.value);
      } else if (node.type === TYPE.tag) {
        found.add(`<${node.value}>`);
        walk(node.children);
      }
    }
  })(parse(message));
  return found;
}

/**
 * Why an override cannot be saved, or null when it can. It has to be a valid
 * message and may only use the placeholders the built-in string fills in,
 * because nothing else has a value at the moment it is shown.
 */
export function overrideProblem(builtIn: string, value: string): { kind: "invalid" } | { kind: "placeholder"; name: string } | null {
  let allowed: Set<string>;
  let used: Set<string>;
  try {
    allowed = slots(builtIn);
    used = slots(value);
  } catch {
    return { kind: "invalid" };
  }
  for (const name of used) if (!allowed.has(name)) return { kind: "placeholder", name };
  return null;
}
