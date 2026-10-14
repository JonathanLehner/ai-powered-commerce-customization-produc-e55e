import {
  Anton,
  Archivo,
  Bebas_Neue,
  Bricolage_Grotesque,
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Fraunces,
  Instrument_Serif,
  Inter,
  Lora,
  Manrope,
  Nunito,
  Oswald,
  Outfit,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Sora,
  Space_Grotesk,
  Space_Mono,
  Syne,
  Work_Sans,
} from "next/font/google";

/**
 * The storefront's curated web fonts (see `FONTS` in `store-design.ts`).
 *
 * Each is self-hosted and declared without preloading: the stylesheet only
 * names them, and a shopper's browser downloads the one or two files the
 * store actually uses, when text in them is first drawn.
 */
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-dm-sans" });
const manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-manrope" });
const workSans = Work_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-work-sans" });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-plus-jakarta" });
const outfit = Outfit({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-outfit" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-space-grotesk" });
const archivo = Archivo({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-archivo" });
const sora = Sora({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-sora" });
const nunito = Nunito({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-nunito" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-bricolage" });
const bebasNeue = Bebas_Neue({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--font-sf-bebas-neue" });
const anton = Anton({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--font-sf-anton" });
const oswald = Oswald({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-oswald" });
const syne = Syne({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-syne" });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-fraunces" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-playfair" });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--font-sf-dm-serif" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "600"], variable: "--font-sf-cormorant" });
const lora = Lora({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sf-lora" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--font-sf-instrument-serif" });
const spaceMono = Space_Mono({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-sf-space-mono" });

/** Every font's variable class, for the element the store's tokens are applied to. */
export const STORE_FONT_CLASSES = [
  inter,
  dmSans,
  manrope,
  workSans,
  plusJakarta,
  outfit,
  spaceGrotesk,
  archivo,
  sora,
  nunito,
  bricolage,
  bebasNeue,
  anton,
  oswald,
  syne,
  fraunces,
  playfair,
  dmSerif,
  cormorant,
  lora,
  instrumentSerif,
  spaceMono,
]
  .map((font) => font.variable)
  .join(" ");
