import { DesignFont } from "@/lib/resume/design";
import localFont from "next/font/local";
import "./fonts-extended.css";

// next/font needs literal options in each call at module level. Only the
// default font is preloaded; the others download when a resume or the Design
// panel first uses them, and printing waits for document.fonts.ready.
const sourceSans = localFont({
  src: "../../../fonts/source-sans-3/latin.woff2",
  weight: "400 700",
});

const plexSans = localFont({
  src: "../../../fonts/ibm-plex-sans/latin.woff2",
  weight: "400 700",
  preload: false,
});

const sourceSerif = localFont({
  src: "../../../fonts/source-serif-4/latin.woff2",
  weight: "400 700",
  adjustFontFallback: "Times New Roman",
  preload: false,
});

const lora = localFont({
  src: "../../../fonts/lora/latin.woff2",
  weight: "400 700",
  adjustFontFallback: "Times New Roman",
  preload: false,
});

/**
 * CSS font-family for each resume font. The extended family comes first because
 * the Latin one ends in a system fallback, which would claim other scripts. Its
 * unicode-range leaves Latin text alone.
 */
export const FONT_FAMILIES: Record<DesignFont, string> = {
  source_sans: `"Source Sans 3 Extended", ${sourceSans.style.fontFamily}`,
  plex_sans: `"IBM Plex Sans Extended", ${plexSans.style.fontFamily}`,
  source_serif: `"Source Serif 4 Extended", ${sourceSerif.style.fontFamily}`,
  lora: `"Lora Extended", ${lora.style.fontFamily}`,
};
