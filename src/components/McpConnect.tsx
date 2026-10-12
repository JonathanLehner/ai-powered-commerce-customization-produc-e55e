import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { KEY_PLACEHOLDER, mcpSnippets } from "@/lib/mcp/connect";
import { CopyCode } from "./CopyCode";

/** How to add the store's MCP server to an AI assistant: the URL, the header, Claude Code and a config file. */
export async function McpConnect({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "developers" });
  const snippets = mcpSnippets();
  const rows = [
    { label: t("connect.url"), value: snippets.url },
    { label: t("connect.header"), value: snippets.header },
    { label: t("connect.claudeCode"), value: snippets.claudeCode },
    { label: t("connect.json"), hint: t("connect.jsonHint"), value: snippets.json },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("connect.body", { placeholder: KEY_PLACEHOLDER })}</p>
      {rows.map((row) => (
        <div key={row.label} className="space-y-1.5">
          <h3 className="text-sm font-medium text-foreground">{row.label}</h3>
          {row.hint ? <p className="text-xs text-muted-foreground">{row.hint}</p> : null}
          <CopyCode value={row.value} label={row.label} />
        </div>
      ))}
    </div>
  );
}
