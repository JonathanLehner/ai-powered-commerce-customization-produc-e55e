"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** A snippet to paste somewhere else: a command, a URL or a config file, with a copy button. */
export function CopyCode({ value, label }: { value: string; label: string }) {
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");
  const t = useTranslations("common");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  }

  const announcement = result === "failed" ? t("copyFailed") : "";

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted py-2.5 pr-24 pl-3 font-mono text-xs leading-relaxed whitespace-pre text-inksoft">
        <code>{value}</code>
      </pre>
      <Button type="button" variant="outline" size="sm" onClick={copy} className="absolute top-1.5 right-1.5 bg-background">
        {result === "copied" ? <CheckIcon /> : <CopyIcon />}
        <span>{result === "copied" ? t("copied") : t("copy")}</span>
        <span className="sr-only">{label}</span>
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
