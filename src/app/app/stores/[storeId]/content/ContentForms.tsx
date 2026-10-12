"use client";

import { useTranslations } from "next-intl";
import { createEntry } from "@/app/actions/content";
import { ActionForm, Field, SubmissionKey } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { CONTENT_LIMITS } from "@/lib/content";
import type { ContentKind } from "@/lib/types";

export function CreateEntryForm({ storeId, kind }: { storeId: string; kind: ContentKind }) {
  const t = useTranslations("content");
  return (
    <ActionForm
      action={createEntry}
      submitLabel={kind === "page" ? t("createPage") : t("createPost")}
      pendingLabel={t("creating")}
      hidden={{ storeId, kind }}
    >
      {(state) => (
        <div className="max-w-md">
          <SubmissionKey status={state.status} prefix="cnt" />
          <Field label={t("title")} htmlFor="new-title">
            <Input
              id="new-title"
              name="title"
              required
              maxLength={CONTENT_LIMITS.title}
              placeholder={kind === "page" ? t("pagePlaceholder") : t("postPlaceholder")}
              className="mt-1.5"
              aria-invalid={state.field === "title" ? true : undefined}
            />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}
