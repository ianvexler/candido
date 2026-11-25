import type { EditTarget } from "../editChannel";
import { bringIntoView, editInEditor, focusText } from "../placeCaret";
import type { CardPlace } from "./cardPlace";
import type { PageEditors } from "./pageEditors";

interface EditOnPageOptions {
  root: HTMLElement | null;
  editors: PageEditors;
  openCard: (place: CardPlace, field: string) => void;
  /** The entry is in the CV. */
  hasEntry: (sectionId: number, entryId: string) => boolean;
  /** An empty bullet's editor went. */
  onLost: (sectionId: number, entryId: string) => void;
}

/** Goes to a place on the page. False while it isn't there. */
export const editOnPage = (target: EditTarget, { root, editors, openCard, hasEntry, onLost }: EditOnPageOptions): boolean => {
  const { sectionId } = target;
  const find = (parent: Element | null | undefined, selector: string) => parent?.querySelector<HTMLElement>(selector) ?? null;
  const section = find(root, `[data-section-id="${sectionId}"]`);
  if (target.what === "heading") {
    const heading = find(section, ".rc-heading.page-text");
    if (heading) focusText(heading, target.selected);
    return heading !== null;
  }

  const { entryId } = target;
  const entry = find(section, `[data-entry-id="${CSS.escape(entryId)}"]`);
  if (target.what === "details") {
    if (!hasEntry(sectionId, entryId)) return false;
    bringIntoView(entry);
    openCard({ kind: "entry", sectionId, entryId }, "role");
    return true;
  }
  if (target.what === "title" || target.what === "summary") {
    const field = find(entry, `.rc-${target.what}.page-text`);
    if (field) focusText(field);
    return field !== null;
  }

  const editor = editors.of(sectionId).current.get(entryId);
  if (editor && !editor.isDestroyed && entry?.contains(editor.view.dom)) {
    return editInEditor(editor, target, () => onLost(sectionId, entryId));
  }
  // Loads the editor.
  find(entry, '.page-entry-body > [role="textbox"]')?.focus({ preventScroll: true });
  return false;
};
