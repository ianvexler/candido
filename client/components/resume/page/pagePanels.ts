import type { PagePanelTab } from "./PagePanel";

export type PagePanels = {
  /** Null until chosen: open where there is room. */
  checklist: boolean | null;
  panel: PagePanelTab | null;
  /** What was opened last. */
  front: "checklist" | "panel";
};

/** What shows. With room for one beside the sheet, that is what was opened last. */
export const shownPanels = ({ checklist, panel, front }: PagePanels, wide: boolean) => {
  if (wide) return { checklist: checklist ?? true, panel };
  const both = checklist === true && panel !== null;
  return {
    checklist: checklist === true && !(both && front === "panel"),
    panel: both && front === "checklist" ? null : panel,
  };
};

export const toggleChecklist = (panels: PagePanels, wide: boolean): PagePanels => {
  const open = !shownPanels(panels, wide).checklist;
  return { checklist: open, panel: wide || !open ? panels.panel : null, front: "checklist" };
};

/** Opens the panel on a tab, or closes it if that shows. */
export const togglePanel = (panels: PagePanels, wide: boolean, tab: PagePanelTab): PagePanels => {
  const open = shownPanels(panels, wide).panel !== tab;
  return { checklist: open && !wide ? false : panels.checklist, panel: open ? tab : null, front: "panel" };
};
