import "server-only";
import { z } from "zod";
import { ROUNDING_RULES, automaticRate, currencySettings, presentmentRate, roundingRulesFor } from "../../currency";
import { refreshExchangeRates, saveCurrencyRates } from "../../operations/store-settings";
import type { Store } from "../../types";
import { define, type ApiOperation } from "../define";

/**
 * Presentment currencies: the exchange rate (automatic or manual) and the
 * rounding rule each extra currency prices products with. Which currencies the
 * store sells in is `updateCurrencies`.
 */

export function presentCurrencyRates(store: Store) {
  return {
    shopCurrency: store.defaultCurrency,
    automaticRatesUpdatedAt: store.fxRates?.fetchedAt ?? null,
    currencies: store.currencies
      .filter((code) => code !== store.defaultCurrency)
      .map((code) => {
        const setting = currencySettings(store, code);
        return {
          currency: code,
          mode: setting.mode,
          manualRate: setting.rate,
          automaticRate: Number(automaticRate(store, code).toPrecision(8)),
          rate: Number(presentmentRate(store, code).toPrecision(8)),
          rounding: setting.rounding,
          roundingOptions: roundingRulesFor(code),
        };
      }),
  };
}

const RATES_NOTE =
  "Rates are units of the currency per one unit of the shop currency. Rounding applies to product prices and always rounds up: 0.00, 0.90, 0.95 or 0.99 endings for currencies with cents, 10 or 100 for currencies without.";

export const currencyOperations: ApiOperation[] = [
  define({
    id: "getCurrencyRates",
    method: "GET",
    path: "/currencies/rates",
    scope: "store:read",
    tag: "Currencies",
    summary: "Get exchange rates and rounding",
    description: `How each presentment currency is priced: automatic or manual rate, the rate in force, and the rounding rule. ${RATES_NOTE}`,
    input: z.object({}),
    run: async (ctx) => presentCurrencyRates(ctx.store),
  }),
  define({
    id: "updateCurrencyRates",
    method: "PUT",
    path: "/currencies/rates",
    scope: "store:write",
    tag: "Currencies",
    summary: "Set exchange rates and rounding",
    description: `Sets the rate mode, manual rate and rounding rule for the presentment currencies given; others keep theirs. Only currencies the store sells in, other than the shop currency, can be set. ${RATES_NOTE}`,
    input: z.object({
      currencies: z
        .array(
          z.object({
            currency: z.string().length(3).describe("A currency the store sells in, such as EUR."),
            mode: z.enum(["auto", "manual"]),
            rate: z.number().positive().optional().describe("Required for manual: units of the currency per unit of the shop currency."),
            rounding: z.enum(ROUNDING_RULES as [string, ...string[]]).describe("none, 0.00, 0.90, 0.95, 0.99, 10 or 100."),
          }),
        )
        .min(1),
    }),
    actions: ["stores#saveCurrencyRates"],
    run: async (ctx, input) =>
      presentCurrencyRates(
        await saveCurrencyRates(
          ctx,
          Object.fromEntries(
            input.currencies.map((entry) => [
              entry.currency.toUpperCase(),
              { mode: entry.mode, rate: entry.rate ?? null, rounding: entry.rounding as (typeof ROUNDING_RULES)[number] },
            ]),
          ),
        ),
      ),
  }),
  define({
    id: "refreshExchangeRates",
    method: "POST",
    path: "/currencies/rates/refresh",
    scope: "store:write",
    tag: "Currencies",
    summary: "Refresh the automatic exchange rates",
    description: "Fetches today's market rates for the currencies priced automatically. Automatic rates also refresh by themselves once a day.",
    input: z.object({}),
    actions: ["stores#refreshExchangeRates"],
    run: async (ctx) => presentCurrencyRates(await refreshExchangeRates(ctx)),
  }),
];
