/**
 * Translation keys for the values the workspace stores in English: fulfilment
 * regions are saved on suppliers, tax brackets and catalog items by name, so the
 * name is mapped to a `labels.regions` key for display only.
 */
const REGION_KEYS = {
  "North America": "northAmerica",
  "European Union": "europeanUnion",
  "United Kingdom": "unitedKingdom",
  LATAM: "latam",
  APAC: "apac",
  "Middle East": "middleEast",
  Africa: "africa",
  Oceania: "oceania",
  "Rest of world": "restOfWorld",
} as const;

type RegionKey = (typeof REGION_KEYS)[keyof typeof REGION_KEYS];

/** A region's name in the reader's language, or the stored name when it is not one of ours. */
export function regionLabel(t: (key: `regions.${RegionKey}`) => string, region: string): string {
  const key = REGION_KEYS[region as keyof typeof REGION_KEYS];
  return key ? t(`regions.${key}`) : region;
}

/** A currency's name in the reader's language, e.g. ("EUR", "de") -> "Euro". */
export function currencyName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}
