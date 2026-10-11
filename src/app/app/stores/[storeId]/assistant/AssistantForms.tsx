"use client";

import { useTranslations } from "next-intl";
import { requestCopy, requestPrice, requestProductIdeas, requestSupplier } from "@/app/actions/ai";
import { ActionForm } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { REGION_OPTIONS } from "@/lib/util";

/** Every panel on this page is the same card with one field in it. */
function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <>
      <CardHeader>
        <CardTitle asChild>
          <h2>{title}</h2>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </>
  );
}

/** The product picker shared by the copy and pricing panels. */
function ProductPicker({
  id,
  options,
  invalid,
}: {
  id: string;
  options: { id: string; label: string }[];
  invalid: boolean;
}) {
  const t = useTranslations("assistant");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t("product")}</Label>
      <Select name="productId" required>
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid ? true : undefined}>
          <SelectValue placeholder={t("chooseProduct")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function IdeaForm({ storeId }: { storeId: string }) {
  const t = useTranslations("assistant");
  return (
    <Card asChild>
      <ActionForm
        action={requestProductIdeas}
        submitLabel={t("ideasSubmit")}
        pendingLabel={t("drafting")}
        submitVariant="secondary"
        hidden={{ storeId }}
        actionsClassName="px-(--card-spacing)"
      >
        <Panel
          title={t("ideasTitle")}
          description={t("ideasBody")}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="brief">{t("brief")}</Label>
            <Textarea
              id="brief"
              name="brief"
              rows={3}
              placeholder={t("briefPlaceholder")}
              aria-describedby="brief-hint"
            />
            <p id="brief-hint" className="text-xs text-muted-foreground">
              {t("briefHint")}
            </p>
          </div>
        </Panel>
    </ActionForm>
    </Card>
  );
}

export function CopyForm({
  storeId,
  products,
}: {
  storeId: string;
  /** Labelled with SKU and import date, so two copies of one item are tellable apart. */
  products: { id: string; label: string }[];
}) {
  const t = useTranslations("assistant");
  return (
    <Card asChild>
      <ActionForm
        action={requestCopy}
        submitLabel={t("copySubmit")}
        pendingLabel={t("writing")}
        submitVariant="secondary"
        hidden={{ storeId }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <Panel
            title={t("copyTitle")}
            description={t("copyBody")}
          >
            <ProductPicker id="copy-product" options={products} invalid={state.field === "productId"} />
          </Panel>
        )}
    </ActionForm>
    </Card>
  );
}

export function PriceForm({
  storeId,
  products,
}: {
  storeId: string;
  /** Labelled with SKU and import date, so two copies of one item are tellable apart. */
  products: { id: string; label: string }[];
}) {
  const t = useTranslations("assistant");
  return (
    <Card asChild>
      <ActionForm
        action={requestPrice}
        submitLabel={t("priceSubmit")}
        pendingLabel={t("calculating")}
        submitVariant="secondary"
        hidden={{ storeId }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <Panel
            title={t("priceTitle")}
            description={t("priceBody")}
          >
            <ProductPicker id="price-product" options={products} invalid={state.field === "productId"} />
          </Panel>
        )}
    </ActionForm>
    </Card>
  );
}

export function SupplierForm({
  storeId,
  catalog,
}: {
  storeId: string;
  catalog: { id: string; name: string }[];
}) {
  const t = useTranslations("assistant");
  const labels = useTranslations("labels");
  return (
    <Card asChild>
      <ActionForm
        action={requestSupplier}
        submitLabel={t("supplierSubmit")}
        pendingLabel={t("comparing")}
        submitVariant="secondary"
        hidden={{ storeId }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <Panel
            title={t("supplierTitle")}
            description={t("supplierBody")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="supplier-catalog">{t("supplierProduct")}</Label>
                <Select name="catalogId" required>
                  <SelectTrigger
                    id="supplier-catalog"
                    className="w-full"
                    aria-invalid={state.field === "catalogId" ? true : undefined}
                  >
                    <SelectValue placeholder={t("chooseProduct")} />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="destination">{t("destination")}</Label>
                <Select name="destination" defaultValue="North America">
                  <SelectTrigger id="destination" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGION_OPTIONS.map((region) => (
                      <SelectItem key={region} value={region}>
                        {labels(`region.${region}` as "region.APAC")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Panel>
        )}
    </ActionForm>
    </Card>
  );
}
