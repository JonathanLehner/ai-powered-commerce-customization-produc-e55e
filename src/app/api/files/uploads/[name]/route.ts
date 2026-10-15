import { getUpload } from "@/lib/file-store";
import { uploadNameOf, UPLOAD_PATH } from "@/lib/upload-paths";

/**
 * Serves a file uploaded to the app's bucket.
 *
 * These files are storefront images, logos and shopper artwork that pages,
 * emails and share cards link to directly, so reads are public, as they were
 * on the old asset host. Each name is 128 random bits and only names the
 * upload route issued are accepted, so nothing else in the bucket is
 * reachable. An uploaded SVG is sandboxed so it cannot run script on this
 * origin.
 */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = uploadNameOf(`${UPLOAD_PATH}${(await params).name}`);
  if (!name) return new Response("Not found", { status: 404 });

  const range = request.headers.has("range") ? request.headers : undefined;
  const object = await getUpload(`uploads/${name}`, range);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    etag: object.httpEtag,
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });

  const part = range ? object.range : undefined;
  if (part) {
    const start = part.suffix !== undefined ? Math.max(0, object.size - part.suffix) : (part.offset ?? 0);
    const length = part.suffix !== undefined ? object.size - start : (part.length ?? object.size - start);
    headers.set("content-range", `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}
