"use client";

import { MailCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { requestSignInLink, saveAddress, setMarketing } from "@/app/actions/account";
import { CountrySelect } from "@/components/CountrySelect";
import { ActionForm, FormStatus, SubmitButton, useSubmission } from "@/components/forms";
import type { ActionState } from "@/app/actions/stores";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { addressRegionKind } from "@/lib/countries";
import type { CustomerAddress } from "@/lib/types";
import { newId } from "@/lib/util";

/** The email box a shopper signs in with. Once the link is sent, it says where to look. */
export function SignInForm({ storeId }: { storeId: string }) {
  const t = useTranslations("storefront.account");
  const [{ state }, formAction] = useSubmission<ActionState>(requestSignInLink, { status: "idle" });

  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-border bg-muted/50 p-5" role="status">
        <MailCheckIcon aria-hidden className="size-5 text-primary" />
        <p className="mt-3 font-medium text-foreground">{t("checkEmail")}</p>
        <p className="mt-1 text-sm text-inksoft">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="storeId" value={storeId} />
      <div>
        <Label htmlFor="account-email">{t("email")}</Label>
        <Input
          id="account-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={state.field === "email" ? true : undefined}
          className="mt-1.5"
        />
      </div>
      <FormStatus state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel={t("sending")}>
        {t("sendLink")}
      </SubmitButton>
    </form>
  );
}

const REGION_LABELS = { state: "regionState", province: "regionProvince", prefecture: "regionPrefecture" } as const;

/** Adds an address, or edits `address` when given. */
export function AddressForm({
  storeId,
  address,
  defaultCountry,
  idPrefix,
}: {
  storeId: string;
  address?: CustomerAddress;
  defaultCountry: string;
  /** Keeps field ids unique when several of these forms share the page. */
  idPrefix: string;
}) {
  const t = useTranslations("storefront.account");
  const checkout = useTranslations("storefront.checkout");
  const [country, setCountry] = useState(address?.country ?? defaultCountry);
  const [addressId] = useState(() => address?.id ?? newId("adr"));
  const regionKind = addressRegionKind(country);
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <ActionForm
      action={saveAddress}
      submitLabel={t("saveAddress")}
      pendingLabel={t("saving")}
      hidden={{ storeId, addressId }}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={id("name")}>{checkout("fullName")}</Label>
            <Input id={id("name")} name="name" autoComplete="name" defaultValue={address?.name} required className="mt-1.5" aria-invalid={state.field === "name" ? true : undefined} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={id("line1")}>{checkout("street")}</Label>
            <Input id={id("line1")} name="line1" autoComplete="address-line1" defaultValue={address?.line1} required className="mt-1.5" aria-invalid={state.field === "line1" ? true : undefined} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={id("line2")}>{checkout("line2")}</Label>
            <Input id={id("line2")} name="line2" autoComplete="address-line2" defaultValue={address?.line2} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor={id("city")}>{checkout("city")}</Label>
            <Input id={id("city")} name="city" autoComplete="address-level2" defaultValue={address?.city} required className="mt-1.5" aria-invalid={state.field === "city" ? true : undefined} />
          </div>
          <div>
            <Label htmlFor={id("postalCode")}>{checkout("postalCode")}</Label>
            <Input id={id("postalCode")} name="postalCode" autoComplete="postal-code" defaultValue={address?.postalCode} required className="mt-1.5" aria-invalid={state.field === "postalCode" ? true : undefined} />
          </div>
          <div>
            <Label htmlFor={id("country")}>{checkout("country")}</Label>
            <CountrySelect id={id("country")} name="country" value={country} onChange={setCountry} invalid={state.field === "country"} />
          </div>
          {regionKind ? (
            <div>
              <Label htmlFor={id("region")}>{checkout(REGION_LABELS[regionKind])}</Label>
              <Input id={id("region")} name="region" autoComplete="address-level1" defaultValue={address?.region} required className="mt-1.5" aria-invalid={state.field === "region" ? true : undefined} />
            </div>
          ) : null}
          <div>
            <Label htmlFor={id("phone")}>{checkout("phone")}</Label>
            <Input id={id("phone")} name="phone" type="tel" autoComplete="tel" defaultValue={address?.phone} className="mt-1.5" aria-invalid={state.field === "phone" ? true : undefined} />
          </div>
          <div className="flex items-start gap-2.5 text-sm text-inksoft sm:col-span-2">
            <Switch id={id("default")} name="isDefault" defaultChecked={address?.isDefault ?? false} className="mt-0.5" />
            <Label htmlFor={id("default")} className="block cursor-pointer font-normal">
              {t("makeDefault")}
            </Label>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export function MarketingForm({ storeId, subscribed }: { storeId: string; subscribed: boolean }) {
  const t = useTranslations("storefront.account");
  return (
    <ActionForm action={setMarketing} submitLabel={t("savePreferences")} pendingLabel={t("saving")} submitVariant="outline" hidden={{ storeId }}>
      <div className="flex items-start gap-2.5 text-sm text-inksoft">
        <Switch id="marketing" name="subscribed" defaultChecked={subscribed} className="mt-0.5" />
        <Label htmlFor="marketing" className="block cursor-pointer font-normal">
          {t("marketingLabel")}
        </Label>
      </div>
    </ActionForm>
  );
}
