// Self-check for the checkout country picker: npm run country-check
import assert from "node:assert/strict";
import {
  COUNTRIES,
  countryName,
  isCountryCode,
  matchCountry,
  regionForCountry,
  searchCountries,
  suppliersOutsideRegion,
} from "../src/lib/countries.ts";
import { STRIPE_COUNTRIES } from "../src/lib/util.ts";

// Every row is a usable alpha-2 code with a name, listed once, in name order.
const codes = new Set();
for (const country of COUNTRIES) {
  assert.match(country.code, /^[A-Z]{2}$/, `bad code ${country.code}`);
  assert.ok(country.name.length > 2, `bad name for ${country.code}`);
  assert.ok(!codes.has(country.code), `duplicate ${country.code}`);
  codes.add(country.code);
}
const names = COUNTRIES.map((c) => c.name);
assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en")), "list is not in name order");

// The field defaults to the store's Stripe account country, so every country
// Stripe can be connected in has to be selectable.
for (const { code } of STRIPE_COUNTRIES) {
  assert.ok(isCountryCode(code), `${code} is missing from the picker`);
}

// Routing regions the platform already assigned must not move: they decide the
// supplier and the exception queue for every order placed so far.
const HISTORICAL = {
  US: "North America", CA: "North America", MX: "LATAM", BR: "LATAM", AR: "LATAM",
  GB: "United Kingdom", IE: "European Union", DE: "European Union", FR: "European Union",
  NL: "European Union", ES: "European Union", IT: "European Union", SE: "European Union",
  PL: "European Union", PT: "European Union", AT: "European Union", DK: "European Union",
  JP: "APAC", SG: "APAC", AU: "Oceania", NZ: "Oceania", KR: "APAC", IN: "APAC",
  AE: "Middle East", SA: "Middle East", ZA: "Africa", NG: "Africa", KE: "Africa",
};
for (const [code, region] of Object.entries(HISTORICAL)) {
  assert.equal(regionForCountry(code), region, `${code} changed region`);
}
assert.equal(regionForCountry("zz"), "Rest of world");
assert.equal(regionForCountry("no"), "Rest of world");

// Names are what the shopper reads back; the code is what gets submitted.
assert.equal(countryName("za"), "South Africa");
assert.equal(countryName("ZZ"), "ZZ");

// Searching finds a country by prefix, by code and through accents.
assert.equal(searchCountries("south afr")[0].code, "ZA");
assert.equal(searchCountries("za")[0].code, "ZA", "an exact code must outrank Zambia");
assert.equal(searchCountries("cote d'ivoire")[0].code, "CI");
assert.equal(searchCountries("Côte")[0].code, "CI");
assert.equal(searchCountries("").length, COUNTRIES.length);
assert.equal(searchCountries("nowhere").length, 0);

// Blurring the field commits a name typed in full, which is what autofill leaves.
assert.equal(matchCountry("United States")?.code, "US");
assert.equal(matchCountry("de")?.code, "DE");
assert.equal(matchCountry("Republic of Nowhere"), null);

// ORD-4142: a Cape Town delivery from a supplier that stops at the EU is warned
// about before payment, and the same basket to Berlin is not.
const printify = {
  supplierId: "sup_printify",
  supplierName: "Printify",
  regions: ["North America", "European Union", "United Kingdom", "APAC", "Oceania"],
  productNames: ["Heavyweight Hoodie"],
};
const gelato = {
  supplierId: "sup_gelato",
  supplierName: "Gelato",
  regions: ["North America", "European Union", "United Kingdom", "LATAM", "APAC", "Middle East", "Africa", "Oceania"],
  productNames: ["Enamel Mug"],
};
assert.deepEqual(
  suppliersOutsideRegion("ZA", [printify, gelato]).map((s) => s.supplierId),
  ["sup_printify"],
);
assert.deepEqual(suppliersOutsideRegion("DE", [printify, gelato]), []);
// Nothing in the basket to check means nothing to warn about.
assert.deepEqual(suppliersOutsideRegion("ZA", []), []);

console.log("country-check ok");
