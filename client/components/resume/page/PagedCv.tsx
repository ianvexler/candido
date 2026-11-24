"use client";

import { DesignSettings, sheetPadding } from "@/lib/resume/design";
import { buildResumeDocument, ExportEntry, KeptPlace, ResumeDocument } from "@/lib/resume/exportDocument";
import { showHiddenText } from "@/lib/resume/items";
import type { EntryVersions } from "@/lib/resume/sectionDrafts";
import type { CurriculumSection, CvSuggestion, PaperSize, ResumeHeader } from "@/lib/types";
import {
  FocusEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ResumeTemplate } from "../templates/ResumeTemplate";
import type { SuggestionProps } from "../useEntrySuggestions";
import BodySlot, { Bodies, BodiesContext, changeEntry, OnSectionChange } from "./BodySlot";
import HiddenTextMarks, { findHiddenMarks, HiddenMarkAt, MARK_SIZE } from "./HiddenTextMarks";
import { byEntry, HiddenPlace, showHiddenInEditor } from "./hiddenText";
import { createPageSections, sourceOfEntry, sourceOfSection } from "./pageDocument";
import { PageEditing, PageEditingContext, TextBinding } from "./PageEditing";
import type { PageEditors } from "./pageEditors";
import { pageWidth, SHEETS, sheetsHeight } from "./pageSize";
import { placeOf } from "./pagePlace";
import { useNearEntries } from "./useNearEntries";
import { PagePaging, usePaging } from "./usePaging";

/** Makes the header editable. */
export type HeaderBinding = {
  text: (kind: "name" | "headline") => TextBinding | null;
  contact: () => ReactNode | null;
};

interface PagedCvProps extends Omit<SuggestionProps, "suggestions"> {
  /** The drafts. */
  sections: CurriculumSection[];
  versions: Record<number, EntryVersions>;
  onSectionChange: OnSectionChange;
  editors: PageEditors;
  /** Resolved: profile with this CV's overrides. */
  header: ResumeHeader;
  /** Must stay the same while it has nothing new: all of the page follows it. */
  headerBinding?: HeaderBinding | null;
  design: DesignSettings;
  paper: PaperSize;
  zoom: "fit" | "full";
  /** Must stay the same function. */
  onPaging: (paging: PagePaging) => void;
  /** An entry to offer even with nothing in it. */
  open?: { sectionId: number; entryId: string } | null;
  suggestionsBySection?: Map<number, CvSuggestion[]>;
}

const FIELDS = '.page-text, .ProseMirror, .page-entry-body > [role="textbox"]';

/** Enter in a one-line field. */
const moveOn = (root: HTMLElement | null) => {
  const fields = [...(root?.querySelectorAll<HTMLElement>(FIELDS) ?? [])].filter((field) => field.getClientRects().length > 0);
  const next = fields[fields.findIndex((field) => field === document.activeElement) + 1];
  if (next) next.focus();
  else (document.activeElement as HTMLElement | null)?.blur();
};

const samePlace = (a: KeptPlace | null, b: KeptPlace | null) => a?.sectionId === b?.sectionId && a?.entryId === b?.entryId;

