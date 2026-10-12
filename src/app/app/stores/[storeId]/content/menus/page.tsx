import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LOCALE_NAMES } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { MENU_NAMES, storeMenus } from "@/lib/content";
import { listContentEntries } from "@/lib/content-data";
import { listProductCollections, listStoreProducts } from "@/lib/data";
import { requireStoreAccess } from "@/lib/session";
import { ContentTabs } from "../ContentTabs";
import { MenuEditor } from "./MenuEditor";

export default async function MenusPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.storefront");
  const [collections, products, entries, t] = await Promise.all([
    listProductCollections(storeId),
    listStoreProducts(storeId),
    listContentEntries(storeId),
    getTranslations("content.menus"),
  ]);
  const menus = storeMenus(store);
  const { locales, defaultLocale } = storeLanguages(store);
  const targets = {
    collection: collections.map((c) => ({ id: c.id, name: c.name })),
    product: products.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name })),
    page: entries.filter((e) => e.kind === "page").map((e) => ({ id: e.id, name: e.title })),
    post: entries.filter((e) => e.kind === "post").map((e) => ({ id: e.id, name: e.title })),
  };
  const languages = locales.filter((code) => code !== defaultLocale).map((code) => ({ code, name: LOCALE_NAMES[code] }));

  return (
    <div className="space-y-6">
      <ContentTabs storeId={storeId} active="menus" />
      <PageHeader title={t("title")} description={t("description")} />
      {MENU_NAMES.map((name) => (
        <Card key={name}>
          <CardHeader>
            <CardTitle asChild className="text-sm font-semibold">
              <h2>{name === "header" ? t("header") : t("footer")}</h2>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{name === "header" ? t("headerHint") : t("footerHint")}</p>
          </CardHeader>
          <CardContent>
            <MenuEditor storeId={storeId} menu={name} items={menus[name]} targets={targets} languages={languages} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
