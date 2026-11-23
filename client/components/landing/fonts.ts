import localFont from "next/font/local";

/** Condensed headline face for the landing page, echoing the logo's lettering. */
export const display = localFont({
  src: "../../fonts/big-shoulders/latin.woff2",
  variable: "--font-display",
  weight: "800 900",
  adjustFontFallback: false,
});
