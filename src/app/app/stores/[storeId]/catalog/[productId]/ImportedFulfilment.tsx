"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { linkImportedProduct, markMerchantFulfilled } from "@/app/actions/products";
import { ActionForm } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StoreProduct } from "@/lib/types";
import { formatMoney, toMajorString } from "@/lib/util";

export interface LinkableProduct {
  id: string;
  name: string;
  /** Cheapest variant, minor units. */
  baseCost: number;
}

/**
 * The two ways an imported product gets made: linked to a shared-catalog
 * product, or shipped by the store at a unit cost it enters.
 */
export function ImportedFulfilment({
  product,
  catalog,
  merchant,
}: {
  product: StoreProduct;
  catalog: LinkableProduct[];
  /** The store already ships it; the form changes the unit cost. */
  merchant: boolean;
}) {
  const t = useTranslations("importedFulfilment");
  const locale = useLocale();
  const [catalogId, setCatalogId] = useState("");
  const hidden = { storeId: product.storeId, productId: product.id };
  const knownCost = product.merchantFulfilled?.unitCost ?? product.variants.find((v) => v.baseCost > 0)?.baseCost;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ActionForm
        action={markMerchantFulfilled}
        submitLabel={merchant ? t("saveUnitCost") : t("markMerchant")}
        pendingLabel={t("saving")}
        submitVariant={merchant ? "outline" : "default"}
        hidden={hidden}
        className="rounded-xl border border-border p-4"
      >
        {(state) => (
          <div className="grid gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("merchantTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("merchantBody")}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="unitCost">{t("unitCost", { currency: product.currency })}</Label>
              <Input
                id="unitCost"
                name="unitCost"
                inputMode="decimal"
                required
                defaultValue={knownCost !== undefined ? toMajorString(knownCost, product.currency) : ""}
                aria-invalid={state.field === "unitCost" ? true : undefined}
                aria-describedby="unitCost-hint"
                className="w-36 tabular-nums"
              />
              <p id="unitCost-hint" className="text-xs text-muted-foreground">
                {t("unitCostHint")}
              </p>
            </div>
          </div>
        )}
      </ActionForm>

      <ActionForm
        action={linkImportedProduct}
        submitLabel={t("link")}
        pendingLabel={t("linking")}
        submitVariant="outline"
        submitDisabled={!catalogId}
        hidden={hidden}
        className="rounded-xl border border-border p-4"
      >
        {(state) => (
          <div className="grid gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("linkTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("linkBody")}</p>
            </div>
            {catalog.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCatalog")}</p>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="catalogProductId">{t("linkLabel")}</Label>
                <input type="hidden" name="catalogProductId" value={catalogId} />
                <Select value={catalogId} onValueChange={setCatalogId}>
                  <SelectTrigger
                    id="catalogProductId"
                    className="w-full"
                    aria-invalid={state.field === "catalogProductId" ? true : undefined}
                  >
                    <SelectValue placeholder={t("linkPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {t("linkOption", {
                          name: option.name,
                          cost: formatMoney(option.baseCost, product.currency, locale),
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
      </ActionForm>
    </div>
  );
}
