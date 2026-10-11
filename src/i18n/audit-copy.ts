import "server-only";
import { getTranslations } from "next-intl/server";
import type { AuditLog } from "@/lib/types";

/** Column headings and category names for an audit spreadsheet, in the reader's language. */
export async function auditCsvLabels() {
  const [t, labels] = await Promise.all([getTranslations("audit.columns"), getTranslations("labels")]);
  return {
    columns: [t("timestamp"), t("person"), t("category"), t("action"), t("summary"), t("detail")],
    storeColumn: t("store"),
    categoryLabel: (entry: AuditLog) => labels(`auditCategory.${entry.category}`),
  };
}
