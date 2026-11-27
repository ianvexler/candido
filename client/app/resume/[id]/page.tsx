"use client";

import { getCvLabels } from "@/api/resources/cvLabels/getCvLabels";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import Loader from "@/components/common/Loader";
import AddSheetButton from "@/components/resume/AddSheetButton";
import CvCards from "@/components/resume/CvCards";
import CvChecklist from "@/components/resume/CvChecklist";
import CvPageHeader from "@/components/resume/CvPageHeader";
import CvWorkspace, { CvTab } from "@/components/resume/CvWorkspace";
import DesignSheet from "@/components/resume/DesignSheet";
import { createHalfPickedGate } from "@/components/resume/halfPicked";
import { watchMovedOn } from "@/components/resume/movedOn";
import { createPageEditors } from "@/components/resume/page/pageEditors";
import PagePreview from "@/components/resume/page/PagePreview";
import PageView from "@/components/resume/page/PageView";
import PurposeSelect from "@/components/resume/PurposeSelect";
import { useHeaderBinding } from "@/components/resume/page/useHeaderBinding";
import { EditChannelContext } from "@/components/resume/editChannel";
import { deletionNote } from "@/components/resume/removeSection";
import ReviewPanel from "@/components/resume/review/ReviewPanel";
import { showSuggestion } from "@/components/resume/review/showSuggestion";
import { CvView, useCvView } from "@/components/resume/useCvView";
import { useCvEdits } from "@/components/resume/useCvEdits";
import { useRoomForPage } from "@/components/resume/useRoomForPage";
import { buildChecklist, tickSuggestion } from "@/lib/resume/checklist";
import { PurposeKeptChanging, RequestStopped } from "@/lib/resume/cvRequests";
import { isLeftOut, sectionColumn } from "@/lib/resume/exportDocument";
import { createMonthDrafts, MonthDraftsContext } from "@/lib/resume/monthDrafts";
import { apiErrorMessage, isConflict } from "@/lib/resume/reviewPanel";
import { useCv } from "@/lib/resume/useCv";
import { CvLabel, CvSuggestion, MissingSection } from "@/lib/types";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

interface ResumePageProps {
  params: Promise<{ id: string }>;
}

