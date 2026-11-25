import { addEntry, putBack, showForBullet, tickEntry, tickItem, tickSection } from "@/lib/resume/checklist";
import { isLeftOut } from "@/lib/resume/exportDocument";
import { listItems } from "@/lib/resume/items";
import { emptyEntry } from "@/lib/resume/sectionEntries";
import type { SectionChange, SectionDraft, SectionPatch } from "@/lib/resume/sectionDrafts";
import { CurriculumSection, SUMMARY_ID } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createEditChannel, EditTarget } from "./editChannel";
import { Added, useAdded } from "./useAdded";
import type { CvView } from "./useCvView";

/** What the checklist adds and edits. The functions stay the same. */
export type CvEdits = {
  /** Ticks what isn't in the CV first. */
  edit: (target: EditTarget, ticked: boolean) => void;
  addEntry: (sectionId: number) => void;
  addBullet: (sectionId: number, entryId: string) => void;
};

const tick = (target: EditTarget) => (section: SectionDraft): SectionPatch => {
  if (target.what === "heading") return tickSection(section, true);
  const { entryId } = target;
  const itemId = target.what === "item" ? target.itemId : target.what === "summary" ? SUMMARY_ID : "";
  const item = tickItem(section, entryId, itemId, true);
  return Object.keys(item).length > 0 ? item : tickEntry(section, entryId, true);
};

interface CvEditsOptions {
  /** The drafts. */
  current: () => CurriculumSection[];
  change: (id: number, change: SectionChange) => void;
  view: CvView;
  /** Brings the CV to the screen, where it is one of several tabs. */
  showCv: () => void;
}

/** Adding to a CV and going to what is edited, in the view that is on the screen. */
export const useCvEdits = ({ current, change, view, showCv }: CvEditsOptions) => {
  const [channel] = useState(createEditChannel);
  const [added, setAdded, endAdded] = useAdded(view);
  useEffect(() => channel.stop, [channel, view]);
  const latestShow = useRef(showCv);
  useEffect(() => {
    latestShow.current = showCv;
  });

  const find = useCallback((id: number) => current().find((section) => section.id === id), [current]);

  /** On the screen at once, so a place that is there has the focus within the press. */
  const go = useCallback(
    (target: EditTarget, next: Added | null, patch?: (section: SectionDraft) => SectionPatch) => {
      endAdded();
      flushSync(() => {
        latestShow.current();
        if (patch) change(target.sectionId, patch);
        setAdded(next);
      });
      channel.ask(target);
    },
    [change, channel, endAdded, setAdded]
  );

  const edits = useMemo<CvEdits>(() => {
    const known = (sectionId: number, entryId: string) =>
      listItems(find(sectionId)?.entries.find(({ id }) => id === entryId)?.content ?? "").map(({ id }) => id);

    /** With ticks put back if what is added to something left out stays empty. */
    const add = (
      target: Extract<EditTarget, { entryId: string }>,
      what: Added["what"],
      patch: (section: SectionDraft) => SectionPatch
    ) => {
      const { sectionId, entryId } = target;
      const before = find(sectionId);
      if (!before) return;
      const after = { ...before, ...patch(before) };
      const wasOut = isLeftOut(before) || before.entries.some(({ id, hidden }) => id === entryId && hidden);
      go(
        target,
        {
          what,
          sectionId,
          entryId,
          known: known(sectionId, entryId),
          putBack: wasOut ? () => change(sectionId, putBack(before, after)) : undefined,
        },
        patch
      );
    };

    return {
      edit: (target, ticked) => {
        const { sectionId, what } = target;
        // Offered even while empty.
        const next: Added | null =
          what === "title" || what === "summary"
            ? { what, sectionId, entryId: target.entryId, known: known(sectionId, target.entryId) }
            : null;
        go(target, next, ticked ? undefined : tick(target));
      },
      addEntry: (sectionId) => {
        const entry = emptyEntry();
        add({ sectionId, entryId: entry.id, what: "title" }, "entry", (section) => addEntry(section, entry));
      },
      addBullet: (sectionId, entryId) =>
        add({ sectionId, entryId, what: "bullet" }, "bullet", (section) => showForBullet(section, entryId)),
    };
  }, [change, find, go]);

  /** Goes to a section that was just added. */
  const goToNew = useCallback(
    (sectionId: number) => {
      // As the drafts have it: with an entry to write in.
      const entry = find(sectionId)?.entries[0];
      go(
        { sectionId, what: "heading", selected: true },
        entry ? { what: "section", sectionId, entryId: entry.id, known: [] } : null
      );
    },
    [find, go]
  );

  return { channel, added, edits, goToNew };
};
