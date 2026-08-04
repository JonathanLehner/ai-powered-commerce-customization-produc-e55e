// Self-check for putting a rejected form back: npm run form-restore-check
import assert from "node:assert/strict";
import { captureValues, planRestore } from "../src/lib/form-restore.ts";

/** The controls of a checkout, in the order the browser walks them. */
const checkout = [
  { name: "storeId", kind: "ignored", submits: "" },
  { name: "name", kind: "value", submits: "" },
  { name: "email", kind: "value", submits: "" },
  { name: "line1", kind: "value", submits: "" },
  { name: "currency", kind: "value", submits: "" },
];

function form(pairs) {
  const data = new FormData();
  for (const [key, value] of pairs) data.append(key, value);
  return data;
}

/* --------------------------------------------------------- what is captured */

const submitted = captureValues(
  form([
    ["storeId", "store_1"],
    ["name", "Jo Bloggs"],
    ["email", ""],
    ["line1", ""],
    ["currency", "EUR"],
  ]),
);
assert.deepEqual(submitted[1], ["name", "Jo Bloggs"]);
assert.equal(submitted.length, 5, "every string field is kept, blanks included");

// A file never comes back through the DOM, so it is not carried around.
const withFile = new FormData();
withFile.append("name", "Jo Bloggs");
withFile.append("artwork", new File(["x"], "logo.png", { type: "image/png" }));
assert.deepEqual(captureValues(withFile), [["name", "Jo Bloggs"]]);

/* ------------------------------------------------------- the restored form */

const first = planRestore(checkout, submitted);
assert.equal(first[0], null, "a hidden field is left to React");
assert.deepEqual(first[1], { value: "Jo Bloggs" });
assert.deepEqual(first[2], { value: "" }, "a field left blank stays blank");
assert.deepEqual(first[4], { value: "EUR" }, "a chosen currency is not reset to the default");

// The same submission planned again is restored the same way, which is what
// keeps the second, third and tenth rejection from emptying the form.
assert.deepEqual(planRestore(checkout, submitted), first);

// The shopper adds their email and is rejected on the street address: the name
// they had already re-entered is handed back with the rest.
const second = planRestore(
  checkout,
  captureValues(
    form([
      ["storeId", "store_1"],
      ["name", "Jo Bloggs"],
      ["email", "jo@example.com"],
      ["line1", ""],
      ["currency", "EUR"],
    ]),
  ),
);
assert.deepEqual(second[1], { value: "Jo Bloggs" });
assert.deepEqual(second[2], { value: "jo@example.com" });

/* ------------------------------------------ editors that start from a value */

// A workspace editor's fields default to the stored value, so an edit is only
// preserved if the restore writes over what is already there.
const editor = [
  { name: "name", kind: "value", submits: "" },
  { name: "description", kind: "value", submits: "" },
];
const edited = planRestore(
  editor,
  captureValues(form([
    ["name", "Heavyweight hoodie"],
    ["description", "Too short"],
  ])),
);
assert.deepEqual(edited[0], { value: "Heavyweight hoodie" });
assert.deepEqual(edited[1], { value: "Too short" }, "the rejected text is what needs correcting");

/* ------------------------------------------------------- ticks and choices */

const products = [
  { name: "productIds", kind: "toggle", submits: "p1" },
  { name: "productIds", kind: "toggle", submits: "p2" },
  { name: "productIds", kind: "toggle", submits: "p3" },
  { name: "approvalRequired", kind: "toggle", submits: "on" },
  { name: "access", kind: "toggle", submits: "link" },
  { name: "access", kind: "toggle", submits: "invite" },
];
const ticked = planRestore(
  products,
  captureValues(form([
    ["productIds", "p1"],
    ["productIds", "p3"],
    ["access", "invite"],
  ])),
);
assert.deepEqual(ticked[0], { checked: true });
assert.deepEqual(ticked[1], { checked: false });
assert.deepEqual(ticked[2], { checked: true });
assert.deepEqual(ticked[3], { checked: false }, "a box that was cleared stays cleared");
assert.deepEqual(ticked[4], { checked: false });
assert.deepEqual(ticked[5], { checked: true }, "the radio that was chosen is the one that comes back");

/* ------------------------------------------------- rows that share a name */

const rows = [
  { name: "recipient", kind: "value", submits: "" },
  { name: "recipient", kind: "value", submits: "" },
  { name: "recipient", kind: "value", submits: "" },
];
const restoredRows = planRestore(
  rows,
  captureValues(form([
    ["recipient", "ana@northwind.example"],
    ["recipient", ""],
    ["recipient", "sam@northwind.example"],
  ])),
);
assert.deepEqual(
  restoredRows,
  [{ value: "ana@northwind.example" }, { value: "" }, { value: "sam@northwind.example" }],
  "each row keeps its own value instead of every row taking the first",
);

// A control the submission knows nothing about is left alone.
assert.deepEqual(planRestore([{ name: "unknown", kind: "value", submits: "" }], submitted), [null]);
assert.deepEqual(planRestore([{ name: "", kind: "value", submits: "" }], submitted), [null]);

console.log("form-restore-check: ok");
