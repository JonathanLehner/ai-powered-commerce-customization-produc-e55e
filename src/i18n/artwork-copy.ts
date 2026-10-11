import type { ArtworkIssue } from "@/lib/artwork";

/**
 * The `artworkIssues` translator from `useTranslations` or `getTranslations`,
 * narrowed to what is needed to word a pre-flight issue.
 */
type IssueTranslator = (key: string, values?: Record<string, string | number>) => string;

/** A supplier pre-flight issue in the reader's language, falling back to the English the check wrote. */
export function artworkIssueText(
  translate: unknown,
  issue: ArtworkIssue,
  locale: string,
): { message: string; fix: string } {
  const t = translate as IssueTranslator & { has: (key: string) => boolean };
  if (!t.has(`${issue.code}.message`)) return { message: issue.message, fix: issue.fix };
  const values: Record<string, string | number> = { ...issue.values };
  if (issue.edges) {
    values.edges = new Intl.ListFormat(locale, { type: "conjunction" }).format(
      issue.edges.map((edge) => t(`edges.${edge}`)),
    );
  }
  return { message: t(`${issue.code}.message`, values), fix: t(`${issue.code}.fix`, values) };
}
