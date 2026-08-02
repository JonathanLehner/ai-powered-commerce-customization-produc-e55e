import type { StoredImage, UploadScope } from "./types";

/**
 * Browser side of the upload route. The bytes go straight to `/api/uploads`
 * rather than through the server action, because a Server Action request body
 * is capped at 1 MB and anything larger fails as an unhandleable server error.
 * The action that follows only carries the returned metadata.
 */
export async function uploadImage(
  file: File,
  scope: UploadScope,
  context: Record<string, string>,
): Promise<StoredImage> {
  const query = new URLSearchParams({ ...context, scope, name: file.name });
  let response: Response;
  try {
    response = await fetch(`/api/uploads?${query.toString()}`, {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
  } catch {
    throw new Error("The upload did not reach the server. Check your connection and try again.");
  }

  const payload = (await response.json().catch(() => null)) as
    | (StoredImage & { error?: string })
    | { error?: string }
    | null;

  if (!response.ok || !payload || !("url" in payload)) {
    throw new Error(payload?.error ?? "That file could not be uploaded. Try again.");
  }
  return payload;
}

/** Puts stored-upload metadata on a form, matching `readStoredImage` on the server. */
export function appendStoredImage(formData: FormData, prefix: string, image: StoredImage): void {
  formData.set(`${prefix}Url`, image.url);
  formData.set(`${prefix}Name`, image.fileName);
  formData.set(`${prefix}Type`, image.mimeType);
  formData.set(`${prefix}Bytes`, String(image.sizeBytes));
  formData.set(`${prefix}Width`, String(image.pixelWidth));
  formData.set(`${prefix}Height`, String(image.pixelHeight));
  formData.set(`${prefix}Alpha`, image.hasAlpha ? "1" : "0");
}
