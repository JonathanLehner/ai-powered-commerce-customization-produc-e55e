import { demoContext, demoTree, TemplateHome } from "@/components/storefront/TemplateStorefront";
import { demoFor, demoParams } from "@/lib/templates/demo-route";

export const dynamic = "force-static";
/** Every template in every language. Kept here rather than on the layout, so the product and collection pages stay dynamic. */
export const generateStaticParams = demoParams;

export default async function DemoHome({ params }: PageProps<"/demo/[template]/[lang]">) {
  const demo = demoFor(await params);
  if (!demo) return null;
  const ctx = await demoContext(demo);
  return <TemplateHome tree={demoTree(demo.template, demo.locale)} ctx={ctx} />;
}
