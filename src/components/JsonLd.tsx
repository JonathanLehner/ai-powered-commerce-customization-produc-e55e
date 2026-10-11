import { jsonLdScript, type JsonLd as JsonLdData } from "@/lib/seo";

/** Structured data for search engines, inlined in the page's HTML. */
export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}
