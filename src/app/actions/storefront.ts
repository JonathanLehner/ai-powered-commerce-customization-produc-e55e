"use server";

import { getFormatter, getTranslations } from "next-intl/server";
import { formatMinorUnits } from "@/i18n/format";
import { refusal } from "@/lib/operations/action-state";
import {
  publishReview,
  publishStorefront as publish,
  restoreStorefrontVersion as restore,
  revertStorefront as revert,
  saveStorefrontDraft as saveDraft,
} from "@/lib/operations/storefront";
import { saveBranding } from "@/lib/operations/store-settings";
import { applyTemplate, publishStarterProducts as publishStarters } from "@/lib/operations/templates";
import { isLocale } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { listStoreProducts } from "@/lib/data";
import { siteOrigin } from "@/lib/email";
import { publishBlockersFor, type PublishBlockerCode } from "@/lib/publish-blockers";
import { templatePreviewLink } from "@/lib/storefront-preview";
import { getTemplate } from "@/lib/templates/index";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { StoreDesign } from "@/lib/store-design";
import { THEMES, type ThemeKey } from "@/lib/types";
import type { ActionState } from "./stores";

export async function saveStorefrontDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  try {
    await saveDraft(await operationContext(access), {
      tree: String(formData.get("tree") ?? ""),
      label: String(formData.get("label") ?? ""),
      locale: String(formData.get("locale") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("draftSaved") };
}

/** Copy to look at before publishing: where it is, what it says and what is wrong with it. */
export interface PublishReviewView {
  items: { key: string; where: string; text: string; message: string }[];
  /** Template sample fields left as written that are not listed above. */
  sampleLeft: number;
  shippingHref: string;
}

export type PublishState = ActionState & { review?: PublishReviewView };

/**
 * Publishes the editor's page. Unless `confirmed` is set, shipping claims the
 * store's rates do not back and template sample copy are returned for review
 * first, and nothing is published.
 */
export async function publishStorefront(_prev: ActionState, formData: FormData): Promise<PublishState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  try {
    const ctx = await operationContext(access);
    const tree = String(formData.get("tree") ?? "");
    if (formData.get("confirmed") !== "1") {
      const review = await publishReview(ctx, tree);
      if (review.claims.length > 0 || review.sample.length > 0) {
        const [e, format] = await Promise.all([getTranslations("editor"), getFormatter()]);
        const where = (area: string, type: string, field: string) =>
          area === "site"
            ? e(`site.fields.${field}` as "site.title")
            : area === "block"
              ? `${e("tabs.productPage")}: ${e(`blocks.${type}.name` as "blocks.ProductMain.name")}`
              : e(`sections.${type}.name` as "sections.HeroSection.name");
        // Promises the rates contradict first, then sample promises to rewrite.
        const claims = [...review.claims].sort((a, b) => Number(a.problem.kind === "sample") - Number(b.problem.kind === "sample"));
        const items = claims.map((claim) => {
          const p = claim.problem;
          const message =
            p.kind === "free"
              ? e("review.free")
              : p.kind === "freeOver"
                ? e("review.freeOver", { amount: formatMinorUnits(format, p.threshold, access.store.defaultCurrency) })
                : p.kind === "days"
                  ? e("review.days", { days: p.days, fastest: p.fastest })
                  : e("review.sample");
          return { key: claim.key, where: where(claim.area, claim.type, claim.field), text: claim.text, message };
        });
        const listed = new Set(items.map((item) => item.key));
        return {
          status: "idle",
          review: {
            items,
            sampleLeft: review.sample.filter((field) => !listed.has(field.key)).length,
            shippingHref: `/app/stores/${storeId}/shipping`,
          },
        };
      }
    }
    await publish(ctx, { tree, label: String(formData.get("label") ?? "") });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("published") };
}

export async function revertStorefront(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.storefront");
  await revert(await operationContext(access));
}

export async function restoreVersion(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const access = await assertStoreAccess(storeId, "store.storefront");
  await restore(await operationContext(access), versionId);
}

/** The editor's Design panel: the preset and the tokens on top of it. They apply to the live storefront straight away. */
export async function saveStoreDesign(input: { storeId: string; theme: string; design: StoreDesign }): Promise<ActionState> {
  const access = await assertStoreAccess(input.storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  const theme = (input.theme in THEMES ? input.theme : access.store.theme) as ThemeKey;
  try {
    await saveBranding(await operationContext(access), { theme, logoUrl: access.store.logoUrl, design: input.design ?? {} });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("designSaved") };
}

/** Makes a template the storefront draft, keeping the draft it replaces in the history. */
export async function applyStoreTemplate(input: {
  storeId: string;
  templateId: string;
  addStarterProducts?: boolean;
}): Promise<ActionState> {
  const access = await assertStoreAccess(input.storeId, "store.storefront");
  const t = await getTranslations("actions.storefront");
  try {
    const result = await applyTemplate(await operationContext(access), {
      templateId: input.templateId,
      addStarterProducts: input.addStarterProducts === true,
    });
    return {
      status: "success",
      message: result.productsAdded.length > 0 ? t("templateAppliedWithProducts", { count: result.productsAdded.length }) : t("templateApplied"),
    };
  } catch (error) {
    return refusal(error);
  }
}

/** Publishes the products a template added that are not on sale yet; reports which stayed back and why. */
export async function publishStarterProducts(input: {
  storeId: string;
}): Promise<{ published: number; skipped: SkippedStarter[] } | { error: string }> {
  const access = await assertStoreAccess(input.storeId, "store.catalog");
  try {
    const ctx = await operationContext(access);
    const outcome = await publishStarters(ctx);
    const failed = new Set(outcome.failed.map((f) => f.id));
    const held = (await listStoreProducts(access.store.id)).filter((p) => failed.has(p.id));
    const blockers = await publishBlockersFor(held, ctx.locale);
    const skipped = outcome.failed.map(({ id, name, reason }) => {
      const list = blockers.get(id) ?? [];
      return {
        id,
        name,
        blockers: list.length > 0 ? list.map(({ code, reason, fix }) => ({ code, reason, fix })) : [{ code: null, reason, fix: "" }],
      };
    });
    return { published: outcome.succeeded.length, skipped };
  } catch (error) {
    return { error: refusal(error).message ?? "" };
  }
}

export interface SkippedStarter {
  id: string;
  name: string;
  blockers: { code: PublishBlockerCode | null; reason: string; fix: string }[];
}

/** A signed link to the store's products in a template, before it is applied. */
export async function previewStoreTemplate(input: { storeId: string; templateId: string; locale: string }): Promise<{ url: string } | { error: string }> {
  const access = await assertStoreAccess(input.storeId, "store.storefront");
  const template = getTemplate(input.templateId);
  if (!template) return { error: (await getTranslations("actions.storefront"))("templateMissing") };
  const { locales, defaultLocale } = storeLanguages(access.store);
  const locale = isLocale(input.locale) && locales.includes(input.locale) ? input.locale : defaultLocale;
  return { url: (await templatePreviewLink(access.store, template.id, locale, await siteOrigin())).url };
}
