"use client";

import {
  CheckIcon,
  CircleAlertIcon,
  HistoryIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  MinusIcon,
  RotateCcwIcon,
  SendHorizontalIcon,
  SparklesIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { formatAgo } from "@/i18n/format";
import type { ChatItem } from "@/lib/assistant/service";
import type { ConfirmReason } from "@/lib/assistant/policy";
import { uploadImage } from "@/lib/upload-client";
import { useOptionalAssistant } from "./context";

const REASON_TONES: Record<ConfirmReason, "amber" | "rose" | "iris" | "brand" | "slate"> = {
  publish: "iris",
  irreversible: "rose",
  price: "amber",
  email: "brand",
  payment: "rose",
  live: "slate",
};

/** **bold** and `code` inside a line. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
          <code key={i} className="rounded bg-muted px-1 font-mono text-[0.85em]">
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** The model's reply: paragraphs and "- " lists, nothing else. */
function Reply({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-*•] /.test(line))) {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-4">
              {lines.map((line, j) => (
                <li key={j}>
                  <Inline text={line.replace(/^\s*[-*•] /, "")} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            <Inline text={block} />
          </p>
        );
      })}
    </div>
  );
}

function Item({ item }: { item: ChatItem }) {
  const t = useTranslations("assistantChat");
  if (item.kind === "user") {
    return (
      <div className="ml-8 flex flex-col items-end gap-1.5">
        {item.attachments?.length ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            {item.attachments.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={t("attachment")} className="size-16 rounded-md border border-border object-cover" loading="lazy" />
            ))}
          </div>
        ) : null}
        {item.text ? (
          <p className="rounded-xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">{item.text}</p>
        ) : null}
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="mr-6 text-sm text-foreground">
        <Reply text={item.text ?? ""} />
      </div>
    );
  }
  if (item.kind === "step") {
    const running = !item.status;
    return (
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        {running ? (
          <LoaderCircleIcon className="mt-px size-3.5 shrink-0 animate-spin" aria-hidden />
        ) : item.status === "done" ? (
          <CheckIcon className="mt-px size-3.5 shrink-0 text-green-600" aria-hidden />
        ) : item.status === "declined" ? (
          <MinusIcon className="mt-px size-3.5 shrink-0" aria-hidden />
        ) : (
          <CircleAlertIcon className="mt-px size-3.5 shrink-0 text-rose-600" aria-hidden />
        )}
        <span className={item.status === "declined" ? "line-through" : undefined}>
          {item.text}
          {running ? "…" : null}
          {item.status === "error" && item.message ? <span className="block text-rose-700">{item.message}</span> : null}
        </span>
        {item.status === "error" ? <span className="sr-only">{t("stepFailed")}</span> : null}
      </p>
    );
  }
  return <p className="text-center text-xs text-muted-foreground">{t(`notes.${item.note ?? "cancelled"}`)}</p>;
}

