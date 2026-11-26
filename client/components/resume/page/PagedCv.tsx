"use client";

import { DesignSettings, sheetPadding } from "@/lib/resume/design";
import { buildResumeDocument, KeptPlace, ResumeDocument } from "@/lib/resume/exportDocument";
import { showHiddenText } from "@/lib/resume/items";
import type { EntryVersions } from "@/lib/resume/sectionDrafts";
import type { CurriculumSection, CvSuggestion, PaperSize, ResumeHeader } from "@/lib/types";
import {
  FocusEvent,
  memo,
  Ref,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { EditChannelContext, EditTarget } from "../editChannel";
import { ResumeTemplate } from "../templates/ResumeTemplate";
import type { Added } from "../useAdded";
import type { SuggestionProps } from "../useEntrySuggestions";
import { Bodies, BodiesContext, changeEntry, OnSectionChange } from "./BodySlot";
import FoldMarks from "./FoldMarks";
import { findFolds, FoldAt } from "./folds";
import HiddenTextMarks, { findHiddenMarks, HiddenMarkAt, isHiddenMark, MARK_SIZE, mergeMarks } from "./HiddenTextMarks";
import { byEntry, HiddenPlace, showHiddenInEditor } from "./hiddenText";
import { CardsContext, entryAt } from "./cardPlace";
import { editOnPage } from "./editOnPage";
import { createPageSections } from "./pageDocument";
import { PageEditingContext, PageHeaderContext } from "./PageEditing";
import type { PageEditors } from "./pageEditors";
import { pageWidth, SHEETS, sheetsHeight } from "./pageSize";
import { placeOf } from "./pagePlace";
import { hasContact } from "./PageContact";
import { CardMarks, DatesMarkAt, findDatesMarks, PageCards } from "./PageCards";
import type { HeaderBinding } from "./useHeaderBinding";
import { useNearEntries } from "./useNearEntries";
import { usePageCards } from "./usePageCards";
import { usePageEditing } from "./usePageEditing";
import { PagePaging, usePaging } from "./usePaging";
import PageTools, { PageToolsActions, PageToolsHandle } from "./PageTools";

export interface PagedCvProps extends Omit<SuggestionProps, "suggestions"> {
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
  /** What to offer a place to write in, even with nothing there. */
  open?: Added | null;
  suggestionsBySection?: Map<number, CvSuggestion[]>;
  /** Set to what says whether the page may go now. */
  leaveRef?: RefObject<(() => boolean) | null>;
  /** Only shown, as it prints. */
  readOnly?: boolean;
  /** What the page's ticks and add points do; without, it has none. Must stay the same while it has nothing new. */
  tools?: PageToolsActions | null;
  /** Opens the add points' menus, as a keyboard shortcut does. */
  toolsRef?: Ref<PageToolsHandle>;
}

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
  leaveRef,
  readOnly = false,
  tools = null,
  toolsRef,
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
  const cards = usePageCards(rootRef, sections);
  const { openCard, unfinished } = cards;
  useImperativeHandle(leaveRef, () => cards.mayLeave);
  const cardPlace = cards.open?.place;
  const cardIn = cardPlace?.kind === "entry" ? cardPlace : null;
  const [buildSections] = useState(createPageSections);
  const shownSections = useMemo(
    () => buildSections(sections, versions, [focusedIn, open, cardIn, ...unfinished].filter((place) => place !== null)),
    [buildSections, sections, versions, focusedIn, open, cardIn, unfinished]
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
  const editing = usePageEditing(rootRef, { headerBinding, onSectionChange, readOnly, open });

  const channel = useContext(EditChannelContext);
  const onTarget = useEffectEvent((target: EditTarget) =>
    editOnPage(target, {
      root: rootRef.current,
      editors,
      openCard,
      hasEntry: (sectionId, entryId) => entryAt(sections, sectionId, entryId) !== null,
      onLost: (sectionId, entryId, drop) =>
        changeEntry(
          onSectionChange,
          sectionId,
          entryId,
          ({ content }) => ({ content: drop(content) }),
          versions[sectionId]?.[entryId] ?? 0,
          true
        ),
    })
  );
  useEffect(() => (readOnly ? undefined : channel?.handle((target) => onTarget(target))), [channel, readOnly]);

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
  const [folds, setFolds] = useState<FoldAt[]>([]);
  const [datesMarks, setDatesMarks] = useState<DatesMarkAt[]>([]);
  const [headerTop, setHeaderTop] = useState(0);
  const folding = tools !== null;
  const onLaidOut = useCallback(
    (root: HTMLElement, at: number) => {
      // In one margin with the hidden-text marks: stacked, never over each other.
      const all = mergeMarks<HiddenMarkAt | FoldAt>([
        ...findHiddenMarks(root, at, shownSections),
        ...(folding ? findFolds(root, at, sections) : []),
      ]);
      const found = all.filter(isHiddenMark);
      const folded = all.filter((mark): mark is FoldAt => !isHiddenMark(mark));
      setMarks((before) => (JSON.stringify(before) === JSON.stringify(found) ? before : found));
      setFolds((before) => (JSON.stringify(before) === JSON.stringify(folded) ? before : folded));
      const dates = findDatesMarks(root, at, shownSections, unfinished, all);
      setDatesMarks((before) => (JSON.stringify(before) === JSON.stringify(dates) ? before : dates));
      const top = root.querySelector(".rc-header")?.getBoundingClientRect().top ?? 0;
      setHeaderTop(Math.round((top - root.getBoundingClientRect().top) / at));
    },
    [shownSections, sections, unfinished, folding]
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

  const focusPage = useCallback(() => rootRef.current?.focus({ preventScroll: true }), []);

  const { pages } = paging.paging;
  const { sheetHeight, gap } = paging.metrics;
  const height = sheetsHeight(pages, paging.metrics);
  const markRoom = available === null ? 0 : (available - width * scale) / 2;
  const marksInside = markRoom < MARK_SIZE + 8;

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
              <CardsContext value={cards.context}>
                <PageEditingContext value={editing.sections}>
                  <PageHeaderContext value={editing.header}>
                    <ResumeTemplate document={shown} paper={paper} design={design} />
                  </PageHeaderContext>
                </PageEditingContext>
              </CardsContext>
            </BodiesContext>
          </div>
          {!readOnly && (
            <>
              <HiddenTextMarks marks={marks} inside={marksInside} onShow={showHidden} />
              <CardMarks
                marks={datesMarks}
                inside={marksInside}
                openKey={cards.context.openKey}
                openCard={openCard}
                addContact={
                  headerBinding && !hasContact(shownHeader)
                    ? { top: headerTop + MARK_SIZE / 2, named: Boolean(shownHeader.name) }
                    : null
                }
              />
              {tools && (
                <>
                  <FoldMarks folds={folds} inside={marksInside} actions={tools.actions} onClosed={focusPage} />
                  <PageTools ref={toolsRef} rootRef={rootRef} scale={scale} sections={sections} {...tools} />
                </>
              )}
            </>
          )}
        </div>
      </div>
      <PageCards
        cards={cards}
        rootRef={rootRef}
        sections={sections}
        versions={versions}
        onSectionChange={onSectionChange}
        contact={headerBinding?.contact ?? null}
      />
    </div>
  );
};

const noChanges = () => () => {};

/** A CV on its sheets of paper, as it prints, edited in place. */
const PagedCv = memo((props: PagedCvProps) => {
  // Its editors and its measures need a browser.
  const inBrowser = useSyncExternalStore(noChanges, () => true, () => false);
  return inBrowser ? <Page {...props} /> : null;
});
PagedCv.displayName = "PagedCv";

export default PagedCv;
