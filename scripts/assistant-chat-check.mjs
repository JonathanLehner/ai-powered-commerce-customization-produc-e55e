// Self-check for the chat assistant's tool loop, with a stubbed model:
// npm run assistant-chat-check
//
// It asserts that:
// - the loop runs the operations the model calls, as the person, marked as done
//   via the assistant, feeds their results back and ends on the model's reply;
// - the person's role decides the tools offered and the calls that run: a
//   viewer, a role without the area, a read-only store and platform oversight
//   are refused even when the model names a tool it was not offered, and API
//   keys, webhooks, the agency and the person's account are never offered;
// - irreversible and shopper-facing calls (publishing, refunds, deletions,
//   emails, prices) wait for a confirmation showing their exact arguments, run
//   only when that confirmation is given, with those arguments, and are
//   declined by cancelling or by writing something new;
// - the confirmation says what a call does in the person's words ("15% off any
//   order with code WELCOME15, until the end of November 30, 2026", "Add German
//   to the storefront"), labels every other argument, and offers a preview and
//   a comparison before publishing;
// - API keys, webhooks, billing and the agency are refused as not available in
//   chat, with a link to where they are done, never blamed on the person's role;
// - each turn's checkpoint is named after the request that made it;
// - storefront draft edits run straight away after one checkpoint per turn,
//   and undo restores that checkpoint through the restore operation;
// - a change to the store is read again before the next call of the turn, so a
//   language enabled can be translated into straight away, and a failed
//   step keeps the reason the chat shows;
// - secrets in results never reach the model, and every real store operation
//   becomes a well-formed tool with labels in every workspace language.
import assert from "node:assert/strict";
import { z } from "zod";

const { API_OPERATIONS } = await import("../src/lib/api/operations.ts");
const { LOCALES } = await import("../src/i18n/locales.ts");
const labels = (await import("../src/lib/assistant/labels.json", { with: { type: "json" } })).default;
const { assistantScopes, confirmReasons, scopeGranted, redactSecrets } = await import("../src/lib/assistant/policy.ts");
const { currentVia } = await import("../src/lib/assistant/via.ts");
const engine = await import("../src/lib/assistant/engine.ts");
const { OperationError } = await import("../src/lib/operations/context.ts");
const { describeCall } = await import("../src/lib/assistant/describe.ts");
const { FIELD_LABELS } = await import("../src/lib/assistant/field-labels.ts");
const { createTranslator } = await import("use-intl/core");
const enMessages = (await import("../messages/en.json", { with: { type: "json" } })).default;

/* ------------------------------------------------------------ fake registry */

const ran = [];
function op(id, method, scope, tag, extra = {}) {
  return {
    id,
    method,
    path: `/${id}`,
    scope,
    tag,
    summary: `Summary of ${id}`,
    description: `Description of ${id}.`,
    input: extra.input ?? z.object({}),
    destructive: extra.destructive,
    run: async (ctx, input) => {
      ran.push({ id, actor: ctx.actor.id, store: ctx.store.id, input, via: currentVia() });
      if (extra.fail) throw new OperationError("conflict", "That section changed meanwhile.");
      return extra.result ?? { ok: true, id };
    },
  };
}

const OPERATIONS = [
  op("listStorefrontSections", "GET", "storefront:read", "Storefront", { result: { sections: [{ id: "hero1", type: "hero" }] } }),
  op("updateStorefrontSection", "PATCH", "storefront:write", "Storefront", {
    input: z.object({ sectionId: z.string(), fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }),
  }),
  op("restoreStorefrontVersion", "POST", "storefront:write", "Storefront", { input: z.object({ versionId: z.string() }) }),
  op("publishStorefront", "POST", "storefront:write", "Storefront", { input: z.object({ label: z.string().optional() }) }),
  op("refundOrder", "POST", "orders:write", "Orders", { input: z.object({ orderId: z.string(), amount: z.number() }), destructive: true }),
  op("createDiscount", "POST", "discounts:write", "Discounts", { input: z.object({ code: z.string(), value: z.number() }) }),
  op("deleteProduct", "DELETE", "products:write", "Products", { input: z.object({ productId: z.string() }), destructive: true }),
  op("createProduct", "POST", "products:write", "Products", { input: z.object({ catalogProductId: z.string() }) }),
  op("listProducts", "GET", "products:read", "Products"),
  op("createApiKey", "POST", "keys:write", "API keys", { result: { secret: "plk_live_should_never_show" } }),
  op("createBillingCheckoutLink", "POST", "agency:write", "Agency", { input: z.object({ plan: z.string() }) }),
  op("getWebhookEndpoint", "GET", "webhooks:read", "Webhooks"),
  op("getPayments", "GET", "store:read", "Store", { result: { account: "acct_1", webhookSecret: "whsec_123", apiKey: "sk_live_x", nested: [{ token: "t" }] } }),
];

