import { DesignSettings, isFullBleed } from "@/lib/resume/design";
import type { PageMetrics } from "@/lib/resume/paging";
import type { PaperSize } from "@/lib/types";

const PX_PER_INCH = 96;
const PX_PER_MM = PX_PER_INCH / 25.4;
const PX_PER_PT = PX_PER_INCH / 72;

/** In pixels, before any zoom. */
export const SHEETS: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210 * PX_PER_MM, height: 297 * PX_PER_MM },
  letter: { width: 8.5 * PX_PER_INCH, height: 11 * PX_PER_INCH },
};

/** Between two sheets. */
export const SHEET_GAP = 22;

/** Chrome prints onto whole pixels: the width between the page's margins rounded up, the height down. */
export const pageMetrics = (design: Pick<DesignSettings, "template" | "margin_y">, paper: PaperSize): PageMetrics => {
  const { height } = SHEETS[paper];
  const marginTop = design.margin_y * PX_PER_MM;
  const pageHeight = isFullBleed(design) ? Math.floor(height) - 2 * marginTop : Math.floor(height - 2 * marginTop);
  return { pageHeight, sheetHeight: height, marginTop, gap: SHEET_GAP };
};

/** Of the page with its margins, so that what is between them is as wide as in print. */
export const pageWidth = (design: DesignSettings, paper: PaperSize): number => {
  const margins = isFullBleed(design) ? 0 : 2 * design.margin_x * PX_PER_MM;
  return Math.ceil(SHEETS[paper].width - margins) + margins;
};

/** Of a line of body text. */
export const lineHeight = (design: Pick<DesignSettings, "body_size" | "line_height">) => design.body_size * PX_PER_PT * design.line_height;

/** The height of that many sheets and the gaps between them. */
export const sheetsHeight = (pages: number, { sheetHeight, gap }: PageMetrics) => pages * (sheetHeight + gap) - gap;
