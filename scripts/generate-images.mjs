/**
 * One-off build-time image generation. Run with:
 *   node --env-file=.env.local scripts/generate-images.mjs
 * Results are written to scripts/image-manifest.json and committed, so the app
 * never calls the image model at request time.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}

const MANIFEST = path.join(process.cwd(), "scripts", "image-manifest.json");

const STUDIO =
  "Studio product photograph, centred, square composition, soft even lighting, subtle shadow, " +
  "plain seamless light grey backdrop, no people, no props, no logo, no text, no printed graphics, photorealistic.";

const IMAGES = [
  {
    key: "tshirt-white-front",
    prompt: `A blank white unisex cotton crew-neck t-shirt seen from the front, laid perfectly flat, sleeves straight, no wrinkles. ${STUDIO}`,
  },
  {
    key: "tshirt-white-back",
    prompt: `The back of a blank white unisex cotton crew-neck t-shirt, laid perfectly flat, sleeves straight, no wrinkles. ${STUDIO}`,
  },
  {
    key: "tshirt-black-front",
    prompt: `A blank black unisex cotton crew-neck t-shirt seen from the front, laid perfectly flat, sleeves straight, no wrinkles. ${STUDIO}`,
  },
  {
    key: "tshirt-black-back",
    prompt: `The back of a blank black unisex cotton crew-neck t-shirt, laid perfectly flat, sleeves straight, no wrinkles. ${STUDIO}`,
  },
  {
    key: "hoodie-navy-front",
    prompt: `A blank navy blue pullover hoodie with a kangaroo pocket seen from the front, laid perfectly flat, hood arranged neatly. ${STUDIO}`,
  },
  {
    key: "hoodie-navy-back",
    prompt: `The back of a blank navy blue pullover hoodie, laid perfectly flat, hood arranged neatly. ${STUDIO}`,
  },
  {
    key: "hoodie-heather-front",
    prompt: `A blank heather grey pullover hoodie with a kangaroo pocket seen from the front, laid perfectly flat, hood arranged neatly. ${STUDIO}`,
  },
  {
    key: "hoodie-heather-back",
    prompt: `The back of a blank heather grey pullover hoodie, laid perfectly flat, hood arranged neatly. ${STUDIO}`,
  },
  {
    key: "mug-white-left",
    prompt: `A plain glossy white ceramic coffee mug photographed straight on with the handle on the right side, so the full curved printable body faces the camera. ${STUDIO}`,
  },
  {
    key: "mug-white-right",
    prompt: `A plain glossy white ceramic coffee mug photographed straight on with the handle on the left side, so the full curved printable body faces the camera. ${STUDIO}`,
  },
  {
    key: "mug-black-left",
    prompt: `A plain matte black ceramic coffee mug photographed straight on with the handle on the right side, so the full curved printable body faces the camera. ${STUDIO}`,
  },
  {
    key: "mug-black-right",
    prompt: `A plain matte black ceramic coffee mug photographed straight on with the handle on the left side, so the full curved printable body faces the camera. ${STUDIO}`,
  },
  {
    key: "marketing-hero",
    prompt:
      "Wide editorial photograph of a bright design studio desk: folded blank apparel in teal and white, two plain ceramic mugs, colour swatches and a tablet showing a neutral grey interface. Natural window light, shallow depth of field, calm modern palette of teal, white and deep indigo. No readable text, no logos.",
  },
  {
    key: "marketing-sourcing",
    prompt:
      "Overhead photograph of neatly arranged blank merchandise samples on a pale concrete surface: folded t-shirts, a hoodie sleeve, two ceramic mugs and fabric swatch cards with small unlabelled tags. Soft daylight, muted teal and indigo accents. No readable text, no logos.",
  },
  {
    key: "marketing-mockup",
    prompt:
      "Close-up photograph of hands positioning a translucent film transfer sheet over a folded blank white t-shirt on a workbench, with a colour calibration card beside it. Warm workshop light, shallow depth of field. No readable text, no logos.",
  },
  {
    key: "marketing-fulfilment",
    prompt:
      "Photograph of a small fulfilment bench: plain kraft parcel boxes stacked neatly, a roll of packing tape and a handheld barcode scanner on a pale wooden surface. Bright even light, calm neutral palette with teal accents. No readable text, no logos.",
  },
  {
    key: "storefront-northwind",
    prompt:
      "Lifestyle photograph of a person wearing a plain navy hoodie holding a plain white ceramic mug in a bright modern office lounge, shot from the chest down so the face is not visible. Natural light, muted palette. No readable text, no logos.",
  },
  {
    key: "storefront-lumen",
    prompt:
      "Lifestyle photograph of folded blank pastel apparel and a plain white mug arranged on a linen surface beside dried flowers, warm morning light, soft shadows, creator-brand aesthetic. No readable text, no logos.",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate(item, existing) {
  if (existing[item.key]) {
    console.log(`skip ${item.key} (already generated)`);
    return [item.key, existing[item.key]];
  }
  let lastErr = "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch("https://www.clawcorp.ai/api/platform/gemini", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ prompt: item.prompt, model: "gemini-3.1-flash-image" }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
      const json = await res.json();
      const url = json.images?.[0]?.url;
      if (!url) throw new Error("no image returned");
      console.log(`ok   ${item.key} -> ${url}`);
      return [item.key, url];
    } catch (err) {
      lastErr = String(err);
      console.log(`retry ${item.key} (attempt ${attempt}): ${lastErr}`);
      await sleep(2000 * attempt);
    }
  }
  throw new Error(`${item.key}: ${lastErr}`);
}

async function main() {
  let existing = {};
  try {
    existing = JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    existing = {};
  }

  const out = { ...existing };
  const queue = [...IMAGES];
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        const [key, url] = await generate(item, existing);
        out[key] = url;
        await writeFile(MANIFEST, JSON.stringify(out, null, 2));
      } catch (err) {
        console.error(String(err));
      }
    }
  });
  await Promise.all(workers);
  await writeFile(MANIFEST, JSON.stringify(out, null, 2));
  console.log(`\n${Object.keys(out).length} images in manifest`);
}

main();
