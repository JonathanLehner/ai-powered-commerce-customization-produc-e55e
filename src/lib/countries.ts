/**
 * Countries a shopper can pick at checkout, with the fulfilment region each one
 * belongs to. Suppliers publish the regions they produce and ship to, so the
 * region attached to a country is what decides whether an order can be routed
 * automatically or lands in the store's exception queue.
 *
 * This module is deliberately free of server-only imports: the checkout form
 * uses it in the browser to warn a shopper before they pay, and the routing
 * engine uses the same table on the server after payment.
 */

export type FulfillmentRegion =
  | "North America"
  | "LATAM"
  | "European Union"
  | "United Kingdom"
  | "Middle East"
  | "Africa"
  | "APAC"
  | "Oceania"
  | "Rest of world";

export interface Country {
  code: string;
  name: string;
  region: FulfillmentRegion;
}

/** [alpha-2 code, English name], grouped by the region they are routed to. */
const BY_REGION: Record<Exclude<FulfillmentRegion, "Rest of world">, [string, string][]> = {
  "North America": [
    ["US", "United States"],
    ["CA", "Canada"],
    ["BM", "Bermuda"],
    ["GL", "Greenland"],
    ["PM", "Saint Pierre and Miquelon"],
  ],
  LATAM: [
    ["MX", "Mexico"],
    ["AR", "Argentina"],
    ["BO", "Bolivia"],
    ["BR", "Brazil"],
    ["CL", "Chile"],
    ["CO", "Colombia"],
    ["CR", "Costa Rica"],
    ["EC", "Ecuador"],
    ["SV", "El Salvador"],
    ["GT", "Guatemala"],
    ["GY", "Guyana"],
    ["HN", "Honduras"],
    ["NI", "Nicaragua"],
    ["PA", "Panama"],
    ["PY", "Paraguay"],
    ["PE", "Peru"],
    ["SR", "Suriname"],
    ["UY", "Uruguay"],
    ["VE", "Venezuela"],
    ["BZ", "Belize"],
    ["GF", "French Guiana"],
    ["FK", "Falkland Islands"],
    ["CU", "Cuba"],
    ["DO", "Dominican Republic"],
    ["HT", "Haiti"],
    ["JM", "Jamaica"],
    ["PR", "Puerto Rico"],
    ["BS", "Bahamas"],
    ["BB", "Barbados"],
    ["TT", "Trinidad and Tobago"],
    ["AG", "Antigua and Barbuda"],
    ["DM", "Dominica"],
    ["GD", "Grenada"],
    ["KN", "Saint Kitts and Nevis"],
    ["LC", "Saint Lucia"],
    ["VC", "Saint Vincent and the Grenadines"],
    ["AI", "Anguilla"],
    ["AW", "Aruba"],
    ["BQ", "Caribbean Netherlands"],
    ["VG", "British Virgin Islands"],
    ["VI", "U.S. Virgin Islands"],
    ["KY", "Cayman Islands"],
    ["CW", "Curaçao"],
    ["GP", "Guadeloupe"],
    ["MQ", "Martinique"],
    ["MS", "Montserrat"],
    ["SX", "Sint Maarten"],
    ["BL", "Saint Barthélemy"],
    ["MF", "Saint Martin"],
    ["TC", "Turks and Caicos Islands"],
  ],
  "European Union": [
    ["AT", "Austria"],
    ["BE", "Belgium"],
    ["BG", "Bulgaria"],
    ["HR", "Croatia"],
    ["CY", "Cyprus"],
    ["CZ", "Czechia"],
    ["DK", "Denmark"],
    ["EE", "Estonia"],
    ["FI", "Finland"],
    ["FR", "France"],
    ["DE", "Germany"],
    ["GR", "Greece"],
    ["HU", "Hungary"],
    ["IE", "Ireland"],
    ["IT", "Italy"],
    ["LV", "Latvia"],
    ["LT", "Lithuania"],
    ["LU", "Luxembourg"],
    ["MT", "Malta"],
    ["NL", "Netherlands"],
    ["PL", "Poland"],
    ["PT", "Portugal"],
    ["RO", "Romania"],
    ["SK", "Slovakia"],
    ["SI", "Slovenia"],
    ["ES", "Spain"],
    ["SE", "Sweden"],
  ],
  "United Kingdom": [["GB", "United Kingdom"]],
  "Middle East": [
    ["AE", "United Arab Emirates"],
    ["SA", "Saudi Arabia"],
    ["BH", "Bahrain"],
    ["IQ", "Iraq"],
    ["IR", "Iran"],
    ["IL", "Israel"],
    ["JO", "Jordan"],
    ["KW", "Kuwait"],
    ["LB", "Lebanon"],
    ["OM", "Oman"],
    ["PS", "Palestinian Territories"],
    ["QA", "Qatar"],
    ["SY", "Syria"],
    ["TR", "Türkiye"],
    ["YE", "Yemen"],
  ],
  Africa: [
    ["ZA", "South Africa"],
    ["NG", "Nigeria"],
    ["KE", "Kenya"],
    ["DZ", "Algeria"],
    ["AO", "Angola"],
    ["BJ", "Benin"],
    ["BW", "Botswana"],
    ["BF", "Burkina Faso"],
    ["BI", "Burundi"],
    ["CV", "Cabo Verde"],
    ["CM", "Cameroon"],
    ["CF", "Central African Republic"],
    ["TD", "Chad"],
    ["KM", "Comoros"],
    ["CG", "Republic of the Congo"],
    ["CD", "Democratic Republic of the Congo"],
    ["CI", "Côte d’Ivoire"],
    ["DJ", "Djibouti"],
    ["EG", "Egypt"],
    ["GQ", "Equatorial Guinea"],
    ["ER", "Eritrea"],
    ["SZ", "Eswatini"],
    ["ET", "Ethiopia"],
    ["GA", "Gabon"],
    ["GM", "Gambia"],
    ["GH", "Ghana"],
    ["GN", "Guinea"],
    ["GW", "Guinea-Bissau"],
    ["LS", "Lesotho"],
    ["LR", "Liberia"],
    ["LY", "Libya"],
    ["MG", "Madagascar"],
    ["MW", "Malawi"],
    ["ML", "Mali"],
    ["MR", "Mauritania"],
    ["MU", "Mauritius"],
    ["YT", "Mayotte"],
    ["MA", "Morocco"],
    ["MZ", "Mozambique"],
    ["NA", "Namibia"],
    ["NE", "Niger"],
    ["RE", "Réunion"],
    ["RW", "Rwanda"],
    ["SH", "Saint Helena"],
    ["ST", "São Tomé and Príncipe"],
    ["SN", "Senegal"],
    ["SC", "Seychelles"],
    ["SL", "Sierra Leone"],
    ["SO", "Somalia"],
    ["SS", "South Sudan"],
    ["SD", "Sudan"],
    ["TZ", "Tanzania"],
    ["TG", "Togo"],
    ["TN", "Tunisia"],
    ["UG", "Uganda"],
    ["EH", "Western Sahara"],
    ["ZM", "Zambia"],
    ["ZW", "Zimbabwe"],
  ],
  APAC: [
    ["JP", "Japan"],
    ["SG", "Singapore"],
    ["KR", "South Korea"],
    ["IN", "India"],
    ["AF", "Afghanistan"],
    ["BD", "Bangladesh"],
    ["BT", "Bhutan"],
    ["BN", "Brunei"],
    ["KH", "Cambodia"],
    ["CN", "China"],
    ["HK", "Hong Kong SAR China"],
    ["ID", "Indonesia"],
    ["KZ", "Kazakhstan"],
    ["KG", "Kyrgyzstan"],
    ["LA", "Laos"],
    ["MO", "Macao SAR China"],
    ["MY", "Malaysia"],
    ["MV", "Maldives"],
    ["MN", "Mongolia"],
    ["MM", "Myanmar (Burma)"],
    ["NP", "Nepal"],
    ["KP", "North Korea"],
    ["PK", "Pakistan"],
    ["PH", "Philippines"],
    ["LK", "Sri Lanka"],
    ["TW", "Taiwan"],
    ["TJ", "Tajikistan"],
    ["TH", "Thailand"],
    ["TL", "Timor-Leste"],
    ["TM", "Turkmenistan"],
    ["UZ", "Uzbekistan"],
    ["VN", "Vietnam"],
  ],
  Oceania: [
    ["AU", "Australia"],
    ["NZ", "New Zealand"],
    ["AS", "American Samoa"],
    ["CK", "Cook Islands"],
    ["FJ", "Fiji"],
    ["PF", "French Polynesia"],
    ["GU", "Guam"],
    ["KI", "Kiribati"],
    ["MH", "Marshall Islands"],
    ["FM", "Micronesia"],
    ["NR", "Nauru"],
    ["NC", "New Caledonia"],
    ["NU", "Niue"],
    ["NF", "Norfolk Island"],
    ["MP", "Northern Mariana Islands"],
    ["PW", "Palau"],
    ["PG", "Papua New Guinea"],
    ["WS", "Samoa"],
    ["SB", "Solomon Islands"],
    ["TK", "Tokelau"],
    ["TO", "Tonga"],
    ["TV", "Tuvalu"],
    ["VU", "Vanuatu"],
    ["WF", "Wallis and Futuna"],
  ],
};

