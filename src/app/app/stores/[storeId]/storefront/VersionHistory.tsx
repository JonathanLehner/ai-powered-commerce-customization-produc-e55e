"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { restoreVersion } from "@/app/actions/storefront";
import { SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SECTION_DEFS } from "@/lib/storefront-schema";
import {
  diffSections,
  isUnchanged,
  sameSections,
  type SectionChange,
  type SectionSummary,
} from "@/lib/storefront-versions";
import { classNames, formatDate, formatDateTime } from "@/lib/util";

export interface HistoryEntry {
  id: string;
  /** Empty when the version was not named. */
  label: string;
  kind: "published" | "draft";
  savedAt: string;
  savedBy: string;
  sections: SectionSummary[];
}

const DRAFT_ROW = "current-draft";

export function VersionHistory({
  storeId,
  history,
  liveVersionId,
  liveSections,
  savedSections,
  canvasSections,
}: {
  storeId: string;
  history: HistoryEntry[];
  liveVersionId: string | null;
  /** The live storefront's sections, or null when it was never published. */
  liveSections: SectionSummary[] | null;
  /** The last saved draft. */
  savedSections: SectionSummary[];
  /** What the canvas holds now. */
  canvasSections: SectionSummary[];
}) {
  const t = useTranslations("editor");
  const uiLocale = useLocale();
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const live = liveSections ?? [];
  const draftDiffers = liveSections === null || !sameSections(canvasSections, liveSections);
  const unsaved = !sameSections(canvasSections, savedSections);
  const showDraft = draftDiffers && canvasSections.length > 0;
  const shown = publishedOnly ? history.filter((v) => v.kind === "published") : history;

  if (history.length === 0 && !showDraft) return null;

  const labelOf = (v: HistoryEntry) =>
    v.label ||
    t("autoLabel", {
      kind: v.kind === "published" ? t("kindPublished") : t("kindDraft"),
      count: v.sections.length,
      date: formatDate(v.savedAt, uiLocale),
    });

  const toggle = (id: string) => setOpen((current) => (current === id ? null : id));

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle asChild className="text-sm font-semibold">
          <h2>{t("history")}</h2>
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            <Switch id="published-only" size="sm" checked={publishedOnly} onCheckedChange={setPublishedOnly} />
            <Label htmlFor="published-only" className="text-xs font-normal text-muted-foreground">
              {t("publishedOnly")}
            </Label>
          </div>
        </CardAction>
        <p className="text-xs text-muted-foreground">{t("historyBody")}</p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {showDraft && !publishedOnly ? (
            <li className="rounded-lg border border-dashed border-border">
              <button
                type="button"
                aria-expanded={open === DRAFT_ROW}
                onClick={() => toggle(DRAFT_ROW)}
                className="w-full rounded-lg p-3 text-left hover:bg-muted/60"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{t("currentDraft")}</span>
                  <Badge tone="amber">{t("kindDraft")}</Badge>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {unsaved
                    ? t("unsavedChanges")
                    : t("sectionCount", { count: canvasSections.length })}
                </span>
              </button>
              {open === DRAFT_ROW ? (
                <div className="border-t border-border p-3">
                  <Changes diff={diffSections(live, canvasSections)} hasLive={liveSections !== null} />
                </div>
              ) : null}
            </li>
          ) : null}
          {shown.map((version) => {
            const isLive = version.id === liveVersionId;
            const expanded = open === version.id;
            return (
              <li
                key={version.id}
                id={`version-${version.id}`}
                className={classNames(
                  "scroll-mt-24 rounded-lg border target:border-primary",
                  isLive ? "border-emerald-200" : "border-border",
                )}
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggle(version.id)}
                  className="w-full rounded-lg p-3 text-left hover:bg-muted/60"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">{labelOf(version)}</span>
                    {isLive ? <Badge tone="green">{t("live")}</Badge> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {version.savedBy} · {formatDateTime(version.savedAt, uiLocale)}
                  </span>
                </button>
                {expanded ? (
                  <div className="space-y-3 border-t border-border p-3">
                    <Changes diff={diffSections(live, version.sections)} hasLive={liveSections !== null} />
                    <form action={restoreVersion}>
                      <input type="hidden" name="storeId" value={storeId} />
                      <input type="hidden" name="versionId" value={version.id} />
                      <SubmitButton variant="outline" size="sm" pendingLabel={t("restoring")}>
                        {t("restore")}
                      </SubmitButton>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
          {publishedOnly && shown.length === 0 ? (
            <li className="text-xs text-muted-foreground">{t("noPublished")}</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

function Changes({
  diff,
  hasLive,
}: {
  diff: ReturnType<typeof diffSections>;
  hasLive: boolean;
}) {
  const t = useTranslations("editor");
  if (isUnchanged(diff)) return <p className="text-xs text-muted-foreground">{t("sameAsLive")}</p>;

  const name = (change: SectionChange) =>
    change.type in SECTION_DEFS ? t(`sections.${change.type}.name`) : t("section");
  const groups: { key: string; label: string; tone: "green" | "rose" | "iris" | "amber"; items: SectionChange[] }[] = [
    { key: "added", label: t("changeAdded"), tone: "green", items: diff.added },
    { key: "removed", label: t("changeRemoved"), tone: "rose", items: diff.removed },
    { key: "moved", label: t("changeMoved"), tone: "iris", items: diff.moved },
    { key: "edited", label: t("changeEdited"), tone: "amber", items: diff.edited },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{hasLive ? t("comparedWithLive") : t("nothingLive")}</p>
      <dl className="space-y-1.5">
        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <div key={g.key} className="flex flex-wrap items-center gap-1.5">
              <dt>
                <Badge tone={g.tone}>{g.label}</Badge>
              </dt>
              <dd className="text-xs text-foreground">{g.items.map(name).join(", ")}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
