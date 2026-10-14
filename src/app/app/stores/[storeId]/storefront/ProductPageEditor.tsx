"use client";

import { useEditor } from "@craftjs/core";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { useState } from "react";
import { ProductCard } from "@/components/storefront/ProductCard";
import { SfIcon, type StorefrontContext } from "@/components/storefront/kit";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  newBlockId,
  PRODUCT_BLOCK_DEFS,
  PRODUCT_BLOCK_LIMIT,
  PRODUCT_BLOCK_ORDER,
  PRODUCT_PAGE_PROP,
  productBlocks,
  type ProductBlock,
  type ProductBlockType,
} from "@/lib/product-template";
import { STORE_FONT_CLASSES } from "@/lib/store-fonts";
import { localizeBlockProps } from "@/lib/translations";
import { classNames } from "@/lib/util";
import { FieldList, type PropTarget } from "./fields";
import { PreviewFrame, type PreviewWidth } from "./PreviewFrame";

/**
 * The product page template: every product page is drawn from these blocks,
 * in this order. Kept on the page's root node, so it is saved, versioned and
 * published with the home page.
 */
export function ProductPageEditor({
  ctx,
  locale,
  defaultLocale,
  canvasStyle,
  canvasAttributes,
  device,
}: {
  ctx: StorefrontContext;
  locale: string;
  defaultLocale: string;
  canvasStyle: CSSProperties;
  canvasAttributes: Record<string, string>;
  device: PreviewWidth;
}) {
  const t = useTranslations("editor.productPage");
  const names = useTranslations("editor.blocks");
  const { rootProps, actions } = useEditor((state) => ({ rootProps: (state.nodes.ROOT?.data.props ?? {}) as Record<string, unknown> }));
  const blocks = productBlocks({ ROOT: { props: rootProps } });
  const [selected, setSelected] = useState<string | null>(blocks[0]?.id ?? null);
  const current = blocks.find((b) => b.id === selected) ?? null;
  const isDefault = locale === defaultLocale;

  function write(next: ProductBlock[]) {
    actions.setProp("ROOT", (p: Record<string, unknown>) => {
      p[PRODUCT_PAGE_PROP] = next;
    });
  }
  function add(type: ProductBlockType) {
    const block = { id: newBlockId(), type, props: { ...PRODUCT_BLOCK_DEFS[type].defaults } };
    write([...blocks, block]);
    setSelected(block.id);
  }
  function move(index: number, by: number) {
    const next = [...blocks];
    const [block] = next.splice(index, 1);
    next.splice(index + by, 0, block);
    write(next);
  }

  const target: PropTarget | null = current
    ? {
        id: `block-${current.id}`,
        props: current.props,
        set: (mutate) =>
          write(
            blocks.map((b) => {
              if (b.id !== current.id) return b;
              const props = { ...b.props };
              mutate(props);
              return { ...b, props };
            }),
          ),
      }
    : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle asChild className="text-sm font-semibold">
              <h2>{t("blocks")}</h2>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t("blocksBody")}</p>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1.5">
              {blocks.map((block, i) => (
                <li key={block.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelected(block.id)}
                    className={classNames(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                      block.id === selected ? "bg-primary/10 font-medium text-foreground" : "text-inksoft hover:bg-muted",
                    )}
                  >
                    <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="truncate">{names(`${block.type}.name`)}</span>
                  </button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={!isDefault || i === 0} onClick={() => move(i, -1)} aria-label={t("moveUp")}>
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!isDefault || i === blocks.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={t("moveDown")}
                  >
                    ↓
                  </Button>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle asChild className="text-sm font-semibold">
              <h2>{t("addBlock")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {PRODUCT_BLOCK_ORDER.filter((type) => type !== "ProductMain").map((type) => {
                const taken = PRODUCT_BLOCK_DEFS[type].single && blocks.some((b) => b.type === type);
                return (
                  <li key={type} className="flex items-start justify-between gap-2 rounded-lg border border-border p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{names(`${type}.name`)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{names(`${type}.description`)}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!isDefault || taken || blocks.length >= PRODUCT_BLOCK_LIMIT}
                      onClick={() => add(type)}
                    >
                      {t("add")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="relative min-w-0 rounded-xl border border-border bg-canvas p-3">
        <PreviewFrame device={device}>
          <div
            lang={locale}
            {...canvasAttributes}
            className={`${STORE_FONT_CLASSES} overflow-hidden rounded-lg border border-border bg-background font-sans text-base text-foreground`}
            style={canvasStyle}
          >
            <TemplatePreview ctx={ctx} blocks={blocks} locale={locale} defaultLocale={defaultLocale} selected={selected} onSelect={setSelected} />
          </div>
        </PreviewFrame>
      </div>

      <div className="space-y-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle asChild className="text-sm font-semibold">
              <h2>{current ? names(`${current.type}.name`) : t("settings")}</h2>
            </CardTitle>
            {current && current.type !== "ProductMain" ? (
              <CardAction>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-rose-700"
                  disabled={!isDefault}
                  onClick={() => {
                    write(blocks.filter((b) => b.id !== current.id));
                    setSelected(null);
                  }}
                >
                  {t("remove")}
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {current && target ? (
              PRODUCT_BLOCK_DEFS[current.type].fields.length > 0 ? (
                <FieldList fields={PRODUCT_BLOCK_DEFS[current.type].fields} target={target} scope={`blocks.${current.type}`} />
              ) : (
                <p className="text-xs text-muted-foreground">{t("noSettings")}</p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">{t("select")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** A sketch of a product page from the template, with the store's first product. */
function TemplatePreview({
  ctx,
  blocks,
  locale,
  defaultLocale,
  selected,
  onSelect,
}: {
  ctx: StorefrontContext;
  blocks: ProductBlock[];
  locale: string;
  defaultLocale: string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("editor.productPage");
  const product = ctx.products[0];
  const photos = [product?.imageUrl, product?.secondImageUrl].filter(Boolean) as string[];

  const frame = (block: ProductBlock, children: React.ReactNode) => (
    <div
      key={block.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(block.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(block.id)}
      className={classNames("relative cursor-pointer px-5 py-6", selected === block.id ? "craft-selected" : "hover:outline-dashed hover:outline-2 hover:outline-brand-300")}
    >
      {children}
    </div>
  );

  return (
    <div className="py-2">
      {blocks.map((block) => {
        const props = localizeBlockProps(block.type, block.props, locale, defaultLocale);
        const text = (key: string) => String(props[key] ?? "");
        switch (block.type) {
          case "ProductMain": {
            const gallery = (
              <div className={props.galleryLayout === "grid" ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
                {(photos.length ? photos : [""]).map((src, i) => (
                  <div
                    key={i}
                    className={classNames("overflow-hidden rounded-[var(--radius)] bg-muted", props.galleryLayout === "grid" && i === 0 ? "col-span-2" : "")}
                    style={{ aspectRatio: "1 / 1" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                ))}
                {props.galleryLayout === "thumbnails" && photos.length > 1 ? (
                  <div className="flex gap-2">
                    {photos.map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt="" className="size-14 rounded-md object-cover" />
                    ))}
                  </div>
                ) : null}
              </div>
            );
            return frame(
              block,
              <div className="grid gap-6 sm:grid-cols-2">
                <div className={props.gallerySide === "right" ? "sm:order-2" : ""}>{gallery}</div>
                <div>
                  <h1 className="font-heading text-3xl font-semibold tracking-tight">{product?.name ?? t("sampleName")}</h1>
                  <p className="mt-3 text-xl font-medium tabular-nums">{product?.price ?? ""}</p>
                  {product?.swatches && product.swatches.length > 1 ? (
                    <div className="mt-4 flex gap-2">
                      {product.swatches.map((s) => (
                        <span key={s.name} className="size-6 rounded-full border border-foreground/20" style={{ background: s.hex }} />
                      ))}
                    </div>
                  ) : null}
                  {props.personalisation !== false ? (
                    <div className="mt-4 rounded-[var(--radius)] border border-dashed border-border p-3 text-sm text-muted-foreground">{t("personalisation")}</div>
                  ) : null}
                  <span className="sf-btn sf-btn-primary mt-5 w-full">{ctx.t.addToBasket}</span>
                  {text("trustNote") ? <p className="mt-3 text-sm text-muted-foreground">{text("trustNote")}</p> : null}
                </div>
              </div>,
            );
          }
          case "DescriptionTabs":
            return frame(
              block,
              <div>
                <div className="flex gap-5 border-b border-border text-sm font-semibold">
                  <span className="border-b-2 border-foreground pb-2">{t("tabDescription")}</span>
                  {props.showDetails !== false ? <span className="pb-2 text-muted-foreground">{t("tabDetails")}</span> : null}
                  {props.showShipping !== false ? <span className="pb-2 text-muted-foreground">{t("tabShipping")}</span> : null}
                  {text("extraTitle") ? <span className="pb-2 text-muted-foreground">{text("extraTitle")}</span> : null}
                </div>
                <p className="mt-4 text-sm text-inksoft">{product?.tagline || t("sampleDescription")}</p>
              </div>,
            );
          case "SizeGuide": {
            const rows = text("table").split("\n").map((l) => l.split("|").map((c) => c.trim()));
            return frame(
              block,
              <div className="rounded-[var(--radius)] border border-border p-4">
                <p className="font-semibold">{text("title") || t("sizeGuide")}</p>
                <table className="mt-3 w-full text-left text-sm">
                  <tbody>
                    {rows.slice(0, 4).map((cells, r) => (
                      <tr key={r} className="border-b border-border last:border-0">
                        {cells.map((c, i) => (
                          <td key={i} className={classNames("py-1.5 pr-3", r === 0 ? "font-semibold" : "text-inksoft")}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>,
            );
          }
          case "ProductFeatures":
            return frame(
              block,
              <div className="grid gap-4 sm:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="flex gap-3">
                    <SfIcon name={text(`feature${n}Icon`)} className="size-5 shrink-0 text-[var(--sf-primary-text)]" />
                    <div>
                      <p className="text-sm font-semibold">{text(`feature${n}Title`)}</p>
                      <p className="text-xs text-muted-foreground">{text(`feature${n}Body`)}</p>
                    </div>
                  </div>
                ))}
              </div>,
            );
          case "ProductText":
            return frame(
              block,
              <div>
                <h2 className="font-heading text-2xl font-semibold">{text("heading")}</h2>
                <p className="mt-2 text-sm whitespace-pre-line text-inksoft">{text("body")}</p>
              </div>,
            );
          case "Reviews":
            return frame(
              block,
              <div>
                <h2 className="font-heading text-xl font-semibold">{t("reviews")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t("reviewsBody")}</p>
              </div>,
            );
          case "RelatedProducts":
          case "RecentlyViewed":
            return frame(
              block,
              <div>
                <h2 className="font-heading mb-4 text-xl font-semibold">
                  {text("title") || (block.type === "RelatedProducts" ? t("related") : t("recentlyViewed"))}
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {ctx.products.slice(1, 5).map((p) => (
                    <ProductCard key={p.id} product={p} ctx={ctx} columns={4} quickAdd={block.type === "RelatedProducts"} />
                  ))}
                </ul>
              </div>,
            );
        }
        return null;
      })}
    </div>
  );
}
