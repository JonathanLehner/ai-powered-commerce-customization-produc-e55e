"use client";

import { createContext, useContext } from "react";
import type { PendingView } from "@/lib/assistant/engine";
import type { ChatItem } from "@/lib/assistant/service";

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface AssistantContextValue {
  storeId: string;
  /** May attach images (storefront uploads). */
  canAttach: boolean;
  /** May change the storefront, for the starter prompts. */
  canStorefront: boolean;
  canCatalog: boolean;
  open: boolean;
  setOpen(open: boolean): void;
  /** A page that embeds the panel; while one is mounted the dock stays empty. */
  embedded: boolean;
  registerEmbed(): () => void;
  /** Goes up once the page has refreshed after the assistant changed the storefront. */
  revision: number;
  /** Registers the storefront editor's "has unsaved edits" check, so a refresh never throws them away. */
  registerDirtyCheck(check: () => boolean): () => void;
  /** The assistant changed the draft while the editor held unsaved edits. */
  staleEditor: boolean;
  reloadEditor(): void;
  chat: ChatState;
}

export interface ChatState {
  loaded: boolean;
  conversationId: string | null;
  conversations: ConversationSummary[];
  items: ChatItem[];
  pending: PendingView | null;
  undo: boolean;
  busy: boolean;
  error: string | null;
  /** Posts the message, or shows why it cannot and returns false. */
  send(text: string, attachments?: string[]): boolean;
  confirm(): void;
  cancel(): void;
  undoLast(): void;
  openConversation(id: string): void;
  newChat(): void;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);

/** The assistant of the store being viewed, or null outside a store. */
export function useOptionalAssistant(): AssistantContextValue | null {
  return useContext(AssistantContext);
}

