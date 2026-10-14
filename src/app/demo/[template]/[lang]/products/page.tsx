import { TemplateCollection } from "@/components/storefront/TemplateStorefront";
import { demoFor, demoParams } from "@/lib/templates/demo-route";

export const dynamic = "force-static";
/** Every template in every language. Kept here rather than on the layout, so the product and collection pages stay dynamic. */
export const generateStaticParams = demoParams;

export default async function DemoShop({ params }: PageProps<"/demo/[template]/[lang]/products">) {
  const demo = demoFor(await params);
  if (!demo) return null;
  const { template, locale, base, products } = demo;
  return <TemplateCollection template={template} locale={locale} base={base} products={products} collection={null} />;
}
