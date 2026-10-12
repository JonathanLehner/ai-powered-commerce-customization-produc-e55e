import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { setGiftCardStatus } from "@/app/actions/gift-cards";
import { CopyField, SubmitButton } from "@/components/forms";
import { Badge, Callout, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listGiftCards } from "@/lib/gift-card-data";
import { giftCardRefusal, maskGiftCode } from "@/lib/gift-cards";
import { findGiftCardProduct } from "@/lib/operations/gift-cards";
import { requireStoreAccess } from "@/lib/session";
import { formatDate, formatMoney, toMajorString } from "@/lib/util";
import { GiftCardProductForm, IssueGiftCardForm } from "./GiftCardForms";

export default async function GiftCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ issued?: string }>;
}) {
  const [{ storeId }, { issued }] = await Promise.all([params, searchParams]);
  const { store } = await requireStoreAccess(storeId, "store.settings");
  const [cards, product, t, locale] = await Promise.all([
    listGiftCards(storeId),
    findGiftCardProduct(storeId),
    getTranslations("giftCards"),
    getLocale(),
  ]);
  const money = (minor: number, currency: string) => formatMoney(minor, currency, locale);
  const justIssued = issued ? cards.find((card) => card.id === issued && card.source === "manual") : undefined;
  const usable = cards.filter((card) => !giftCardRefusal(card));
  const outstanding = usable
    .filter((card) => card.currency === store.defaultCurrency)
    .reduce((sum, card) => sum + card.balance, 0);
  const stateOf = (card: (typeof cards)[number]) => {
    const refusal = giftCardRefusal(card);
    if (!refusal) return { label: t("stateActive"), tone: "green" as const };
    if (refusal === "disabled") return { label: t("stateDisabled"), tone: "slate" as const };
    if (refusal === "expired") return { label: t("stateExpired"), tone: "rose" as const };
    return { label: t("stateSpent"), tone: "neutral" as const };
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      {justIssued ? (
        <Callout tone="green" title={t("issuedTitle", { amount: money(justIssued.initialValue, justIssued.currency) })}>
          <p className="mb-2">{justIssued.recipientEmail ? t("issuedSent", { email: justIssued.recipientEmail }) : t("issuedBody")}</p>
          <CopyField value={justIssued.code} label={t("copyCode")} />
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("issuedCount")} value={String(cards.length)} />
        <StatCard label={t("activeCount")} value={String(usable.length)} />
        <StatCard label={t("outstanding")} value={money(outstanding, store.defaultCurrency)} sub={t("outstandingHint")} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle asChild className="text-sm font-semibold">
            <h2>{t("productTitle")}</h2>
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("productHint")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {product?.status === "published" ? (
            <p className="text-sm">
              <Link
                href={`/s/${store.slug}/products/${encodeURIComponent(product.slug)}`}
                target="_blank"
                rel="noreferrer"
                prefetch={false}
                className="font-medium text-primary hover:underline"
              >
                {t("viewProduct")}
              </Link>
            </p>
          ) : null}
          <GiftCardProductForm
            storeId={storeId}
            currency={store.defaultCurrency}
            defaults={{
              name: product?.name ?? t("defaultProductName"),
              description: product?.description ?? t("defaultProductDescription"),
              denominations: product
                ? product.variants.map((v) => toMajorString(v.price, product.currency)).join(" ")
                : [25, 50, 100].map((v) => toMajorString(v * 100, store.defaultCurrency)).join(" "),
              published: product ? product.status === "published" : true,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle asChild className="text-sm font-semibold">
            <h2>{t("issueTitle")}</h2>
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("issueHint")}</p>
        </CardHeader>
        <CardContent>
          <IssueGiftCardForm storeId={storeId} currencies={store.currencies} defaultCurrency={store.defaultCurrency} />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">{t("listTitle")}</h2>
        {cards.length === 0 ? (
          <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("code")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="text-right">{t("balance")}</TableHead>
                  <TableHead>{t("source")}</TableHead>
                  <TableHead>{t("recipient")}</TableHead>
                  <TableHead className="text-right">{t("created")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((card) => {
                  const state = stateOf(card);
                  return (
                    <TableRow key={card.id} id={card.id} className="scroll-mt-24 align-top">
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {maskGiftCode(card.last4)}
                        {card.transactions.length > 1 ? (
                          <details className="mt-1 font-sans">
                            <summary className="cursor-pointer text-xs text-primary">{t("history")}</summary>
                            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {card.transactions.map((entry) => (
                                <li key={entry.id}>
                                  {formatDate(entry.at, locale)} · {t(`kind.${entry.kind}`)} {money(entry.amount, card.currency)}
                                  {entry.orderCode ? ` · ${entry.orderCode}` : ""}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge tone={state.tone}>{state.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(card.balance, card.currency)}
                        <span className="block text-xs text-muted-foreground">
                          {t("ofValue", { value: money(card.initialValue, card.currency) })}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {card.source === "purchase" && card.orderId ? (
                          <Link href={`/app/stores/${storeId}/orders/${card.orderId}`} className="text-primary hover:underline">
                            {t("boughtOn", { code: card.orderCode ?? "" })}
                          </Link>
                        ) : (
                          t("issuedBy", { name: card.createdBy })
                        )}
                      </TableCell>
                      <TableCell className="text-sm break-all">{card.recipientEmail}</TableCell>
                      <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatDate(card.createdAt, locale)}
                        {card.expiresAt ? (
                          <span className="block">{t("expiresOn", { date: formatDate(card.expiresAt, locale) })}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={setGiftCardStatus}>
                          <input type="hidden" name="storeId" value={storeId} />
                          <input type="hidden" name="cardId" value={card.id} />
                          <input type="hidden" name="status" value={card.status === "active" ? "disabled" : "active"} />
                          <SubmitButton variant="ghost" size="sm" pendingLabel={t("saving")}>
                            {card.status === "active" ? t("disable") : t("enable")}
                          </SubmitButton>
                        </form>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
