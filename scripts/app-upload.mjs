/**
 * Uploads a file from a script through the app's own Admin API
 * (POST /api/v1/stores/{storeId}/uploads), which stores it in the app's R2
 * bucket and returns its permanent address. Scripts run outside the Worker and
 * cannot reach the bucket binding themselves.
 *
 * Needs, in .env.local:
 *   UPLOAD_API_KEY   an Admin API key with the products:write scope
 *   UPLOAD_STORE_ID  the store that key belongs to
 *   APP_URL          optional, defaults to the deployed app
 */
const DEFAULT_APP_URL = "https://ai-powered-commerce-customization-produc-e55e.clawcorp.ai";

/** Every type the scripts upload is a raster image; `artwork` allows them up to 25 MB. */
export async function uploadViaApp(bytes, mimeType, fileName = "") {
  const key = process.env.UPLOAD_API_KEY;
  const storeId = process.env.UPLOAD_STORE_ID;
  if (!key || !storeId) throw new Error("UPLOAD_API_KEY and UPLOAD_STORE_ID are required to upload files");
  const base = (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
  const body = JSON.stringify({
    kind: "artwork",
    contentType: mimeType,
    fileName,
    data: Buffer.from(bytes).toString("base64"),
  });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${base}/api/v1/stores/${encodeURIComponent(storeId)}/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body,
    });
    if (res.ok) return (await res.json()).url;
    if (attempt === 4 || res.status < 500) throw new Error(`upload: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}
