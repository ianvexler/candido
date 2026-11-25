import { expect, it } from "vitest";
import { PagePanels, shownPanels, toggleChecklist, togglePanel } from "./pagePanels";

const START: PagePanels = { checklist: null, panel: null, front: "checklist" };

it("starts with the checklist where there is room", () => {
  expect(shownPanels(START, true)).toEqual({ checklist: true, panel: null });
  expect(shownPanels(START, false)).toEqual({ checklist: false, panel: null });
});

it("shows both with room, and the last opened without", () => {
  const panelLast = togglePanel(toggleChecklist(toggleChecklist(START, true), true), true, "design");
  expect(shownPanels(panelLast, true)).toEqual({ checklist: true, panel: "design" });
  expect(shownPanels(panelLast, false)).toEqual({ checklist: false, panel: "design" });

  const checklistLast = toggleChecklist(toggleChecklist(panelLast, true), true);
  expect(shownPanels(checklistLast, false)).toEqual({ checklist: true, panel: null });
});

it("takes turns without room", () => {
  const checklist = toggleChecklist(START, false);
  expect(shownPanels(checklist, false)).toEqual({ checklist: true, panel: null });
  const panel = togglePanel(checklist, false, "review");
  expect(shownPanels(panel, false)).toEqual({ checklist: false, panel: "review" });
  expect(shownPanels(toggleChecklist(panel, false), false)).toEqual({ checklist: true, panel: null });
  expect(shownPanels(togglePanel(panel, false, "review"), false)).toEqual({ checklist: false, panel: null });
});
