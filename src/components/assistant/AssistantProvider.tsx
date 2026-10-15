"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { PendingView } from "@/lib/assistant/engine";
import type { ChatItem, ConversationView, StreamEvent } from "@/lib/assistant/service";
import { AssistantPanel } from "./AssistantPanel";
import { AssistantContext, useOptionalAssistant, type AssistantContextValue, type ChatState, type ConversationSummary } from "./context";

/**
 * The workspace chat assistant on every page of a store: its conversation,
 * the request that streams a turn, and where the panel sits (docked beside
 * the page on a wide screen, a full-screen sheet on a phone, or embedded where
 * a page asks for it, such as beside the storefront editor's canvas).
 */

const LAST_KEY = (storeId: string) => `assistant:last:${storeId}`;
const OPEN_KEY = "assistant:open";
/** A turn that sends nothing for this long is given up on, so the chat never stays locked. */
const IDLE_MS = 180_000;

function subscribeWide(callback: () => void) {
  const query = window.matchMedia("(min-width: 1024px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** True on a screen wide enough to dock the panel beside the page. */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

let localId = 0;

function useChat(storeId: string, open: boolean, onChanged: (storefront: boolean) => void): ChatState {
  const t = useTranslations("assistantChat");
  const pathname = usePathname();
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [pending, setPending] = useState<PendingView | null>(null);
  const [undo, setUndo] = useState(false);
  const [outdated, setOutdated] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Locks the controls the moment one is used, before React re-renders.
  const inFlight = useRef(false);
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  }, [onChanged]);

  const load = useCallback(
    async (id: string | null) => {
      setError(null);
      try {
        const query = new URLSearchParams({ storeId });
        if (id) query.set("conversationId", id);
        const response = await fetch(`/api/assistant?${query.toString()}`, { cache: "no-store" });
        const data = (await response.json()) as {
          conversations?: ConversationSummary[];
          conversation?: ConversationView | null;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? t("failed"));
        setConversations(data.conversations ?? []);
        const conversation = data.conversation ?? null;
        setConversationId(conversation?.id ?? null);
        setItems(conversation?.items ?? []);
        setPending(conversation?.pending ?? null);
        setUndo(conversation?.undo ?? false);
        setOutdated(conversation?.outdated ?? []);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("failed"));
      } finally {
        setLoaded(true);
      }
    },
    [storeId, t],
  );

  // The last conversation in this store, once, when the panel is first opened.
  useEffect(() => {
    if (!open || loaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(window.localStorage.getItem(LAST_KEY(storeId)));
  }, [open, loaded, load, storeId]);

  const run = useCallback(
    async (body: Record<string, unknown>, optimistic?: ChatItem) => {
      if (inFlight.current) {
        setError(t("busy"));
        return;
      }
      inFlight.current = true;
      setBusy(true);
      setError(null);
      if (optimistic) setItems((list) => [...list, optimistic]);
      const abort = new AbortController();
      let idle: ReturnType<typeof setTimeout> | undefined;
      const wait = () => {
        clearTimeout(idle);
        idle = setTimeout(() => abort.abort(), IDLE_MS);
      };
      let finished = false;
      try {
        wait();
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storeId, conversationId, page: pathname, ...body }),
          signal: abort.signal,
        });
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? t("failed"));
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          wait();
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.trim()) handle(JSON.parse(line) as StreamEvent);
          }
        }
        if (!finished) setError((current) => current ?? t("interrupted"));
      } catch (cause) {
        setError(abort.signal.aborted || cause instanceof TypeError ? t("interrupted") : cause instanceof Error ? cause.message : t("failed"));
      } finally {
        clearTimeout(idle);
        inFlight.current = false;
        setBusy(false);
      }

      function handle(event: StreamEvent) {
        switch (event.type) {
          case "conversation":
            setConversationId(event.id);
            window.localStorage.setItem(LAST_KEY(storeId), event.id);
            setConversations((list) =>
              list.some((c) => c.id === event.id)
                ? list
                : [{ id: event.id, title: event.title, updatedAt: new Date().toISOString() }, ...list],
            );
            break;
          case "text":
            setItems((list) => [...list, { id: `live_${++localId}`, kind: "assistant", text: event.text }]);
            break;
          case "step":
            setItems((list) => {
              const item: ChatItem = {
                id: `step_${event.id}`,
                kind: "step",
                operationId: event.operationId,
                text: event.label,
                status: event.status === "running" ? undefined : event.status,
                message: event.status === "error" ? event.message : undefined,
              };
              const at = list.findIndex((entry) => entry.id === item.id);
              return at >= 0 ? list.map((entry, i) => (i === at ? item : entry)) : [...list, item];
            });
            break;
          case "confirm":
            setPending(event.pending);
            break;
          case "changed":
            changed.current(event.storefront);
            break;
          case "undo":
            setUndo(event.available);
            break;
          case "outdated":
            setOutdated(event.locales);
            break;
          case "notice":
            setItems((list) => [...list, { id: `live_${++localId}`, kind: "note", note: event.note }]);
            break;
          case "error":
            setError(event.message);
            break;
          case "done":
            finished = true;
            break;
        }
      }
    },
    [conversationId, pathname, storeId, t],
  );

  return {
    loaded,
    conversationId,
    conversations,
    items,
    pending,
    undo,
    outdated,
    busy,
    error,
    send(text, attachments = []) {
      if (!loaded || inFlight.current) {
        setError(loaded ? t("busy") : t("notReady"));
        return false;
      }
      setPending(null);
      void run(
        { action: "message", text, attachments },
        { id: `live_${++localId}`, kind: "user", text, attachments },
      );
      return true;
    },
    confirm() {
      if (!pending) return;
      const id = pending.id;
      setPending(null);
      void run({ action: "confirm", pendingId: id });
    },
    cancel() {
      if (!pending) return;
      const id = pending.id;
      setPending(null);
      void run({ action: "cancel", pendingId: id });
    },
    undoLast() {
      setUndo(false);
      void run({ action: "undo" });
    },
    updateLanguage(locale) {
      if (inFlight.current) return;
      setOutdated((list) => list.filter((code) => code !== locale));
      void run({ action: "translate", locale });
    },
    openConversation(id) {
      if (inFlight.current) return;
      window.localStorage.setItem(LAST_KEY(storeId), id);
      void load(id);
    },
    newChat() {
      if (inFlight.current) return;
      window.localStorage.removeItem(LAST_KEY(storeId));
      setConversationId(null);
      setItems([]);
      setPending(null);
      setUndo(false);
      setOutdated([]);
      setError(null);
    },
  };
}

