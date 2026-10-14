import { demoContext, demoTree, TemplateHome } from "@/components/storefront/TemplateStorefront";
import { demoFor, demoParams } from "@/lib/templates/demo-route";

/** The demo home page with one product or a dozen, to see a template with a small or a full catalog. */
const COUNTS = ["1", "12"];

export const dynamic = "force-static";

export function generateStaticParams() {
  return demoParams()
    .filter((p) => p.lang === "en")
    .flatMap((p) => COUNTS.map((n) => ({ ...p, n })));
}

export const metadata = { robots: { index: false, follow: false } };

export default async function DemoHomeWithCount({ params }: PageProps<"/demo/[template]/[lang]/count/[n]">) {
  const { n, ...rest } = await params;
  if (!COUNTS.includes(n)) return null;
  const demo = demoFor(rest, Number(n));
  if (!demo) return null;
  const ctx = await demoContext(demo);
  return <TemplateHome tree={demoTree(demo.template, demo.locale)} ctx={ctx} />;
}
