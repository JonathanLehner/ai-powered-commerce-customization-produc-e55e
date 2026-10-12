"use client";

import Image from "@tiptap/extension-image";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadImage } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

/**
 * The rich-text editor for pages and blog posts, built on Tiptap. Its HTML is
 * posted in a hidden field named `name`; the server sanitises it before it is
 * stored. Images are uploaded the moment they are chosen and placed by their
 * stored address.
 */
export function RichTextEditor({
  name,
  defaultValue,
  storeId,
  labelledBy,
  invalid,
}: {
  name: string;
  defaultValue: string;
  storeId: string;
  /** The id of the visible label. */
  labelledBy: string;
  invalid?: boolean;
}) {
  const t = useTranslations("content.editor");
  const [html, setHtml] = useState(defaultValue);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkId = useId();
  const fileId = useId();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Image,
    ],
    content: defaultValue,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "rich-text min-h-64 px-3 py-2.5 text-sm focus:outline-none",
        "aria-labelledby": labelledBy,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: current }) => setHtml(current.isEmpty ? "" : current.getHTML()),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            h2: current.isActive("heading", { level: 2 }),
            h3: current.isActive("heading", { level: 3 }),
            bullet: current.isActive("bulletList"),
            ordered: current.isActive("orderedList"),
            quote: current.isActive("blockquote"),
            link: current.isActive("link"),
            undo: current.can().undo(),
            redo: current.can().redo(),
          }
        : null,
  });

  function openLink() {
    setLinkUrl(editor?.getAttributes("link").href ?? "");
    setLinkOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    const url = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) chain.unsetLink().run();
    else chain.setLink({ href: /^(https?:|mailto:|tel:|\/)/i.test(url) ? url : `https://${url}` }).run();
    setLinkOpen(false);
  }

  async function onImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !editor) return;
    setError(null);
    setUploading(true);
    try {
      const stored = await uploadImage(file, "collection", { storeId });
      editor.chain().focus().setImage({ src: stored.url, alt: "" }).run();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("imageFailed"));
    } finally {
      setUploading(false);
    }
  }

  const tools: { key: string; label: string; icon: LucideIcon; pressed?: boolean; run: () => void; disabled?: boolean }[] = editor
    ? [
        { key: "bold", label: t("bold"), icon: BoldIcon, pressed: active?.bold, run: () => editor.chain().focus().toggleBold().run() },
        { key: "italic", label: t("italic"), icon: ItalicIcon, pressed: active?.italic, run: () => editor.chain().focus().toggleItalic().run() },
        { key: "h2", label: t("heading"), icon: Heading2Icon, pressed: active?.h2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
        { key: "h3", label: t("subheading"), icon: Heading3Icon, pressed: active?.h3, run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
        { key: "bullet", label: t("bulletList"), icon: ListIcon, pressed: active?.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
        { key: "ordered", label: t("numberedList"), icon: ListOrderedIcon, pressed: active?.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
        { key: "quote", label: t("quote"), icon: QuoteIcon, pressed: active?.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
        { key: "link", label: t("link"), icon: LinkIcon, pressed: active?.link, run: openLink },
        { key: "image", label: t("image"), icon: ImageIcon, run: () => document.getElementById(fileId)?.click(), disabled: uploading },
        { key: "undo", label: t("undo"), icon: Undo2Icon, run: () => editor.chain().focus().undo().run(), disabled: !active?.undo },
        { key: "redo", label: t("redo"), icon: Redo2Icon, run: () => editor.chain().focus().redo().run(), disabled: !active?.redo },
      ]
    : [];

  return (
    <div
      className={cn(
        "mt-1.5 rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        invalid && "border-destructive",
      )}
    >
      <input type="hidden" name={name} value={html} />
      <div role="toolbar" aria-label={t("toolbar")} className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        {tools.map((tool) => (
          <Button
            key={tool.key}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={tool.label}
            title={tool.label}
            aria-pressed={tool.pressed === undefined ? undefined : tool.pressed}
            disabled={tool.disabled}
            onClick={tool.run}
            className={tool.pressed ? "bg-muted text-foreground" : "text-muted-foreground"}
          >
            <tool.icon aria-hidden />
          </Button>
        ))}
        <input id={fileId} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onImage} />
        <span role="status" aria-live="polite" className="ml-2 text-xs text-muted-foreground">
          {uploading ? t("uploading") : null}
        </span>
      </div>
      {linkOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-2">
          <label htmlFor={linkId} className="text-xs text-muted-foreground">
            {t("linkAddress")}
          </label>
          <Input
            id={linkId}
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
            }}
            placeholder="https://"
            className="h-8 min-w-0 flex-1"
            autoFocus
          />
          <Button type="button" size="sm" onClick={applyLink}>
            {t("linkApply")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setLinkOpen(false)}>
            {t("linkCancel")}
          </Button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
      {error ? <p className="px-3 pb-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