function ConfirmCard() {
  const assistant = useOptionalAssistant();
  const t = useTranslations("assistantChat");
  const pending = assistant?.chat.pending;
  if (!assistant || !pending) return null;
  const { chat } = assistant;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm" role="group" aria-label={t("confirmTitle")}>
      <p className="font-medium text-foreground">{t("confirmTitle")}</p>
      <ul className="mt-2 space-y-3">
        {pending.actions.map((action) => (
          <li key={action.toolCallId}>
            <p className="font-medium text-foreground">{action.title}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {action.reasons.map((reason) => (
                <Badge key={reason} tone={REASON_TONES[reason]}>
                  {t(`reasons.${reason}`)}
                </Badge>
              ))}
            </div>
            {action.params.length > 0 ? (
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md bg-background p-2 text-xs">
                {action.params.map((param) => (
                  <Fragment key={param.key}>
                    <dt className="font-mono text-muted-foreground">{param.key}</dt>
                    <dd className="break-words text-foreground">{param.value}</dd>
                  </Fragment>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={chat.confirm} disabled={chat.busy}>
          {pending.actions.length > 1 ? t("confirmAll", { count: pending.actions.length }) : t("confirm")}
        </Button>
        <Button size="sm" variant="outline" onClick={chat.cancel} disabled={chat.busy}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

function Starters({ onPick }: { onPick: (text: string) => void }) {
  const assistant = useOptionalAssistant();
  const t = useTranslations("assistantChat");
  if (!assistant) return null;
  const prompts: string[] = [];
  if (assistant.canStorefront) prompts.push(t("starters.darkerHero"), t("starters.playfulTemplate"), t("starters.faq"));
  if (assistant.canCatalog) prompts.push(t("starters.ideas"), t("starters.copy"), t("starters.price"), t("starters.supplier"));
  if (prompts.length === 0) prompts.push(t("starters.summary"), t("starters.orders"));
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <SparklesIcon className="size-4 text-primary" aria-hidden />
        {t("emptyTitle")}
      </div>
      <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
      <div className="flex flex-wrap gap-1.5">
        {prompts.slice(0, 6).map((prompt) => (
          <Button key={prompt} size="sm" variant="outline" className="h-auto py-1 text-left whitespace-normal" onClick={() => onPick(prompt)}>
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  );
}

function History() {
  const assistant = useOptionalAssistant();
  const t = useTranslations("assistantChat");
  const format = useFormatter();
  if (!assistant) return null;
  const { chat } = assistant;
  const now = new Date();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("history")} disabled={chat.busy}>
          <HistoryIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t("history")}</DropdownMenuLabel>
        {chat.conversations.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("noHistory")}</p>
        ) : (
          chat.conversations.map((conversation) => (
            <DropdownMenuItem
              key={conversation.id}
              onSelect={() => chat.openConversation(conversation.id)}
              data-checked={conversation.id === chat.conversationId ? "true" : undefined}
              className="flex flex-col items-start gap-0"
            >
              <span className="w-full truncate">{conversation.title || t("untitled")}</span>
              <span className="text-xs text-muted-foreground">{formatAgo(format, conversation.updatedAt, now)}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The chat: the conversation, what waits for confirmation, and the message box. */
export function AssistantPanel({ onClose, closeLabel }: { onClose?: () => void; closeLabel?: "close" | "collapse" }) {
  const assistant = useOptionalAssistant();
  const t = useTranslations("assistantChat");
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const chat = assistant?.chat;
  const count = chat?.items.length ?? 0;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [count, chat?.pending, chat?.busy]);

  if (!assistant || !chat) return null;

  function submit() {
    if (!chat) return;
    const message = text.trim();
    if (!message && attachments.length === 0) return;
    if (uploading) {
      setUploadError(t("waitForUpload"));
      return;
    }
    if (!chat.send(message, attachments)) return;
    setText("");
    setAttachments([]);
  }

  async function attach(files: FileList | null) {
    if (!files?.length || !assistant) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const picked of Array.from(files).slice(0, 4 - attachments.length)) {
        const stored = await uploadImage(picked, "section", { storeId: assistant.storeId });
        setAttachments((list) => [...list, stored.url]);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("uploadFailed"));
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

  const closeText = closeLabel === "collapse" ? t("collapse") : t("close");
  const last = chat.items.at(-1);
  const waiting = chat.busy && (!last || last.kind === "user" || (last.kind === "step" && Boolean(last.status)));

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <SparklesIcon className="size-4 text-primary" aria-hidden />
        <h2 className="flex-1 truncate text-sm font-semibold text-foreground">{t("title")}</h2>
        <History />
        <Button variant="ghost" size="icon-sm" aria-label={t("newChat")} onClick={chat.newChat} disabled={chat.busy}>
          <SquarePenIcon />
        </Button>
        {onClose ? (
          <Button variant="ghost" size="icon-sm" aria-label={closeText} onClick={onClose}>
            {closeLabel === "collapse" ? <MinusIcon /> : <XIcon />}
          </Button>
        ) : null}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {!chat.loaded ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
            {t("loading")}
          </p>
        ) : chat.items.length === 0 ? (
          <Starters
            onPick={(prompt) => {
              setText(prompt);
              input.current?.focus();
            }}
          />
        ) : (
          chat.items.map((item) => <Item key={item.id} item={item} />)
        )}
        {waiting ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
            {t("thinking")}
          </p>
        ) : null}
        <ConfirmCard />
        {assistant.staleEditor ? (
          <div className="rounded-lg border border-border bg-muted p-3 text-sm">
            <p>{t("staleEditor")}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={assistant.reloadEditor}>
              {t("reloadEditor")}
            </Button>
          </div>
        ) : null}
        {chat.undo && !chat.busy && !chat.pending ? (
          <Button size="sm" variant="outline" onClick={chat.undoLast}>
            <RotateCcwIcon />
            {t("undo")}
          </Button>
        ) : null}
        {chat.error ? (
          <p className="flex items-start gap-2 text-sm text-rose-700" role="alert">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {chat.error}
          </p>
        ) : null}
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((url) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={t("attachment")} className="size-12 rounded-md border border-border object-cover" />
                <button
                  type="button"
                  className="absolute -top-1.5 -right-1.5 rounded-full border border-border bg-background p-0.5"
                  aria-label={t("removeAttachment")}
                  onClick={() => setAttachments((list) => list.filter((entry) => entry !== url))}
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {uploadError ? <p className="mb-2 text-xs text-rose-700">{uploadError}</p> : null}
        <label htmlFor="assistant-message" className="sr-only">
          {t("messageLabel")}
        </label>
        <Textarea
          id="assistant-message"
          ref={input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={t("placeholder")}
          rows={2}
          maxLength={4000}
          className="max-h-40 min-h-14 resize-none"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          {assistant.canAttach ? (
            <>
              <input
                ref={file}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => void attach(event.target.files)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => file.current?.click()}
                disabled={uploading || attachments.length >= 4}
              >
                {uploading ? <LoaderCircleIcon className="animate-spin" /> : <ImagePlusIcon />}
                {uploading ? t("uploading") : t("attach")}
              </Button>
            </>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" disabled={!text.trim() && attachments.length === 0}>
            <SendHorizontalIcon />
            {t("send")}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** The header button that shows and hides the panel; nothing outside a store. */
export function AssistantToggle() {
  const assistant = useOptionalAssistant();
  const t = useTranslations("assistantChat");
  if (!assistant) return null;
  return (
    <Button
      variant={assistant.open ? "secondary" : "ghost"}
      className="gap-1.5 px-2"
      aria-pressed={assistant.open}
      aria-label={t("toggle")}
      onClick={() => assistant.setOpen(!assistant.open)}
    >
      <SparklesIcon className="text-primary" />
      <span className="hidden sm:inline">{t("toggle")}</span>
    </Button>
  );
}

function subscribeExtraWide(callback: () => void) {
  const query = window.matchMedia("(min-width: 1280px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/**
 * The panel inside a page: beside the storefront editor's canvas on a screen
 * wide enough for both (elsewhere the dock or the sheet shows it), or, with
 * `always`, as the page's own content at any width.
 */
export function AssistantEmbed({ className, always = false }: { className?: string; always?: boolean }) {
  const assistant = useOptionalAssistant();
  const t = useTranslations("assistantChat");
  const extraWide = useSyncExternalStore(
    subscribeExtraWide,
    () => window.matchMedia("(min-width: 1280px)").matches,
    () => false,
  );
  const shown = always || extraWide;
  const register = assistant?.registerEmbed;
  useEffect(() => (shown && register ? register() : undefined), [shown, register]);
  if (!assistant || !shown) return null;
  if (!always && !assistant.open) {
    return (
      <Button variant="outline" className="w-full justify-start gap-2" onClick={() => assistant.setOpen(true)}>
        <SparklesIcon className="text-primary" />
        {t("askAssistant")}
      </Button>
    );
  }
  return (
    <div className={className ?? "h-[34rem] overflow-hidden rounded-xl border border-border"}>
      <AssistantPanel onClose={always ? undefined : () => assistant.setOpen(false)} closeLabel="collapse" />
    </div>
  );
}
