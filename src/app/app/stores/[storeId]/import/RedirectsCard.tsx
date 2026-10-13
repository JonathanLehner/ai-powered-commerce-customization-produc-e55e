"use client";

import { useTranslations } from "next-intl";
import { deleteRedirect, saveRedirect } from "@/app/actions/shopify-import";
import type { ActionState } from "@/app/actions/stores";
import { ActionForm, ConfirmSubmit, FormStatus, SuccessToast, useSubmission } from "@/components/forms";
import { Badge } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UrlRedirect } from "@/lib/types";

const TH = "px-3 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

function RemoveRedirect({ storeId, redirectId }: { storeId: string; redirectId: string }) {
  const t = useTranslations("import.redirects");
  const [{ state }, formAction] = useSubmission<ActionState>(deleteRedirect, { status: "idle" });
  return (
    <form action={formAction}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="redirectId" value={redirectId} />
      <ConfirmSubmit size="sm" variant="ghost" confirmLabel={t("remove")}>
        {t("remove")}
      </ConfirmSubmit>
      <SuccessToast state={state} />
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}

/** Redirects from a Shopify store's old addresses, on the store's own domain. */
export function RedirectsCard({ storeId, redirects, hasDomain }: { storeId: string; redirects: UrlRedirect[]; hasDomain: boolean }) {
  const t = useTranslations("import.redirects");
  return (
    <Card asChild>
      <section>
        <CardHeader>
          <CardTitle asChild>
            <h2>{t("title")}</h2>
          </CardTitle>
          <p className="text-sm text-muted-foreground">{hasDomain ? t("body") : t("bodyNoDomain")}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <ActionForm action={saveRedirect} submitLabel={t("save")} hidden={{ storeId }}>
            {(state) => (
              <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="redirect-path">{t("path")}</Label>
                  <Input
                    id="redirect-path"
                    name="path"
                    placeholder="/pages/about-us"
                    autoComplete="off"
                    aria-invalid={state.field === "path" ? true : undefined}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="redirect-target">{t("target")}</Label>
                  <Input
                    id="redirect-target"
                    name="target"
                    placeholder="/pages/about"
                    autoComplete="off"
                    aria-invalid={state.field === "target" ? true : undefined}
                  />
                </div>
              </div>
            )}
          </ActionForm>
          {redirects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="max-h-96 overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH}>{t("path")}</TableHead>
                    <TableHead className={TH}>{t("target")}</TableHead>
                    <TableHead className={TH}>
                      <span className="sr-only">{t("actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {redirects.map((redirect) => (
                    <TableRow key={redirect.id}>
                      <TableCell className="px-3 font-mono text-xs break-all">{redirect.path}</TableCell>
                      <TableCell className="px-3 font-mono text-xs break-all">
                        {redirect.target}{" "}
                        {redirect.source === "shopify_import" ? <Badge tone="slate">{t("fromImport")}</Badge> : null}
                      </TableCell>
                      <TableCell className="px-3 text-right">
                        <RemoveRedirect storeId={storeId} redirectId={redirect.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </section>
    </Card>
  );
}