const Page = ({
  sections,
  versions,
  onSectionChange,
  editors,
  header,
  headerBinding = null,
  design,
  paper,
  zoom,
  onPaging,
  open = null,
  suggestionsBySection,
  activeSuggestionId,
  onSuggestionClick,
  onSuggestionClose,
  onSuggestionResolve,
}: PagedCvProps) => {
  const pageId = useId();
  const outerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const { width } = SHEETS[paper];
  const scale = zoom === "fit" && available !== null ? Math.min(1, available / width) : 1;

  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const take = () => setAvailable(outer.clientWidth);
    take();
    const observer = new ResizeObserver(take);
    observer.observe(outer);
    return () => observer.disconnect();
  }, []);

  // --- What is on the page --------------------------------------------------
  const [focusedIn, setFocusedIn] = useState<KeptPlace | null>(null);
  const [buildSections] = useState(createPageSections);
  const shownSections = useMemo(
    () => buildSections(sections, versions, [focusedIn, open].filter((place) => place !== null)),
    [buildSections, sections, versions, focusedIn, open]
  );
  const shownHeader = useMemo(() => buildResumeDocument({ title: "", header, sections: [] }).header, [header]);
  const shown: ResumeDocument = useMemo(
    () => ({ title: "", header: shownHeader, sections: shownSections }),
    [shownHeader, shownSections]
  );

  const onFocus = ({ target }: FocusEvent) => {
    // Toolbars float elsewhere.
    if (!rootRef.current?.contains(target)) return;
    const place = placeOf(target);
    setFocusedIn((before) => (samePlace(before, place) ? before : place));
  };
  const leaveIfLeft = useCallback(() => {
    if (!rootRef.current?.contains(document.activeElement)) setFocusedIn(null);
  }, []);
  const onBlur = ({ target, relatedTarget }: FocusEvent) => {
    // Another window took the focus.
    if (document.activeElement === target || rootRef.current?.contains(relatedTarget)) return;
    leaveIfLeft();
  };
  // An editor that is remounted or taken away takes its focus with it, without a blur.
  useEffect(() => {
    const frame = requestAnimationFrame(leaveIfLeft);
    return () => cancelAnimationFrame(frame);
  }, [shownSections, leaveIfLeft]);

  // --- Editing --------------------------------------------------------------
  const near = useNearEntries(rootRef, shown, design.template);
  const editing = useMemo<PageEditing>(() => {
    const onEnter = () => moveOn(rootRef.current);
    return {
      text: (slot, of) => {
        if (!("sectionId" in slot)) return headerBinding?.text(slot.kind) ?? null;
        if (!of) return null;
        if (slot.kind === "heading") {
          const section = "entries" in of ? sourceOfSection(of) : undefined;
          if (!section) return null;
          return {
            value: section.section_type,
            label: "Section heading",
            required: true,
            onEnter,
            onChange: (section_type) => onSectionChange(slot.sectionId, { section_type }),
          };
        }
        const { sectionId, entryId } = slot;
        const entry = "entries" in of ? undefined : sourceOfEntry(of)?.entry;
        if (!entry) return null;
        const bind = (field: "title" | "description", label: string): TextBinding => ({
          value: entry[field] ?? "",
          label,
          onEnter,
          onChange: (text) => changeEntry(onSectionChange, sectionId, entryId, { [field]: text }),
        });
        if (slot.kind === "title") return bind("title", "Title");
        // Left out, so it isn't on the page at all.
        return entry.description_off ? null : bind("description", "Summary");
      },
      line: () => null,
      body: (entryShown: ExportEntry) => {
        const source = sourceOfEntry(entryShown);
        if (!source) return null;
        const { section, entry, version } = source;
        return <BodySlot sectionId={section.id} isFirst={section.entries[0]?.id === entry.id} entry={entry} version={version} />;
      },
      contact: () => headerBinding?.contact() ?? null,
    };
  }, [headerBinding, onSectionChange]);

  const bodies = useMemo<Bodies>(
    () => ({
      onSectionChange,
      editors,
      near,
      open,
      suggestionsBySection,
      activeSuggestionId,
      onSuggestionClick,
      onSuggestionClose,
      onSuggestionResolve,
    }),
    [onSectionChange, editors, near, open, suggestionsBySection, activeSuggestionId, onSuggestionClick, onSuggestionClose, onSuggestionResolve]
  );

  // --- Pages ----------------------------------------------------------------
  const [marks, setMarks] = useState<HiddenMarkAt[]>([]);
  const onLaidOut = useCallback(
    (root: HTMLElement, at: number) => {
      const found = findHiddenMarks(root, at, shownSections);
      setMarks((before) => (JSON.stringify(before) === JSON.stringify(found) ? before : found));
    },
    [shownSections]
  );
  const paging = usePaging(rootRef, { pageId, design, paper, scale, onLaidOut });
  useEffect(() => onPaging(paging), [onPaging, paging]);

  const showHidden = useCallback(
    (places: HiddenPlace[]) => {
      let focused = false;
      byEntry(places).forEach(({ sectionId, entryId, itemIds }) => {
        const editor = editors.of(sectionId).current.get(entryId);
        if (!editor || editor.isDestroyed) {
          changeEntry(onSectionChange, sectionId, entryId, (entry) => ({ content: showHiddenText(entry.content, itemIds) }));
          return;
        }
        showHiddenInEditor(editor, itemIds);
        // Where undo hides it again.
        if (!focused) editor.view.focus();
        focused = true;
      });
      // The mark that was pressed goes away.
      if (!focused) rootRef.current?.focus({ preventScroll: true });
    },
    [editors, onSectionChange]
  );

  const { pages } = paging.paging;
  const { sheetHeight, gap } = paging.metrics;
  const height = sheetsHeight(pages, paging.metrics);
  const markRoom = available === null ? 0 : (available - width * scale) / 2;

  return (
    <div ref={outerRef} className="paged-cv">
      <div className="relative mx-auto" style={{ width: width * scale, height: height * scale }}>
        <div
          className="absolute left-0 top-0 origin-top-left"
          // Scaled, not zoomed: text wraps and measures as it does in print.
          style={{ width, height, transform: scale === 1 ? undefined : `scale(${scale})` }}
        >
          <div aria-hidden>
            {Array.from({ length: pages }, (_, page) => (
              <div
                key={page}
                className="absolute left-0 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.08)]"
                style={{ top: page * (sheetHeight + gap), width, height: sheetHeight }}
              >
                {design.template === "sidebar" && (
                  <div
                    className="paged-cv-tint absolute inset-y-0 left-0 w-[32%]"
                    style={{ background: `color-mix(in srgb, ${design.accent} 7%, white)` }}
                  />
                )}
              </div>
            ))}
          </div>
          <div
            ref={rootRef}
            data-cv-page={pageId}
            role="region"
            aria-label="CV page"
            tabIndex={-1}
            className="relative outline-none"
            style={{ width: pageWidth(design, paper), padding: sheetPadding(design) }}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <BodiesContext value={bodies}>
              <PageEditingContext value={editing}>
                <ResumeTemplate document={shown} paper={paper} design={design} />
              </PageEditingContext>
            </BodiesContext>
          </div>
          <HiddenTextMarks marks={marks} inside={markRoom < MARK_SIZE + 8} onShow={showHidden} />
        </div>
      </div>
    </div>
  );
};

const noChanges = () => () => {};

/** A CV on its sheets of paper, as it prints, edited in place. */
const PagedCv = (props: PagedCvProps) => {
  // Its editors and its measures need a browser.
  const inBrowser = useSyncExternalStore(noChanges, () => true, () => false);
  return inBrowser ? <Page {...props} /> : null;
};

export default PagedCv;