export function AssistantProvider({
  storeId,
  canAttach,
  canStorefront,
  canCatalog,
  children,
}: {
  storeId: string;
  canAttach: boolean;
  canStorefront: boolean;
  canCatalog: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpenState] = useState(false);
  const [embeds, setEmbeds] = useState(0);
  const [revision, setRevision] = useState(0);
  const [staleEditor, setStaleEditor] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const bumpAfterRefresh = useRef(false);
  const dirtyCheck = useRef<(() => boolean) | null>(null);

  useEffect(() => {
    // Opened or closed as it was left, after hydration so the server's HTML matches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.localStorage.getItem(OPEN_KEY) === "1") setOpenState(true);
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
  }, []);

  // The editor canvas is drawn again only once the refreshed draft has arrived.
  useEffect(() => {
    if (refreshing || !bumpAfterRefresh.current) return;
    bumpAfterRefresh.current = false;
    setRevision((value) => value + 1);
  }, [refreshing]);

  const onChanged = useCallback(
    (storefront: boolean) => {
      if (storefront && dirtyCheck.current?.()) {
        setStaleEditor(true);
        return;
      }
      bumpAfterRefresh.current = storefront;
      startRefresh(() => router.refresh());
    },
    [router],
  );

  const reloadEditor = useCallback(() => {
    setStaleEditor(false);
    dirtyCheck.current = null;
    bumpAfterRefresh.current = true;
    startRefresh(() => router.refresh());
  }, [router]);

  const registerDirtyCheck = useCallback((check: () => boolean) => {
    dirtyCheck.current = check;
    return () => {
      if (dirtyCheck.current === check) dirtyCheck.current = null;
    };
  }, []);

  const registerEmbed = useCallback(() => {
    setEmbeds((count) => count + 1);
    return () => setEmbeds((count) => count - 1);
  }, []);

  const chat = useChat(storeId, open || embeds > 0, onChanged);

  const value = useMemo<AssistantContextValue>(
    () => ({
      storeId,
      canAttach,
      canStorefront,
      canCatalog,
      open,
      setOpen,
      embedded: embeds > 0,
      registerEmbed,
      revision,
      registerDirtyCheck,
      staleEditor,
      reloadEditor,
      chat,
    }),
    [storeId, canAttach, canStorefront, canCatalog, open, setOpen, embeds, registerEmbed, revision, registerDirtyCheck, staleEditor, reloadEditor, chat],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

/**
 * The page beside the docked panel. On a phone the panel opens as a
 * full-screen sheet instead; where a page embeds it, the dock stays empty.
 */
export function AssistantFrame({ children }: { children: React.ReactNode }) {
  const assistant = useOptionalAssistant();
  const wide = useWide();
  const t = useTranslations("assistantChat");
  if (!assistant) return <>{children}</>;
  const { open, setOpen, embedded } = assistant;
  return (
    <>
      <div className="flex flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        {open && wide && !embedded ? (
          <aside
            aria-label={t("title")}
            className="sticky top-14 flex h-[calc(100dvh-3.5rem)] w-[24rem] shrink-0 flex-col border-l border-border bg-background xl:w-[26rem]"
          >
            <AssistantPanel onClose={() => setOpen(false)} />
          </aside>
        ) : null}
      </div>
      {wide ? null : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" showCloseButton={false} className="w-full max-w-none gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none">
            <SheetTitle className="sr-only">{t("title")}</SheetTitle>
            <AssistantPanel onClose={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
