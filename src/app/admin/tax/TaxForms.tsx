"use client";

import { useTranslations } from "next-intl";
import { saveTaxBracket } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaxBracket } from "@/lib/types";
import { REGION_OPTIONS } from "@/lib/util";

function Fields({
  bracket,
  state,
  prefix,
}: {
  bracket?: TaxBracket;
  state: { field?: string };
  prefix: string;
}) {
  const t = useTranslations("admin.tax");
  const labels = useTranslations("labels");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid content-start gap-1.5 sm:col-span-2">
          <Label htmlFor={`${prefix}-name`}>{t("name")}</Label>
          <Input
            id={`${prefix}-name`}
            name="name"
            defaultValue={bracket?.name}
            required
            aria-invalid={state.field === "name" ? true : undefined}
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${prefix}-rate`}>{t("rate")}</Label>
          <Input
            id={`${prefix}-rate`}
            name="rate"
            type="number"
            step="0.01"
            min={0}
            max={50}
            defaultValue={bracket?.rate ?? 20}
            required
            aria-invalid={state.field === "rate" ? true : undefined}
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${prefix}-code`}>{t("code")}</Label>
          <Input
            id={`${prefix}-code`}
            name="code"
            defaultValue={bracket?.code}
            required
            placeholder={t("codePlaceholder")}
            aria-invalid={state.field === "code" ? true : undefined}
          />
        </div>
        <div className="grid content-start gap-1.5 sm:col-span-2">
          <Label htmlFor={`${prefix}-description`}>{t("description")}</Label>
          <Input
            id={`${prefix}-description`}
            name="description"
            defaultValue={bracket?.description}
            placeholder={t("descriptionPlaceholder")}
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm leading-none font-medium text-foreground select-none">{t("regions")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {REGION_OPTIONS.map((region) => (
            <Label
              key={region}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-normal hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <Checkbox
                name="regions"
                value={region}
                defaultChecked={bracket?.regions.includes(region)}
                className="size-3.5"
              />
              {labels(`region.${region}` as "region.APAC")}
            </Label>
          ))}
        </div>
        {state.field === "regions" ? (
          <p className="mt-1.5 text-xs text-destructive">{t("regionRequired")}</p>
        ) : null}
      </fieldset>
    </>
  );
}

export function EditBracketForm({ bracket }: { bracket: TaxBracket }) {
  const t = useTranslations("admin.tax");
  return (
    <ActionForm
      action={saveTaxBracket}
      submitLabel={t("save")}
      submitVariant="outline"
      submitSize="sm"
      hidden={{ bracketId: bracket.id }}
    >
      {(state) => <Fields bracket={bracket} state={state} prefix={bracket.id} />}
    </ActionForm>
  );
}

export function NewBracketForm() {
  const t = useTranslations("admin.tax");
  return (
    <Card asChild>
      <ActionForm
        action={saveTaxBracket}
        submitLabel={t("create")}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("addTitle")}</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("addBody")}
              </p>
            </CardHeader>
            <CardContent>
              <Fields state={state} prefix="new" />
            </CardContent>
          </>
        )}
    </ActionForm>
    </Card>
  );
}
