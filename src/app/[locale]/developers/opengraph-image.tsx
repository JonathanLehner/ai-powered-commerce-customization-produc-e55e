import { SHARE_SIZE } from "@/lib/share-image";
import { marketingShareImage, shareImageParams } from "../share-card";

/** This page's share image, one per language, drawn at build time. */
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = "image/png";
export const generateStaticParams = shareImageParams;

export default function Image({ params }: { params: Promise<{ locale: string }> }) {
  return marketingShareImage(params, "developers");
}