const CvPage = ({ id }: { id: string }) => {
  const { curriculum, setCurriculum, profile, loadError, drafts, library, checklist, review, header, look, saveTitle, exportPdf, exporting } = useCv(id);
  const { sections, versions, change } = drafts;
  const { pending, actions, addSection, changePurpose, changingPurpose } = checklist;
  const [labels, setLabels] = useState<CvLabel[]>([]);
  /** The purpose asked about, while asking whether to reset ticks changed by hand. */
  const [resetTo, setResetTo] = useState<{ labelId: number | null; name: string } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  // A CV just made opens ready to rename; a reload doesn't.
  const [justMade] = useState(() => searchParams.has("rename"));
  useEffect(() => {
    if (justMade) router.replace(`/resume/${id}`, { scroll: false });
  }, [justMade, router, id]);

  // Without them the purpose can't be changed, but the CV still opens.
  useEffect(() => {
    let cancelled = false;
    getCvLabels()
      .then((response) => {
        if (!cancelled) setLabels(response.cv_labels);
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, []);
  const [view, setView] = useCvView();
  const roomForPage = useRoomForPage(view);
  const [tab, setTab] = useState<CvTab>("cv");
  const [adding, setAdding] = useState(false);
  const onPage = view === "page" && roomForPage;
  // Kept whatever the view.
  const [query, setQuery] = useState("");
  const [designName, setDesignName] = useState<string | null>(null);
  const [monthDrafts] = useState(createMonthDrafts);
  useEffect(() => monthDrafts.prune(sections), [monthDrafts, sections]);
  const leaveRef = useRef<(() => boolean) | null>(null);
  const [mayLeaveCards] = useState(createHalfPickedGate);
  const [editors] = useState(createPageEditors);
  const headerBinding = useHeaderBinding(header);
  const isUnfinished = useCallback(
    (sectionId: number, entryId: string) => monthDrafts.isUnfinished({ sectionId, entryId }),
    [monthDrafts]
  );
  const { channel, added, edits, goToNew } = useCvEdits({
    current: drafts.current,
    change,
    view: onPage ? "page" : "cards",
    showCv: () => setTab("cv"),
    isUnfinished,
  });

  // Stays the same, for the checklist's memo. Without `afterSectionId` it goes last.
  const addNamedSection = useCallback(async (name: string, afterSectionId?: number | null) => {
    setAdding(true);
    const movedOn = watchMovedOn();
    try {
      const section = await addSection(name);
      if (section && afterSectionId !== undefined) actions.placeSection(section.id, afterSectionId);
      if (section && !movedOn()) goToNew(section.id);
      return true;
    } catch (error) {
      console.error(error);
      toast.error(`Couldn't add the ${name.toLowerCase()} section. Try again.`);
      return false;
    } finally {
      movedOn();
      setAdding(false);
    }
  }, [addSection, goToNew, actions]);
  const addPlainSection = useCallback(() => void addNamedSection("Section"), [addNamedSection]);
  const addSectionAfter = useCallback(
    async (name: string, afterSectionId: number | null) => void (await addNamedSection(name, afterSectionId)),
    [addNamedSection]
  );

  const libraryLoaded = !library.loading && !library.failed;
  const createdAt = curriculum?.created_at;
  const rows = useMemo(
    () => (createdAt === undefined ? [] : buildChecklist(sections, library.templates, createdAt)),
    [sections, library.templates, createdAt]
  );

  // Stays the same, for the sections' memo.
  const known = useRef({ rows, libraryLoaded });
  useEffect(() => {
    known.current = { rows, libraryLoaded };
  });
  const describeDeletion = useCallback((sectionId: number, entryId?: string) => {
    const section = known.current.rows.find((row) => row.sectionId === sectionId);
    return deletionNote(section, known.current.libraryLoaded, entryId);
  }, []);

  // Stays the same while they do, for the page's memo.
  const tools = useMemo(
    () => ({ rows, actions, edits, addSection: addSectionAfter }),
    [rows, actions, edits, addSectionAfter]
  );

  const twoColumn = look.design.template === "sidebar";
  const columns = useMemo(
    () => (twoColumn ? new Map(sections.map((section) => [section.id, sectionColumn(section)])) : null),
    [twoColumn, sections]
  );

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">This CV could not be loaded.</p>
        <NextLink href="/resume" className="text-sm underline">
          Back to your CVs
        </NextLink>
      </div>
    );
  }

  if (!curriculum || !profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  const { tailoring, activeId } = review;
  const tailored = tailoring !== null || curriculum.job_board_entry_id !== null;

  // Opens the suggestion's card and brings its text (or its section) into view.
  // One about left out text first offers to tick that, in the panel.
  const openSuggestion = (s: CvSuggestion) => {
    review.setActiveId(s.id);
    setTab("cv");
    showSuggestion(s);
  };

  const selectSuggestion = (s: CvSuggestion) => {
    if (review.leftOutIds.has(s.id)) review.setActiveId(s.id);
    else openSuggestion(s);
  };

  // Ticks by the purpose. Asks first if ticks were changed by hand since it last did.
  const choosePurpose = async (labelId: number | null, force = false) => {
    try {
      setCurriculum(await changePurpose(labelId, force));
    } catch (error) {
      if (!force && isConflict(error)) {
        const name = labels.find((label) => label.id === labelId)?.name ?? "all content";
        setResetTo({ labelId, name });
      } else if (error instanceof RequestStopped) {
        // The server has the new purpose even so.
        if (error instanceof PurposeKeptChanging) {
          const { labelId: changedTo } = error;
          setCurriculum((now) => now && { ...now, cv_label_id: changedTo });
        }
        toast.error(error.message);
      } else {
        console.error(error);
        toast.error(apiErrorMessage(error, "Couldn't change the collection. Try again."));
      }
    }
  };

  const includeSuggestion = (s: CvSuggestion) => {
    if (changingPurpose) {
      toast("Wait until the collection has changed, then include this.");
      return;
    }
    change(s.curriculum_section_id, (section) => tickSuggestion(section, s));
    openSuggestion(s);
  };

  const addMissingSection = async (name: MissingSection) => {
    if (await addNamedSection(name)) toast.success(`${name} section added`);
  };

  const checklistPanel = (
    <CvChecklist
      sections={rows}
      pending={pending}
      ticksLocked={changingPurpose}
      actions={actions}
      columns={columns}
      libraryLoading={library.loading}
      libraryFailed={library.failed}
      onRetryLibrary={library.refresh}
      query={query}
      onQueryChange={setQuery}
      edits={edits}
      added={added}
      onAddSection={addPlainSection}
      adding={adding}
    />
  );

  const reviewPanel = tailored ? (
    <ReviewPanel
      tailoring={tailoring}
      sections={sections}
      staleIds={review.staleIds}
      leftOutIds={review.leftOutIds}
      activeId={activeId}
      onSelect={selectSuggestion}
      onInclude={includeSuggestion}
      onDismiss={review.dismiss}
      onAddSection={addMissingSection}
      onRerun={() => void review.rerun()}
      rerunning={review.rerunning}
      jobRemoved={tailoring ? tailoring.job_board_entry_id === null : curriculum.job_board_entry_id === null}
      jobHasUrl={review.jobHasUrl}
      company={curriculum.tailored_for}
      error={review.error}
    />
  ) : undefined;

  const suggestions = tailored
    ? {
        suggestionsBySection: review.suggestionsBySection,
        activeSuggestionId: activeId,
        onSuggestionClick: review.setActiveId,
        onSuggestionClose: review.close,
        onSuggestionResolve: review.resolve,
      }
    : {};

  const page = {
    sections,
    versions,
    onSectionChange: change,
    editors,
    header: header.resolved,
  };
  const designPanel = {
    design: look.design,
    paper: look.paper,
    onDesignChange: look.changeDesign,
    onPaperChange: look.changePaper,
    designName,
    onDesignNameChange: setDesignName,
  };

  const emptyHint = sections.every(isLeftOut) && (
    <p className="text-center text-sm text-muted-foreground">
      Nothing is in this CV yet. Tick what to include, or{" "}
      <NextLink href="/resume/sections" className="underline">
        write in your library
      </NextLink>
      .
    </p>
  );

  const addButton = (className?: string) => (
    <AddSheetButton onClick={addPlainSection} disabled={adding} className={className}>
      Add section
    </AddSheetButton>
  );

  const changeView = (next: CvView) => {
    if (onPage ? leaveRef.current?.() !== false : mayLeaveCards()) setView(next);
  };

  return (
    <EditChannelContext value={channel}>
      <MonthDraftsContext value={monthDrafts}>
        <div className="flex min-h-0 flex-1 flex-col">
          <CvPageHeader
            curriculum={curriculum}
            onRename={saveTitle}
            onExport={() => void exportPdf()}
            exporting={exporting}
            view={view}
            onViewChange={changeView}
            design={!onPage && <DesignSheet {...designPanel} />}
            compact={onPage}
            focusTitle={justMade}
            purpose={
              (labels.length > 0 || curriculum.cv_label_id !== null) && (
                <PurposeSelect
                  labels={labels}
                  value={curriculum.cv_label_id}
                  onChange={(labelId) => void choosePurpose(labelId)}
                  disabled={changingPurpose || resetTo !== null}
                />
              )
            }
          />
          <ConfirmationModal
            isOpen={resetTo !== null}
            onClose={() => setResetTo(null)}
            onConfirm={() => (resetTo ? choosePurpose(resetTo.labelId, true) : undefined)}
            title="Change the collection?"
            description={`Some ticks here were changed by hand. Changing the collection resets them to what is in ${resetTo?.name ?? "all content"}. Text doesn't change.`}
            confirmLabel="Change collection"
          />
          {onPage ? (
            <PageView
              {...page}
              {...suggestions}
              headerBinding={headerBinding}
              tools={tools}
              open={added}
              leaveRef={leaveRef}
              look={designPanel}
              checklist={checklistPanel}
              review={reviewPanel}
              notice={emptyHint}
            >
              {addButton("min-h-14 max-w-xs flex-row rounded-md border-[#9aa3ab] bg-transparent shadow-none")}
            </PageView>
          ) : (
            <CvWorkspace
              tab={tab}
              onTabChange={setTab}
              checklist={checklistPanel}
              review={reviewPanel}
              page={roomForPage ? null : <PagePreview {...page} design={look.design} paper={look.paper} />}
            >
              <CvCards
                header={header}
                sections={sections}
                versions={versions}
                onChange={change}
                onRemove={actions.removeSection}
                describeDeletion={describeDeletion}
                twoColumn={twoColumn}
                leaveOutLocked={changingPurpose}
                {...suggestions}
              />
              {emptyHint}
              {addButton()}
            </CvWorkspace>
          )}
        </div>
      </MonthDraftsContext>
    </EditChannelContext>
  );
};

const ResumePage = ({ params }: ResumePageProps) => {
  const { id } = use(params);
  // What a CV's page holds and is still doing is about that CV only.
  return <CvPage key={id} id={id} />;
};

export default ResumePage;
