import type { ChecklistEntry, ChecklistSection } from "@/lib/resume/checklist";
import type { ItemState } from "@/lib/resume/itemState";

/** What removing a section from a CV is called, on the page and in the checklist. */
export const REMOVE_SECTION = {
  label: "Remove from this CV",
  title: "Remove this section from the CV?",
};

const SECTION_KEPT = "Only this CV's copy is removed. The section stays in your library.";
const ENTRY_KEPT = "Only this CV's copy is deleted. To keep it here but not show it, untick it instead.";
const SOME_LOST = "Some of this text is only in this CV and will be deleted. To keep it, untick it instead.";
const ALL_LOST = "This text is only in this CV and will be deleted. To keep it, untick it instead.";

/** The library doesn't have the CV's text. */
const OWN: ItemState[] = ["cv_only", "cv_changed", "both_changed", "differs"];

const statesOf = ({ inCv, blank, fieldsState, items }: ChecklistEntry): ItemState[] =>
  inCv && !blank ? [fieldsState, ...items.filter((item) => item.inCv).map(({ state }) => state)] : [];

/** What deleting a CV's section, or one entry of it, loses. */
export const deletionNote = (
  section: ChecklistSection | undefined,
  libraryLoaded: boolean,
  entryId?: string
): string => {
  if (!section) return SOME_LOST;
  if (section.templateId === null) return ALL_LOST;
  if (!libraryLoaded) return SOME_LOST;

  const entry = section.entries.find(({ id }) => id === entryId);
  if (entryId !== undefined && !entry) return SOME_LOST;
  const states = entry ? statesOf(entry) : section.entries.flatMap(statesOf);
  if (entry && states.length > 0 && states.every((state) => state === "cv_only")) return ALL_LOST;
  if (states.some((state) => OWN.includes(state))) return SOME_LOST;
  return entry ? ENTRY_KEPT : SECTION_KEPT;
};
