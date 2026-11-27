import { addEntry, insertEntry, isIn, putBack, showForBullet, tickEntry, tickItem, tickSection } from "@/lib/resume/checklist";
import { isLeftOut } from "@/lib/resume/exportDocument";
import { listItems } from "@/lib/resume/items";
import { emptyEntry, entryUnderHeading } from "@/lib/resume/sectionEntries";
import type { SectionChange, SectionDraft, SectionPatch } from "@/lib/resume/sectionDrafts";
import { CurriculumSection, SUMMARY_ID } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createEditChannel, EditTarget } from "./editChannel";
import { Added, useAdded } from "./useAdded";
import type { CvView } from "./useCvView";

/** A place to add at: after an item of an entry, or its top for null; under a section's heading for a null entry. */
export type AddPlace = { sectionId: number; entryId: string | null; after: string | null };

/** What the checklist adds and edits. The functions stay the same. */
export type CvEdits = {
  /** Ticks what isn't in the CV first. */
  edit: (target: EditTarget) => void;
  addEntry: (sectionId: number) => void;
  addBullet: (sectionId: number, entryId: string) => void;
  /** An entry goes after the place's entry, or first; a bullet or paragraph after its item. */
  addAt: (place: AddPlace, what: "bullet" | "paragraph" | "entry") => void;
};

const itemOf = (target: EditTarget) =>
  target.what === "item" ? target.itemId : target.what === "summary" ? SUMMARY_ID : "";

const tick = (target: EditTarget) => (section: SectionDraft): SectionPatch => {
  const itemId = itemOf(target);
  if (target.what === "heading") return tickSection(section, true);
  const { entryId } = target;
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
  /** A month of the entry is half written, which its draft doesn't have. */
  isUnfinished: (sectionId: number, entryId: string) => boolean;
}

/** What to keep offering while a target is gone to. `last` is what was added there just before, if it may be put back. */
const addedFor = (target: EditTarget, last: Added | null, known: string[]): Added | null => {
  const { sectionId, what } = target;
  const back = last?.putBack && { putBack: last.putBack };
  if (what === "heading") return last && { what: "section", sectionId, entryId: last.entryId, known: last.known, ...back };
  const { entryId } = target;
  const offered = { sectionId, entryId, known: last?.known ?? known, ...back };
  // A new entry goes on offering its text too.
  if (what === "title") return { ...offered, what: last?.what === "entry" ? "entry" : "title" };
  // Offered even while empty.
  if (what === "summary" || what === "bullet") return { ...offered, what };
  return last && { ...offered, what: what === "details" ? "details" : "bullet" };
};

/** Adding to a CV and going to what is edited, in the view that is on the screen. */
export const useCvEdits = ({ current, change, view, showCv, isUnfinished }: CvEditsOptions) => {
  const [channel] = useState(createEditChannel);
  const { added, start, take } = useAdded(view);
  useEffect(() => channel.stop, [channel, view]);
  const latestShow = useRef(showCv);
  useEffect(() => {
    latestShow.current = showCv;
  });

  const find = useCallback((id: number) => current().find((section) => section.id === id), [current]);

  /** On the screen at once, so a place that is there has the focus within the press. */
  const go = useCallback(
    (target: EditTarget, next: Added | null, patch?: (section: SectionDraft) => SectionPatch) => {
      flushSync(() => {
        latestShow.current();
        if (patch) change(target.sectionId, patch);
        start(next);
      });
      channel.ask(target);
    },
    [change, channel, start]
  );

  /**
   * What was added last, if the target goes on with it: what it ticked is put back
   * only once that is left too. Otherwise that is done here and now.
   */
  const goOn = useCallback(
    (target: EditTarget): Added | null => {
      const last = take();
      if (!last?.putBack) return null;
      const same =
        last.sectionId === target.sectionId && (target.what === "heading" || target.entryId === last.entryId);
      if (same) return last;
      last.putBack();
      return null;
    },
    [take]
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
      const last = goOn(target);
      const before = find(sectionId);
      if (!before) return;
      const after = { ...before, ...patch(before) };
      const wasOut = isLeftOut(before) || before.entries.some(({ id, hidden }) => id === entryId && hidden);
      const back = () => {
        if (!isUnfinished(sectionId, entryId)) change(sectionId, putBack(before, after, entryId));
      };
      go(
        target,
        {
          what,
          sectionId,
          entryId,
          known: known(sectionId, entryId),
          putBack: wasOut ? back : last?.putBack,
        },
        patch
      );
    };

    const newEntry = (sectionId: number, afterEntryId: string | null) => {
      const entry = emptyEntry();
      add({ sectionId, entryId: entry.id, what: "title" }, "entry", (section) => insertEntry(section, afterEntryId, entry));
    };

    return {
      edit: (target) => {
        const last = goOn(target);
        // As it is now: what a row showed may just have been put back.
        const section = find(target.sectionId);
        if (!section) return;
        const entryId = target.what === "heading" ? undefined : target.entryId;
        const next = addedFor(target, last, entryId === undefined ? [] : known(target.sectionId, entryId));
        go(target, next, isIn(section, entryId, itemOf(target)) ? undefined : tick(target));
      },
      addEntry: (sectionId) => {
        const entry = emptyEntry();
        add({ sectionId, entryId: entry.id, what: "title" }, "entry", (section) => addEntry(section, entry));
      },
      addBullet: (sectionId, entryId) =>
        add({ sectionId, entryId, what: "bullet" }, "bullet", (section) => showForBullet(section, entryId)),
      addAt: ({ sectionId, entryId, after }, what) => {
        const section = find(sectionId);
        if (!section) return;
        // Under the heading: the top of the first entry that shows and has text, or a new one without any.
        const into = entryId ?? entryUnderHeading(section.entries)?.id;
        if (what === "entry" || into === undefined) return newEntry(sectionId, entryId);
        // Its editor has only the items that show: one that is left out shows with none.
        const shows = after !== null && isIn(section, into, after) && known(sectionId, into).includes(after);
        const at = entryId !== null && shows ? after : null;
        const target: EditTarget = { sectionId, what: "insert", entryId: into, after: at, kind: what };
        add(target, "bullet", (section) => showForBullet(section, into));
      },
    };
  }, [change, find, go, goOn, isUnfinished]);

  /** Goes to a section that was just added. */
  const goToNew = useCallback(
    (sectionId: number) => {
      const target: EditTarget = { sectionId, what: "heading", selected: true };
      goOn(target);
      // As the drafts have it: with an entry to write in.
      const entry = find(sectionId)?.entries[0];
      go(target, entry ? { what: "section", sectionId, entryId: entry.id, known: [] } : null);
    },
    [find, go, goOn]
  );

  return { channel, added, edits, goToNew };
};
