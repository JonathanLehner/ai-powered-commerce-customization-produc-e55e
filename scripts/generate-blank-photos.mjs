/**
 * One-off build-time photography of the blanks the templates sell: lifestyle
 * and full-bleed shots of each product in each colour, with nothing printed
 * on it. The template asset script composites each template's artwork onto
 * them, and the newer shared-catalog products use them as their mockups.
 *
 * Results go to scripts/blank-photos.json and are committed. Each photo also
 * carries the print rectangle (fractions of the frame), measured by eye once
 * the photo exists; a new entry is written with `rect: null` until then.
 *
 *   node --env-file=.env.local scripts/generate-blank-photos.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}
const FILE = path.join(process.cwd(), "scripts", "blank-photos.json");

const RULES =
  "Square photograph, the product is centred, faces the camera straight on and fills most of the frame. " +
  "The product is completely blank: no print, no text, no letters, no logos, no labels, no tags. " +
  "No people. Photorealistic, natural colour, high detail.";

const COLOURS = {
  White: "white",
  Black: "black",
  Navy: "navy blue",
  "Heather grey": "heather grey marl",
  Natural: "natural undyed ecru canvas",
  Red: "bright red",
  "Forest green": "deep forest green",
};

const scarf = (c) =>
  `Close-up of the middle of a long ${c} knitted football supporters' scarf, one solid colour, laid flat and perfectly horizontal across grey stadium bleacher seats, the scarf runs straight out of both sides of the frame, seen from directly above, the scarf band filling the middle third of the frame`;

/** family → colour → one prompt per view. */
const SHOTS = {
  tee: {
    White: [
      (c) => `A ${c} cotton crew-neck t-shirt on a wooden hanger, hanging flat against a pale limewashed plaster wall, morning window light`,
      (c) => `The back of a ${c} cotton crew-neck t-shirt laid flat on rumpled natural linen, seen from directly above, sleeves folded in slightly`,
    ],
    Black: [
      (c) => `A ${c} cotton crew-neck t-shirt on a wooden hanger, hanging flat against a warm concrete wall, soft side light`,
      (c) => `The back of a ${c} cotton crew-neck t-shirt laid flat on a light oak floor, seen from directly above, sleeves straight`,
    ],
  },
  hoodie: {
    Navy: [
      (c) => `A ${c} pullover hoodie with a kangaroo pocket laid flat on a light wooden floor, seen from directly above, hood tucked behind the neck, sleeves at its sides`,
      (c) => `The back of a ${c} pullover hoodie hanging flat on a wooden hanger against a whitewashed brick wall, hood flat behind`,
    ],
    "Heather grey": [
      (c) => `A ${c} pullover hoodie with a kangaroo pocket laid flat on pale linen, seen from directly above, hood tucked behind the neck, sleeves at its sides`,
      (c) => `The back of a ${c} pullover hoodie hanging flat on a wooden hanger against a sage green painted wall, hood flat behind`,
    ],
  },
  mug: {
    White: [
      (c) => `A plain glossy ${c} ceramic 11oz mug on a light oak kitchen counter, handle on the right, the round body facing the camera, coffee beans scattered softly out of focus behind, warm morning light`,
      (c) => `A plain glossy ${c} ceramic 11oz mug held on a stone windowsill, handle on the left, the round body facing the camera, a soft green plant blurred behind`,
    ],
  },
  blackMug: {
    Black: [
      (c) => `A plain matte ${c} ceramic 15oz mug on a dark walnut desk, handle on the right, the round body facing the camera, steam rising, soft lamp light`,
      (c) => `A plain matte ${c} ceramic 15oz mug on a pale concrete counter, handle on the left, the round body facing the camera, daylight`,
    ],
  },
  enamelMug: {
    White: [
      (c) => `A plain ${c} enamel camping mug with a navy blue rolled steel rim, on a weathered wooden picnic table outdoors, handle on the right, the round body facing the camera, pine forest softly blurred behind`,
    ],
  },
  tote: {
    Natural: [
      (c) => `A ${c} cotton tote bag with long handles hanging flat from a brass hook on a warm off-white plaster wall, soft window light`,
    ],
    Black: [
      (c) => `A ${c} cotton canvas tote bag with long handles hanging flat from a hook on a pale grey tiled wall, soft daylight`,
    ],
  },
  cap: {
    Black: [
      (c) => `A ${c} six-panel cotton baseball cap with a curved brim, sitting on a light oak shelf, seen from the front, the front panels facing the camera, plain wall behind`,
    ],
    Navy: [
      (c) => `A ${c} six-panel cotton baseball cap with a curved brim, sitting on a plain wooden stool against a white painted brick wall, seen from the front, the front panels facing the camera`,
    ],
    Natural: [
      () => `A stone beige six-panel cotton baseball cap with a curved brim, resting on a sun-lit concrete bench, seen from the front, the front panels facing the camera`,
    ],
  },
  beanie: {
    Black: [
      (c) => `A ${c} ribbed knit beanie with a folded cuff, standing upright on a wooden table, seen from the front with the cuff facing the camera, soft winter window light`,
    ],
    Navy: [
      (c) => `A ${c} ribbed knit beanie with a folded cuff, standing upright on a pale stone surface, seen from the front with the cuff facing the camera, cool daylight`,
    ],
    "Heather grey": [
      (c) => `A ${c} ribbed knit beanie with a folded cuff, standing upright on a wool blanket, seen from the front with the cuff facing the camera, warm light`,
    ],
  },
  poster: {
    White: [
      () => `A blank matte white portrait poster in a thin light oak frame, hung perfectly straight on a pale warm grey wall, photographed perfectly straight on, the frame filling the middle of the image, a little of a sideboard and a vase at the bottom edge`,
    ],
  },
  sticker: {
    White: [
      () => `The plain closed lid of a silver aluminium laptop on a wooden desk, photographed from directly above, the lid filling most of the frame, a notebook and pen at the edge, soft daylight`,
    ],
  },
  scarf: {
    Navy: [(c) => scarf(c)],
    "Forest green": [(c) => scarf(c)],
    Red: [(c) => scarf(c)],
  },
  jersey: {
    Navy: [
      (c) => `A ${c} short-sleeved football shirt with a v-neck collar and white trim, hanging flat on a hanger against a changing-room wall of pale wooden slats`,
    ],
    "Forest green": [
      (c) => `A ${c} short-sleeved retro football shirt with a white collar, hanging flat on a hanger against a changing-room wall of pale wooden slats`,
    ],
    Red: [
      (c) => `A ${c} short-sleeved football shirt with a crew collar and white trim, hanging flat on a hanger against a changing-room wall of pale wooden slats`,
    ],
    White: [
      (c) => `A ${c} short-sleeved football shirt with a navy collar and navy trim, hanging flat on a hanger against a changing-room wall of pale wooden slats`,
    ],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate(prompt) {
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch("https://www.clawcorp.ai/api/platform/gemini", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ prompt: `${prompt}. ${RULES}`, model: "gemini-3.1-flash-image" }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const url = (await res.json()).images?.[0]?.url;
      if (!url) throw new Error("no image returned");
      return url;
    } catch (err) {
      last = String(err);
      console.log(`  retry ${attempt}: ${last}`);
      await sleep(2500 * attempt);
    }
  }
  throw new Error(last);
}

let photos = {};
try {
  photos = JSON.parse(await readFile(FILE, "utf8"));
} catch {
  // First run.
}
const save = () => writeFile(FILE, `${JSON.stringify(photos, null, 2)}\n`);

const queue = [];
for (const [family, colours] of Object.entries(SHOTS)) {
  for (const [colour, views] of Object.entries(colours)) {
    views.forEach((prompt, view) => {
      if (!photos[family]?.[colour]?.[view]?.url) queue.push({ family, colour, view, prompt: prompt(COLOURS[colour]) });
    });
  }
}
console.log(`${queue.length} photographs to generate`);
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const { family, colour, view, prompt } = queue.shift();
      const url = await generate(prompt);
      ((photos[family] ??= {})[colour] ??= [])[view] = { url, rect: null };
      console.log(`ok  ${family} ${colour} ${view} ${url}`);
      await save();
    }
  }),
);
console.log("done");
