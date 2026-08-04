// Self-check for shopper order-page access: npm run order-access-check
import assert from "node:assert/strict";
import { emailMatchesOrder, signOrderToken, verifyOrderToken } from "../src/lib/order-access.ts";

const token = await signOrderToken("str_1", "ORD-42871904");

// The link issued at checkout opens its own order and nothing else.
assert.equal(await verifyOrderToken("str_1", "ORD-42871904", token), true);
assert.equal(await verifyOrderToken("str_1", "ORD-42871911", token), false);
assert.equal(await verifyOrderToken("str_2", "ORD-42871904", token), false);

// No token, a guessed token, or a truncated one: closed.
assert.equal(await verifyOrderToken("str_1", "ORD-42871904", undefined), false);
assert.equal(await verifyOrderToken("str_1", "ORD-42871904", ""), false);
assert.equal(await verifyOrderToken("str_1", "ORD-42871904", token.slice(0, -1)), false);
assert.equal(await verifyOrderToken("str_1", "ORD-42871904", "x".repeat(token.length)), false);

// Email match ignores case and stray whitespace, nothing else.
assert.equal(emailMatchesOrder("Ada@example.com", " ada@EXAMPLE.com "), true);
assert.equal(emailMatchesOrder("ada@example.com", "ada@example.co"), false);

console.log("order-access-check ok");