/**
 * Destinations no supplier network in the platform's region vocabulary covers as
 * a group. They are offered at checkout, but routing holds them for a human,
 * which is exactly what the pre-payment warning tells the shopper.
 */
const REST_OF_WORLD: [string, string][] = [
  ["NO", "Norway"],
  ["CH", "Switzerland"],
  ["IS", "Iceland"],
  ["AL", "Albania"],
  ["AD", "Andorra"],
  ["AM", "Armenia"],
  ["AZ", "Azerbaijan"],
  ["BY", "Belarus"],
  ["BA", "Bosnia and Herzegovina"],
  ["FO", "Faroe Islands"],
  ["GE", "Georgia"],
  ["GI", "Gibraltar"],
  ["GG", "Guernsey"],
  ["IM", "Isle of Man"],
  ["JE", "Jersey"],
  ["XK", "Kosovo"],
  ["LI", "Liechtenstein"],
  ["MD", "Moldova"],
  ["MC", "Monaco"],
  ["ME", "Montenegro"],
  ["MK", "North Macedonia"],
  ["RU", "Russia"],
  ["SM", "San Marino"],
  ["RS", "Serbia"],
  ["SJ", "Svalbard and Jan Mayen"],
  ["UA", "Ukraine"],
  ["VA", "Vatican City"],
  ["AX", "Åland Islands"],
];

