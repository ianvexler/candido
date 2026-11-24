"use client";

import { DesignSettings, sheetPadding } from "@/lib/resume/design";
import { buildResumeDocument, ExportEntry, KeptPlace, ResumeDocument } from "@/lib/resume/exportDocument";
import { showHiddenText } from "@/lib/resume/items";
import type { EntryEditor, EntryVersions, SectionChange } from "@/lib/resume/sectionDrafts";
import type { CurriculumSection, CvSuggestion, PaperSize, ResumeHeader, SectionEntry } from "@/lib/types";
import {
  createContext,
  FocusEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ResumeTemplate } from "../templates/ResumeTemplate";
import type { EntryChange } from "../useEntryEditor";
import type { SuggestionProps } from "../useEntrySuggestions";
import HiddenTextMarks, { findHiddenMarks, HiddenMarkAt, HiddenPlace, MARK_SIZE } from "./HiddenTextMarks";
import { showHiddenInEditor } from "./hiddenText";
import { createNearStore, NearStore } from "./nearStore";
import { createPageSections, sourceOfEntry, sourceOfSection } from "./pageDocument";
import { PageEditing, PageEditingContext, TextBinding } from "./PageEditing";
import type { PageEditors } from "./pageEditors";
import PageEntryBody from "./PageEntryBody";
import { pageWidth, SHEETS, sheetsHeight } from "./pageSize";
import { scrollParent } from "./scrolling";
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
  /** The drafts' change. */
  onSectionChange: (id: number, change: SectionChange, editor?: EntryEditor) => void;
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

type Bodies = SuggestionProps & {
  onSectionChange: PagedCvProps["onSectionChange"];
  editors: PageEditors;
  near: NearStore;
  open: PagedCvProps["open"];
  suggestionsBySection?: Map<number, CvSuggestion[]>;
};

const BodiesContext = createContext<Bodies | null>(null);

const entryKey = (sectionId: number | string, entryId: string) => `${sectionId}:${entryId}`;

const changeEntry = (
  onSectionChange: PagedCvProps["onSectionChange"],
  sectionId: number,
  entryId: string,
  changes: EntryChange,
  version?: number
) =>
  onSectionChange(
    sectionId,
    (current) => ({
      entries: current.entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...(typeof changes === "function" ? changes(entry) : changes) } : entry
      ),
    }),
    version === undefined ? undefined : { entryId, version }
  );

interface BodySlotProps {
  sectionId: number;
  /** Reviews from before sections had entries are about this one. */
  isFirst: boolean;
  entry: SectionEntry;
  version: number;
}

const BodySlot = ({ sectionId, isFirst, entry, version }: BodySlotProps) => {
  const { onSectionChange, editors, near, open, suggestionsBySection, ...suggestionProps } = useContext(BodiesContext)!;
  const key = entryKey(sectionId, entry.id);
  const subscribe = useCallback((listener: () => void) => near.subscribe(key, listener), [near, key]);
  const isNear = useSyncExternalStore(subscribe, () => near.has(key));
  const onEntryChange = useCallback(
    (id: string, changes: EntryChange, from?: number) => changeEntry(onSectionChange, sectionId, id, changes, from),
    [onSectionChange, sectionId]
  );
  const ofSection = suggestionsBySection?.get(sectionId);
  const suggestions = useMemo(
    () => ofSection?.filter((s) => (s.entry_id === null ? isFirst : s.entry_id === entry.id)),
    [ofSection, isFirst, entry.id]
  );

  return (
    <PageEntryBody
      entry={entry}
      version={version}
      onEntryChange={onEntryChange}
      editors={editors.of(sectionId)}
      near={isNear}
      open={open?.sectionId === sectionId && open.entryId === entry.id}
      suggestions={suggestions}
      {...suggestionProps}
    />
  );
};

const FIELDS = '.page-text, .ProseMirror, .page-entry-body > [role="textbox"]';

/** Enter in a one-line field. */
const moveOn = (root: HTMLElement | null) => {
  const fields = [...(root?.querySelectorAll<HTMLElement>(FIELDS) ?? [])].filter((field) => field.getClientRects().length > 0);
  const next = fields[fields.findIndex((field) => field === document.activeElement) + 1];
  if (next) next.focus();
  else (document.activeElement as HTMLElement | null)?.blur();
};

const placeOf = (element: Element): KeptPlace | null => {
  const section = element.closest("[data-section-id]")?.getAttribute("data-section-id");
  return section
    ? { sectionId: Number(section), entryId: element.closest("[data-entry-id]")?.getAttribute("data-entry-id") ?? null }
    : null;
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
  const [near] = useState(createNearStore);
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

  // --- Near the screen ------------------------------------------------------
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observed = useRef(new Set<Element>());
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    observerRef.current ??= new IntersectionObserver(
      (entries) =>
        entries.forEach(({ target, isIntersecting }) => {
          const place = placeOf(target);
          if (place?.entryId && target.isConnected) near.set(entryKey(place.sectionId, place.entryId), isIntersecting);
        }),
      { root: scrollParent(root), rootMargin: "100% 0px" }
    );
    const observer = observerRef.current;
    const elements = new Set(root.querySelectorAll("[data-entry-id]"));
    observed.current.forEach((element) => !elements.has(element) && observer.unobserve(element));
    elements.forEach((element) => !observed.current.has(element) && observer.observe(element));
    observed.current = elements;
  }, [shown, design.template, near]);
  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      observed.current = new Set();
    },
    []
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
  const paging = usePaging(rootRef, { design, paper, scale, onLaidOut });
  useEffect(() => onPaging(paging), [onPaging, paging]);

  const showHidden = useCallback(
    (places: HiddenPlace[]) =>
      places.forEach(({ sectionId, entryId, itemIds }) => {
        const editor = editors.of(sectionId).current.get(entryId);
        if (editor && !editor.isDestroyed) return showHiddenInEditor(editor, itemIds);
        changeEntry(onSectionChange, sectionId, entryId, (entry) => ({ content: showHiddenText(entry.content, itemIds) }));
        // The mark that was pressed goes away.
        rootRef.current?.focus({ preventScroll: true });
      }),
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
