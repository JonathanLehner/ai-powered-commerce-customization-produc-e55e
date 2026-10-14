import { TemplateCollection, TemplateMissing } from "@/components/storefront/TemplateStorefront";
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

export default async function DemoCollection({ params }: PageProps<"/demo/[template]/[lang]/collections/[handle]">) {
  const { handle, ...rest } = await params;
  const demo = demoFor(rest);
  if (!demo) return null;
  const { template, locale, base, products, collections } = demo;
  const collection = collections.find((c) => c.handle === handle);
  if (!collection) return <TemplateMissing locale={locale} base={base} />;
  return <TemplateCollection template={template} locale={locale} base={base} products={products} collection={collection} />;
}
