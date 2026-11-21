import { PaperSize } from "@/lib/types";

const PX_PER_MM = 96 / 25.4;
const PAGE_HEIGHT_MM: Record<PaperSize, number> = { a4: 297, letter: 279.4 };

/**
 * How many pages the Sidebar template's side column covers: one, or more
 * when its content runs past a page. Each page fits the page height less its
 * top and bottom margins, since the column repeats its padding on every page.
 */
export const sidebarPages = ({
  contentPx,
  paper,
  marginYmm,
}: {
  /** The column's content height, without its padding, in CSS pixels. */
  contentPx: number;
  paper: PaperSize;
  marginYmm: number;
}) => {
  const perPage = (PAGE_HEIGHT_MM[paper] - 2 * marginYmm) * PX_PER_MM;
  return Math.max(1, Math.ceil(contentPx / perPage));
};