export const COUNTRIES: Country[] = [
  ...Object.entries(BY_REGION).flatMap(([region, entries]) =>
    entries.map(([code, name]) => ({ code, name, region: region as FulfillmentRegion })),
  ),
  ...REST_OF_WORLD.map(([code, name]) => ({ code, name, region: "Rest of world" as const })),
].sort((a, b) => a.name.localeCompare(b.name, "en"));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function isCountryCode(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}

/** The full country name, falling back to the code itself for anything unknown. */
export function countryName(code: string): string {
  return BY_CODE.get(code.toUpperCase())?.name ?? code.toUpperCase();
}

/**
 * The country name in a storefront's own language. `Intl` carries the
 * translations, so no country list has to be maintained per language; anything
 * it cannot name — an unknown code, or a runtime built without the region data —
 * falls back to the English table above.
 */
const displayNames = new Map<string, Intl.DisplayNames | null>();

function regionNames(localeTag: string): Intl.DisplayNames | null {
  if (!displayNames.has(localeTag)) {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([localeTag], { type: "region" });
    } catch {
      names = null;
    }
    displayNames.set(localeTag, names);
  }
  return displayNames.get(localeTag) ?? null;
}

export function localCountryName(code: string, localeTag?: string): string {
  const upper = code.toUpperCase();
  const english = countryName(upper);
  if (!localeTag || !BY_CODE.has(upper)) return english;
  try {
    const translated = regionNames(localeTag)?.of(upper);
    return translated && translated !== upper ? translated : english;
  } catch {
    return english;
  }
}

/** The country list named and ordered for one language. */
export function localCountries(localeTag?: string): Country[] {
  if (!localeTag) return COUNTRIES;
  return COUNTRIES.map((c) => ({ ...c, name: localCountryName(c.code, localeTag) })).sort((a, b) =>
    a.name.localeCompare(b.name, localeTag),
  );
}

export function regionForCountry(code: string): string {
  return BY_CODE.get(code.toUpperCase())?.region ?? "Rest of world";
}

/** Accent- and case-insensitive so "cote", "Côte" and "CI" all find the same row. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Countries matching what the shopper has typed: an exact code first, then
 * names starting with the query, then names containing it — so "za" offers
 * South Africa before Zambia and "guinea" still finds Papua New Guinea.
 */
export function searchCountries(query: string, localeTag?: string): Country[] {
  const list = localCountries(localeTag);
  const q = normalize(query);
  if (!q) return list;
  const code: Country[] = [];
  const starts: Country[] = [];
  const contains: Country[] = [];
  for (const country of list) {
    // The English name still matches, so a shopper on a German storefront finds
    // the row by typing either "Deutschland" or "Germany".
    const names = [normalize(country.name), normalize(countryName(country.code))];
    if (normalize(country.code) === q) code.push(country);
    else if (names.some((n) => n.startsWith(q))) starts.push(country);
    else if (names.some((n) => n.includes(q))) contains.push(country);
  }
  return [...code, ...starts, ...contains];
}

/** The country whose name or code is exactly what was typed, e.g. from autofill. */
export function matchCountry(query: string, localeTag?: string): Country | null {
  const q = normalize(query);
  if (!q) return null;
  return (
    localCountries(localeTag).find(
      (c) => normalize(c.name) === q || normalize(countryName(c.code)) === q || normalize(c.code) === q,
    ) ?? null
  );
}

export interface FulfillmentSource {
  supplierId: string;
  supplierName: string;
  regions: string[];
  /** Names of the basket items this supplier produces, for the warning copy. */
  productNames: string[];
}

/**
 * The suppliers behind the basket that do not fulfil to the chosen destination.
 * Routing applies the same test after payment, so anything returned here is an
 * order that would be held for manual handling.
 */
export function suppliersOutsideRegion(country: string, sources: FulfillmentSource[]): FulfillmentSource[] {
  const region = regionForCountry(country);
  return sources.filter((source) => !source.regions.includes(region));
}
