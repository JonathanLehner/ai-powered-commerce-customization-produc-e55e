import type { StoredImage } from "@/lib/types";

/** An uploaded image's stored address and metadata as hidden fields, matching `readStoredImage` on the server. */
export function StoredImageFields({ prefix, image }: { prefix: string; image: StoredImage }) {
  const fields: [string, string][] = [
    ["Url", image.url],
    ["Name", image.fileName],
    ["Type", image.mimeType],
    ["Bytes", String(image.sizeBytes)],
    ["Width", String(image.pixelWidth)],
    ["Height", String(image.pixelHeight)],
    ["Alpha", image.hasAlpha ? "1" : "0"],
  ];
  return (
    <>
      {fields.map(([suffix, value]) => (
        <input key={suffix} type="hidden" name={`${prefix}${suffix}`} value={value} />
      ))}
    </>
  );
}
