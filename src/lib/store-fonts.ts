/**
 * The typefaces a client storefront can be set in.
 *
 * These are loaded here rather than in `components/Document`, so the marketing
 * pages and the workspace never pay for a face only a storefront uses. None is
 * preloaded: four families are declared and one storefront renders in one of
 * them, so the browser fetches the file the matched `font-family` actually
 * needs instead of four it mostly will not.
 */
import { Inter, Nunito, Playfair_Display, Space_Grotesk } from "next/font/google";

const inter = Inter({
  variable: "--font-store-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const playfair = Playfair_Display({
  variable: "--font-store-playfair",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  preload: false,
});

const grotesk = Space_Grotesk({
  variable: "--font-store-grotesk",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const nunito = Nunito({
  variable: "--font-store-nunito",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

/** Put on the element that also carries `storeThemeVars()`. */
export const STORE_FONT_CLASSES = [
  inter.variable,
  playfair.variable,
  grotesk.variable,
  nunito.variable,
].join(" ");
