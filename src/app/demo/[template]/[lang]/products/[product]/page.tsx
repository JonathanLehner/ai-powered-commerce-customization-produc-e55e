import { demoContext, TemplateMissing, TemplateProduct } from "@/components/storefront/TemplateStorefront";
import { demoFor, demoParams } from "@/lib/templates/demo-route";

/**
 * `template` and `lang` are the demo's root params, so every route lists them.
 * The page itself is drawn on request from the template's data, with no
 * database or request reads: prerendering every product and collection of
 * every template in nine languages would add hundreds of megabytes to the
 * build for pages few open.
 */
export const generateStaticParams = demoParams;
export const dynamic = "force-static";

export default async function DemoProduct({ params }: PageProps<"/demo/[template]/[lang]/products/[product]">) {
  const { product: slug, ...rest } = await params;
  const demo = demoFor(rest);
  if (!demo) return null;
  const product = demo.products.find((p) => p.card.slug === slug);
  if (!product) return <TemplateMissing locale={demo.locale} base={demo.base} />;
  const ctx = await demoContext(demo);
  return <TemplateProduct template={demo.template} locale={demo.locale} base={demo.base} product={product} ctx={ctx} />;
}
