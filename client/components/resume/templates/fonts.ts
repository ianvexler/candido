import { DesignFont } from "@/lib/resume/design";
import { IBM_Plex_Sans, Lora, Source_Sans_3, Source_Serif_4 } from "next/font/google";

// next/font needs literal options in each call at module level. Only the
// default font is preloaded; the others download when a resume or the Design
// panel first uses them, and printing waits for document.fonts.ready.
const sourceSans = Source_Sans_3({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"] });
const plexSans = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], preload: false });
const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], preload: false });
const lora = Lora({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], preload: false });

/** CSS font-family for each resume font. */
export const FONT_FAMILIES: Record<DesignFont, string> = {
  source_sans: sourceSans.style.fontFamily,
  plex_sans: plexSans.style.fontFamily,
  source_serif: sourceSerif.style.fontFamily,
  lora: lora.style.fontFamily,
};