const STORE = { id: "st_test", name: "Test store", agencyId: "ag_1" };
const ACTOR = { id: "usr_ana", name: "Ana" };

/** A model that answers from a script, recording what it was offered. */
function scripted(replies) {
  const seen = [];
  const model = async ({ messages, tools }) => {
    seen.push({ messages: structuredClone(messages), tools: tools.map((t) => t.function.name) });
    const next = replies.shift();
    assert.ok(next, "the model was called more often than scripted");
    return typeof next === "function" ? next(messages) : next;
  };
  return { model, seen, left: () => replies.length };
}

let callN = 0;
const call = (name, args = {}) => ({ id: `call_${++callN}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
const say = (text) => ({ content: text, toolCalls: [] });
const calls = (...list) => ({ content: null, toolCalls: list });

function harness(role, replies, options = {}) {
  const scopes = assistantScopes({ role, readOnly: options.readOnly ?? false, viaPlatform: options.viaPlatform ?? false });
  const events = [];
  const stub = scripted(replies);
  let checkpoints = 0;
  const deps = {
    model: stub.model,
    operations: OPERATIONS,
    ctx: { store: STORE, actor: ACTOR, locale: "en" },
    scopes,
    system: "system prompt",
    emit: (event) => events.push(event),
    label: (id) => ({ step: `Doing ${id}`, action: `Do ${id}` }),
    checkpoint: async () => {
      checkpoints += 1;
      return `ver_${checkpoints}`;
    },
  };
  const state = engine.emptyState(options.groups ?? ["Store", "Storefront", "Products", "Orders", "Discounts"]);
  return { deps, state, events, stub, scopes, checkpoints: () => checkpoints };
}

/* ------------------------------------------------------------ the tool loop */

{
  ran.length = 0;
  const h = harness("store_admin", [
    calls(call("list_storefront_sections")),
    calls(call("update_storefront_section", { sectionId: "hero1", fields: { tone: "dark" } }), call("update_storefront_section", { sectionId: "hero1", fields: { headline: "Our team" } })),
    say("The hero is darker now."),
  ]);
  await engine.sendMessage(h.state, h.deps, { text: "make the hero darker", attachments: ["https://assets.clawcorp.ai/team.jpg"] });

  assert.equal(h.stub.left(), 0, "three model rounds");
  assert.deepEqual(ran.map((r) => r.id), ["listStorefrontSections", "updateStorefrontSection", "updateStorefrontSection"]);
  assert.ok(ran.every((r) => r.actor === ACTOR.id && r.store === STORE.id), "operations run as the person, in their store");
  assert.ok(ran.every((r) => r.via === "assistant"), "operations are marked as run via the assistant");
  assert.deepEqual(ran[1].input, { sectionId: "hero1", fields: { tone: "dark" } }, "the model's arguments, through the schema");
  assert.equal(h.checkpoints(), 1, "one checkpoint per turn, before the first draft edit");
  assert.deepEqual(h.state.undo && h.state.undo.versionId, "ver_1");

  const second = h.stub.seen[1].messages;
  assert.equal(second[0].role, "system");
  assert.ok(second[1].content.includes("https://assets.clawcorp.ai/team.jpg"), "attachments reach the model");
  const toolResult = second.find((m) => m.role === "tool");
  assert.ok(toolResult.content.includes("hero1"), "results go back to the model");
  assert.ok(second.every((m) => !("ui" in m)), "chat-only fields stay out of the model's messages");

  const steps = h.events.filter((e) => e.type === "step");
  assert.deepEqual(steps.map((s) => s.status), ["running", "done", "running", "done", "running", "done"]);
  assert.equal(steps[2].label, "Doing updateStorefrontSection");
  assert.ok(h.events.some((e) => e.type === "changed" && e.storefront), "a storefront change is announced");
  assert.ok(h.events.some((e) => e.type === "undo" && e.available));
  assert.deepEqual(h.events.filter((e) => e.type === "text").map((e) => e.text), ["The hero is darker now."]);
  const last = h.state.messages.at(-1);
  assert.equal(last.role, "assistant");

  // A refused operation is reported to the model, which carries on.
  ran.length = 0;
  const failing = harness("store_admin", [calls(call("update_storefront_section", { sectionId: "x", fields: {} })), say("It did not work.")]);
  failing.deps.operations = OPERATIONS.map((o) =>
    o.id === "updateStorefrontSection" ? { ...o, run: async () => { throw new OperationError("conflict", "That section changed meanwhile."); } } : o,
  );
  await engine.sendMessage(failing.state, failing.deps, { text: "edit" });
  const refusedResult = failing.state.messages.find((m) => m.role === "tool");
  assert.ok(refusedResult.content.includes("That section changed meanwhile."));
  assert.equal(refusedResult.ui.status, "error");
  assert.equal(refusedResult.ui.message, "That section changed meanwhile.", "the reason is kept for the chat to show");
  assert.ok(
    failing.events.some((e) => e.type === "step" && e.status === "error" && e.message === "That section changed meanwhile."),
    "the reason is shown as the step fails",
  );

  // A change to the store (a language enabled) is seen by the next call of the same turn.
  ran.length = 0;
  const languages = harness("store_admin", [
    calls(call("update_languages", { languages: ["en", "de"] })),
    calls(call("update_storefront_section", { sectionId: "hero1", fields: { headline: "Hallo" } })),
    say("Done."),
  ]);
  let storeLocales = ["en"];
  languages.deps.operations = [
    ...OPERATIONS.map((o) =>
      o.id === "updateStorefrontSection"
        ? {
            ...o,
            run: async (ctx) => {
              if (!ctx.store.locales.includes("de")) throw new OperationError("invalid", "The store does not have de enabled.");
              return { ok: true };
            },
          }
        : o,
    ),
    op("updateLanguages", "PUT", "store:write", "Store", { input: z.object({ languages: z.array(z.string()) }) }),
  ];
  languages.deps.ctx = { ...languages.deps.ctx, store: { ...STORE, locales: storeLocales } };
  let refreshed = 0;
  languages.deps.refreshStore = async () => {
    refreshed += 1;
    storeLocales = ["en", "de"];
    languages.deps.ctx.store = { ...STORE, locales: storeLocales };
  };
  await engine.sendMessage(languages.state, languages.deps, { text: "translate into German" });
  assert.ok(languages.state.pending, "enabling a language waits for confirmation");
  await engine.confirmPending(languages.state, languages.deps, languages.state.pending.id);
  assert.equal(refreshed, 1, "the store is read again once after the change, not after draft edits");
  const translated = languages.state.messages.filter((m) => m.role === "tool").at(-1);
  assert.equal(translated.ui.status, "done", "the translation runs in the same turn that enabled the language");

  // Bad arguments never reach the operation.
  ran.length = 0;
  const bad = harness("store_admin", [calls(call("update_storefront_section", { sectionId: 4 })), say("Fixed.")]);
  await engine.sendMessage(bad.state, bad.deps, { text: "edit" });
  assert.equal(ran.length, 0);
  assert.ok(bad.state.messages.find((m) => m.role === "tool").content.includes("sectionId"));

  // The loop stops after MAX_ROUNDS.
  const endless = harness("store_admin", Array.from({ length: engine.MAX_ROUNDS }, () => calls(call("list_storefront_sections"))));
  await engine.sendMessage(endless.state, endless.deps, { text: "loop" });
  assert.equal(endless.state.messages.at(-1).ui.note, "stopped");

  // load_tools adds an area the person may use, and only such an area.
  const loading = harness("store_admin", [calls(call("load_tools", { areas: ["Webhooks", "Discounts"] })), say("Loaded.")], { groups: ["Store"] });
  await engine.sendMessage(loading.state, loading.deps, { text: "discounts" });
  assert.ok(loading.state.groups.includes("Discounts"));
  assert.ok(!loading.state.groups.includes("Webhooks"), "an area outside the person's scopes is not loaded");
  assert.ok(loading.stub.seen[1].tools.includes("create_discount"));
}

/* ---------------------------------------------------- permission enforcement */

{
  assert.deepEqual(assistantScopes({ role: "store_admin", readOnly: false, viaPlatform: true }), [], "platform oversight gets nothing");
  const admin = assistantScopes({ role: "store_admin", readOnly: false, viaPlatform: false });
  for (const area of ["keys", "webhooks", "agency", "account"]) {
    assert.ok(!admin.some((s) => s.startsWith(`${area}:`)), `${area} is never given to the assistant`);
  }
  assert.ok(admin.includes("storefront:write") && admin.includes("discounts:write") && admin.includes("orders:write"));
  const readOnly = assistantScopes({ role: "store_admin", readOnly: true, viaPlatform: false });
  assert.ok(readOnly.every((s) => s.endsWith(":read")), "a read-only store gives read scopes only");
  const viewer = assistantScopes({ role: "viewer", readOnly: false, viaPlatform: false });
  assert.ok(viewer.every((s) => s.endsWith(":read")));
  assert.ok(!viewer.includes("customers:read") && !viewer.includes("storefront:read"), "a viewer reads what the workspace shows a viewer");
  const catalog = assistantScopes({ role: "catalog_manager", readOnly: false, viaPlatform: false });
  assert.ok(catalog.includes("products:write") && catalog.includes("storefront:write"));
  assert.ok(!catalog.includes("discounts:write") && !catalog.includes("orders:write"));
  const orders = assistantScopes({ role: "order_manager", readOnly: false, viaPlatform: false });
  assert.ok(orders.includes("orders:write") && !orders.includes("storefront:write"));
  assert.ok(!scopeGranted(admin, "keys:read"), "an area outside the assistant is refused even for an administrator");

  // The tools offered follow the scopes.
  const offered = (role, options) => {
    const h = harness(role, [], options);
    return engine.offeredTools(h.state, h.deps).map((t) => t.function.name);
  };
  assert.ok(!offered("store_admin").includes("create_api_key"));
  assert.ok(!offered("viewer").includes("update_storefront_section"));
  assert.ok(!offered("viewer").includes("list_storefront_sections"));
  assert.ok(offered("viewer").includes("list_products"));
  assert.ok(!offered("catalog_manager").includes("create_discount") && !offered("catalog_manager").includes("refund_order"));
  assert.ok(offered("catalog_manager").includes("update_storefront_section"));
  assert.ok(!offered("store_admin", { readOnly: true }).includes("update_storefront_section"));

  // A tool named that was not offered is refused, not run.
  for (const [role, name, args, options] of [
    ["viewer", "update_storefront_section", { sectionId: "hero1", fields: { tone: "dark" } }],
    ["catalog_manager", "refund_order", { orderId: "ord_1", amount: 100 }],
    ["catalog_manager", "create_discount", { code: "LAUNCH20", value: 20 }],
    ["order_manager", "publish_storefront", {}],
    ["store_admin", "create_api_key", {}],
    ["store_admin", "update_storefront_section", { sectionId: "hero1", fields: { tone: "dark" } }, { readOnly: true }],
  ]) {
    ran.length = 0;
    const h = harness(role, [calls(call(name, args)), say("I can't do that.")], options);
    await engine.sendMessage(h.state, h.deps, { text: "do it" });
    assert.equal(ran.length, 0, `${role} cannot run ${name}`);
    assert.equal(h.state.pending, null, `${role} is not even asked to confirm ${name}`);
    const result = h.state.messages.find((m) => m.role === "tool");
    assert.match(result.content, /Not allowed|Not available in chat|no tool called/, `${role} ${name} is refused`);
  }

  // API keys and the plan are not available in chat for anyone: the refusal links to them and leaves roles out.
  for (const [name, link] of [
    ["create_api_key", "[API keys](/app/stores/st_test/setup/api-keys)"],
    ["create_billing_checkout_link", "[Billing](/app/billing)"],
  ]) {
    ran.length = 0;
    const h = harness("store_admin", [calls(call(name, { plan: "growth" })), say("That isn't available in chat.")]);
    await engine.sendMessage(h.state, h.deps, { text: "do it" });
    assert.equal(ran.length, 0);
    const result = JSON.parse(h.state.messages.find((m) => m.role === "tool").content).error;
    assert.match(result, /^Not available in chat/, name);
    assert.ok(result.includes(link), `${name} links to ${link}`);
    assert.ok(!/store administrator can|change their role/.test(result), `${name} is not blamed on the role`);
  }
}

/* --------------------------------------------- confirmation for irreversible */

{
  // Classification of the real registry.
  const real = (id) => API_OPERATIONS.find((o) => o.id === id);
  for (const id of [
    "publishStorefront",
    "refundOrder",
    "deleteProduct",
    "createDiscount",
    "updateDiscount",
    "updateVariants",
    "inviteTeamMember",
    "fulfilOrder",
    "updateTheme",
    "updateProductStatus",
    "applySuggestion",
    "removeDomain",
    "issueGiftCard",
    "payGiftCampaign",
    "updateLanguages",
    "updateProductTranslation",
    "translateMissing",
  ]) {
    assert.ok(real(id), `${id} exists`);
    assert.ok(confirmReasons(real(id), {}).length > 0, `${id} waits for confirmation`);
  }
  assert.ok(confirmReasons(real("updateProduct"), { price: 2500 }).includes("price"));
  assert.ok(confirmReasons(real("refundOrder"), {}).includes("payment"));
  assert.ok(confirmReasons(real("deleteProduct"), {}).includes("irreversible"));
  assert.ok(confirmReasons(real("createContent"), { published: true }).includes("publish"));
  assert.deepEqual(confirmReasons(real("createContent"), { published: false }), []);
  for (const id of ["updateStorefrontSection", "addStorefrontSection", "applyTemplate", "updateStorefrontSiteContent", "listOrders", "createProduct", "requestProductIdeas", "previewGiftCampaign"]) {
    assert.deepEqual(confirmReasons(real(id), {}), [], `${id} runs straight away`);
  }

  // A confirmed call runs exactly as shown; nothing runs before.
  ran.length = 0;
  const h = harness("store_admin", [
    calls(call("update_storefront_section", { sectionId: "hero1", fields: { tone: "dark" } }), call("refund_order", { orderId: "ord_1", amount: 1200 })),
    say("Refunded."),
  ]);
  await engine.sendMessage(h.state, h.deps, { text: "darker hero and refund order 1" });
  assert.deepEqual(ran.map((r) => r.id), ["updateStorefrontSection"], "the draft edit ran, the refund waits");
  assert.ok(h.state.pending);
  assert.equal(h.stub.seen.length, 1, "the model is not asked again while a confirmation waits");
  const confirm = h.events.find((e) => e.type === "confirm");
  assert.equal(confirm.pending.actions.length, 1);
  assert.equal(confirm.pending.actions[0].operationId, "refundOrder");
  assert.equal(confirm.pending.actions[0].title, "Do refundOrder");
  assert.deepEqual(confirm.pending.actions[0].details, [{ label: "orderId", value: "ord_1" }, { label: "amount", value: "1200" }], "the exact arguments are shown");
  assert.ok(confirm.pending.actions[0].reasons.includes("payment") && confirm.pending.actions[0].reasons.includes("irreversible"));

  assert.equal(await engine.confirmPending(h.state, h.deps, "acn_wrong"), false, "only the confirmation shown can be confirmed");
  assert.equal(ran.length, 1);
  assert.equal(await engine.confirmPending(h.state, h.deps, confirm.pending.id), true);
  assert.deepEqual(ran.map((r) => r.id), ["updateStorefrontSection", "refundOrder"]);
  assert.deepEqual(ran[1].input, { orderId: "ord_1", amount: 1200 });
  assert.equal(ran[1].via, "assistant");
  assert.equal(h.state.pending, null);
  assert.equal(await engine.confirmPending(h.state, h.deps, confirm.pending.id), false, "a confirmation runs once");
  assert.equal(ran.length, 2);
  assert.equal(h.stub.left(), 0, "the model carries on after the confirmed call");

  // Cancelling declines the call; nothing runs.
  ran.length = 0;
  const c = harness("store_admin", [calls(call("publish_storefront", { label: "Autumn" }))]);
  await engine.sendMessage(c.state, c.deps, { text: "publish" });
  const pendingId = c.state.pending.id;
  assert.equal(engine.cancelPending(c.state, c.deps, pendingId), true);
  assert.equal(ran.length, 0);
  assert.equal(c.state.messages.find((m) => m.role === "tool").ui.status, "declined");
  const after = scripted([say("Fine.")]);
  c.deps.model = after.model;
  await engine.sendMessage(c.state, c.deps, { text: "thanks" });
  assert.ok(
    after.seen[0].messages.every((m) => m.role !== "assistant" || m.content || m.tool_calls?.length),
    "the chat's own notes are not sent as empty assistant messages",
  );

  // Writing something new declines a waiting confirmation.
  ran.length = 0;
  const n = harness("store_admin", [calls(call("delete_product", { productId: "sp_1" })), say("OK, I left it.")]);
  await engine.sendMessage(n.state, n.deps, { text: "delete the mug" });
  await engine.sendMessage(n.state, n.deps, { text: "actually no" });
  assert.equal(ran.length, 0);
  assert.equal(n.state.pending, null);
  assert.ok(n.stub.seen[1].messages.some((m) => m.role === "tool" && m.content.includes("declined")), "the model learns it was declined");

  // A role taken away between asking and confirming is refused at confirmation.
  ran.length = 0;
  const r = harness("store_admin", [calls(call("create_discount", { code: "LAUNCH20", value: 20 })), say("Done.")]);
  await engine.sendMessage(r.state, r.deps, { text: "20% launch discount" });
  r.deps.scopes = assistantScopes({ role: "catalog_manager", readOnly: false, viaPlatform: false });
  await engine.confirmPending(r.state, r.deps, r.state.pending.id);
  assert.equal(ran.length, 0, "confirmation re-checks the person's permissions");
}

/* ------------------------------------------------------------------- undo */

{
  ran.length = 0;
  const h = harness("store_admin", [calls(call("update_storefront_section", { sectionId: "hero1", fields: { tone: "dark" } })), say("Done.")]);
  await engine.sendMessage(h.state, h.deps, { text: "darker" });
  assert.equal(await engine.undoLast(h.state, h.deps), true);
  assert.deepEqual(ran.at(-1), { id: "restoreStorefrontVersion", actor: ACTOR.id, store: STORE.id, input: { versionId: "ver_1" }, via: "assistant" });
  assert.equal(h.state.undo, null);
  assert.equal(await engine.undoLast(h.state, h.deps), false, "nothing left to undo");

  const viewer = harness("viewer", []);
  viewer.state.undo = { versionId: "ver_9", turn: 0, at: "" };
  assert.equal(await engine.undoLast(viewer.state, viewer.deps), false, "undo needs storefront write access too");
}

/* ----------------------------------------------------------------- secrets */

{
  const redacted = JSON.stringify(redactSecrets({ account: "acct_1", webhookSecret: "whsec_1", apiKey: "k", nested: [{ token: "t" }], hasSecret: true }));
  assert.ok(!redacted.includes("whsec_1") && !redacted.includes('"k"') && !redacted.includes('"t"'));
  assert.ok(redacted.includes("acct_1") && redacted.includes("true"));

  const h = harness("store_admin", [calls(call("get_payments")), say("Here are the payment settings.")]);
  await engine.sendMessage(h.state, h.deps, { text: "payments?" });
  const result = h.stub.seen[1].messages.find((m) => m.role === "tool").content;
  assert.ok(!result.includes("whsec_123") && !result.includes("sk_live_x"), "secrets never reach the model");
}

/* ------------------------------------------------- what the card says */

{
  const t = createTranslator({ locale: "en", messages: enMessages, namespace: "assistantDescribe" });
  const store = { id: "st_test", defaultCurrency: "EUR", currencies: ["EUR"], languages: ["en"], defaultLanguage: "en" };
  const describe = (id, args, extra = {}) => describeCall(id, args, { locale: "en", store, t, ...extra });

  const discount = describe("createDiscount", { code: "welcome15", kind: "percentage", value: 15, minimumSubtotal: 0, expiresAt: "2026-11-30", usageLimit: null, active: true });
  assert.deepEqual(discount.summary, ["15% off any order with code WELCOME15, until the end of November 30, 2026"]);
  assert.deepEqual(discount.details, [], "every term is in the sentence");
  assert.deepEqual(
    describe("createDiscount", { code: "SAVE10", kind: "fixed", value: 1000, minimumSubtotal: 5000, expiresAt: null, usageLimit: 100, active: false }).summary,
    ["€10.00 off orders of €50.00 or more with code SAVE10", "Can be used 100 times", "Switched off"],
  );
  const current = { code: "WELCOME15", kind: "percentage", value: 15, currency: "EUR", minimumSubtotal: 0, expiresAt: "2026-11-30T23:59:59.999Z", usageLimit: null, active: true };
  assert.deepEqual(describe("updateDiscount", { discountId: "dsc_1", value: 20 }, { discount: current, names: { dsc_1: "WELCOME15" } }).summary, [
    "Change discount code WELCOME15 to:",
    "20% off any order with code WELCOME15, until the end of November 30, 2026",
  ]);

  assert.deepEqual(describe("updateLanguages", { languages: ["en", "de"], defaultLanguage: "en" }).summary, ["Add German to the storefront"]);
  assert.deepEqual(
    describe("updateLanguages", { languages: ["de"], defaultLanguage: "de" }, { store: { ...store, languages: ["en", "fr"] } }).summary,
    ["Add German to the storefront", "Remove English and French from the storefront", "Make German the default language"],
  );
  assert.deepEqual(describe("updateCurrencies", { currencies: ["EUR", "USD"], defaultCurrency: "EUR" }).summary, ["Start selling in US Dollar"]);

  const publish = describe("publishStorefront", { label: "" }, { previewUrl: "https://shop.example/preview?t=1" });
  assert.deepEqual(publish.summary, ["Put the current draft live on the storefront"]);
  assert.deepEqual(publish.links, [
    { label: "Preview draft", href: "https://shop.example/preview?t=1", external: true },
    { label: "Compare with live", href: "/app/stores/st_test/storefront#compare" },
  ]);

  const refund = describe("refundOrder", { orderId: "ord_1", amount: 1200, reason: "Damaged", cancel: false, notifyCustomer: true }, { names: { ord_1: "PC-1042" }, orderCurrency: "GBP" });
  assert.deepEqual(refund.summary, ["Refund £12.00 on order PC-1042"]);
  assert.deepEqual(refund.details, [
    { label: "Reason", value: "Damaged" },
    { label: "Cancel order", value: "No" },
    { label: "Email the customer", value: "Yes" },
  ]);
  assert.deepEqual(describe("updateProductStatus", { productId: "prd_1", status: "in_review" }, { names: { prd_1: "Linen tote" } }).summary, ["Set Linen tote to In review"]);
  assert.deepEqual(describe("deleteProduct", { productId: "prd_1" }, { names: { prd_1: "Linen tote" } }).summary, ["Delete Linen tote"]);

  // Any other call lists its arguments under their labels, never the raw names.
  const zone = describe("createShippingZone", { name: "Europe", countries: ["DE", "FR"], idempotencyKey: "k1" });
  assert.deepEqual(zone.details, [
    { label: "Name", value: "Europe" },
    { label: "Countries", value: "Germany and France" },
  ]);
  const gift = describe("payGiftCampaign", { campaignId: "gc_1", cardNumber: "4242 4242 4242 4242", expiry: "12/30", cvc: "123" });
  assert.ok(gift.details.some((d) => d.value === "Card ending 4242") && !JSON.stringify(gift).includes("123\""), "card details are masked");

  // Every argument of a confirmed call has a label in every workspace language.
  const { collect } = await import("./assistant-field-labels.mjs");
  const { fields, values } = collect();
  for (const locale of LOCALES) {
    for (const key of fields.keys()) assert.ok(FIELD_LABELS[locale]?.fields[key], `${key} has a label in ${locale} (npm run assistant-field-labels)`);
    for (const key of values.keys()) assert.ok(FIELD_LABELS[locale]?.values[key], `${key} has a label in ${locale} (npm run assistant-field-labels)`);
  }

  // The engine keeps the description it was given, so a reloaded chat shows the same card.
  const h = harness("store_admin", [calls(call("refund_order", { orderId: "ord_1", amount: 1200 }))]);
  h.deps.describe = async (operationId, args) => describe(operationId, args, { names: { ord_1: "PC-1042" } });
  await engine.sendMessage(h.state, h.deps, { text: "refund order 1042" });
  assert.deepEqual(h.state.pending.calls[0].description.summary, ["Refund €12.00 on order PC-1042"]);
  const view = engine.pendingView(h.state.pending, h.deps);
  assert.deepEqual(view.actions[0].summary, ["Refund €12.00 on order PC-1042"]);
  assert.deepEqual(h.events.find((e) => e.type === "confirm").pending, view);
}

/* ------------------------------------------- checkpoints name the request */

{
  const state = engine.emptyState([]);
  state.messages.push({ role: "user", content: "Make the hero darker and swap the photo for the one I attached, then tighten the copy\n\nAttached images (already uploaded, use these URLs in image fields):\nhttps://assets.clawcorp.ai/a.jpg" });
  assert.equal(engine.requestSummary(state), "Make the hero darker and swap the photo for the one I…");
  state.messages.push({ role: "user", content: "(I used the Undo button)", ui: { note: "undo" } });
  assert.equal(engine.requestSummary(state), "Make the hero darker and swap the photo for the one I…", "the chat's own notes are not requests");
  state.messages.push({ role: "user", content: "Add a FAQ" });
  assert.equal(engine.requestSummary(state), "Add a FAQ");
  assert.equal(createTranslator({ locale: "en", messages: enMessages, namespace: "assistantChat" })("checkpointLabel", { request: "Add a FAQ" }), "Before: Add a FAQ");
}

/* --------------------------------------------------------- the real registry */

{
  const operations = engine.assistantOperations(API_OPERATIONS);
  assert.ok(operations.length > 150, "the assistant is offered the registry's store operations");
  assert.ok(operations.every((o) => !o.shop && !o.admin));
  const ids = new Set();
  for (const operation of operations) {
    const tool = engine.toolDefinition(operation);
    assert.match(tool.function.name, /^[a-z0-9_]{1,64}$/);
    assert.ok(!ids.has(tool.function.name), `${tool.function.name} is unique`);
    ids.add(tool.function.name);
    assert.ok(tool.function.description.startsWith(operation.summary), "the description comes from the registry");
    assert.equal(tool.function.parameters.type, "object");
    assert.ok(!("$schema" in tool.function.parameters));
    JSON.stringify(tool);
    for (const locale of LOCALES) {
      const pair = labels[locale][operation.id];
      assert.ok(Array.isArray(pair) && pair.length === 2 && pair.every((s) => s.trim()), `${operation.id} has labels in ${locale} (npm run assistant-labels)`);
    }
  }
  const admin = assistantScopes({ role: "store_admin", readOnly: false, viaPlatform: false });
  const tags = new Set(engine.allowedOperations({ operations: API_OPERATIONS, scopes: admin }).map((o) => o.tag));
  for (const tag of ["Storefront", "Products", "Orders", "Discounts", "Translations", "Content", "Assistant"]) assert.ok(tags.has(tag), tag);
  for (const tag of ["API keys", "Webhooks", "Agency", "Account"]) assert.ok(!tags.has(tag), `${tag} is not offered`);
  const base = engine.offeredTools({ groups: ["Store", "Storefront", "Products", "Assistant", "Translations", "Content", "Navigation"] }, { operations: API_OPERATIONS, scopes: admin });
  assert.ok(base.length < 128, `at most 128 tools in one request (${base.length})`);
}

console.log(`assistant-chat-check: all assertions passed (${engine.assistantOperations(API_OPERATIONS).length} operations as tools)`);
process.exit(0);
