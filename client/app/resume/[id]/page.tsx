"use client";

import { addCurriculumSections } from "@/api/resources/curriculums/addCurriculumSections";
import { addEmptyCurriculumSection } from "@/api/resources/curriculums/addEmptyCurriculumSection";
import { getCurriculum } from "@/api/resources/curriculums/getCurriculum";
import { getLatestCvTailoring } from "@/api/resources/cvTailorings/getLatestCvTailoring";
import { rerunCvTailoring } from "@/api/resources/cvTailorings/rerunCvTailoring";
import { updateCvSuggestion } from "@/api/resources/cvTailorings/updateCvSuggestion";
import { getJobBoardEntry } from "@/api/resources/jobBoardEntries/getJobBoardEntry";
import { reorderCurriculumSections } from "@/api/resources/curriculums/reorderCurriculumSections";
import { updateCurriculum } from "@/api/resources/curriculums/updateCurriculum";
import { getResumeProfile } from "@/api/resources/resumeProfile/getResumeProfile";
import Loader from "@/components/common/Loader";
import AddSheetButton from "@/components/resume/AddSheetButton";
import CurriculumSectionCard from "@/components/resume/CurriculumSectionCard";
import DocumentWorkspace from "@/components/resume/DocumentWorkspace";
import HeaderDocument from "@/components/resume/HeaderDocument";
import ReviewPanel from "@/components/resume/review/ReviewPanel";
import type { SuggestionAction } from "@/components/resume/review/SuggestionCard";
import { resolveHeader } from "@/components/resume/resumeHeader";
import SectionPickerDialog, { SectionPickerResult } from "@/components/resume/SectionPickerDialog";
import SectionPreview from "@/components/resume/SectionPreview";
import { resolveDesign } from "@/lib/resume/design";
import { buildResumeDocument } from "@/lib/resume/exportDocument";
import { trackSave, waitForSaves } from "@/lib/resume/saveTracker";
import { apiErrorMessage, isConflict, statusForAction } from "@/lib/resume/reviewPanel";
import { isTailoringActive } from "@/lib/resume/suggestions";
import { pollUntil, PollTimeoutError } from "@/lib/poll";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import InlineInput from "@/components/ui/InlineInput";
import { Curriculum, CurriculumSection, CvSuggestion, CvTailoring, MissingSection, ResumeHeader } from "@/lib/types";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { ArrowLeftIcon, DownloadIcon, LayersIcon } from "lucide-react";
import NextLink from "next/link";
import { ComponentProps, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

const NO_SUGGESTIONS: CvSuggestion[] = [];

type DragEndEvent = Parameters<NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>>[0];

interface ResumePageProps {
  params: Promise<{ id: string }>;
}

const ResumePage = ({ params }: ResumePageProps) => {
  const { id } = use(params);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [profile, setProfile] = useState<ResumeHeader | null>(null);
  const [sections, setSections] = useState<CurriculumSection[]>([]);
  const [title, setTitle] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // The latest tailoring review, if this resume is a tailored copy.
  const [tailoring, setTailoring] = useState<CvTailoring | null>(null);
  const [activeSuggestionId, setActiveSuggestionId] = useState<number | null>(null);
  // Stale suggestion ids, as each section last reported them.
  const [staleBySection, setStaleBySection] = useState<Record<number, number[]>>({});
  const [rerunning, setRerunning] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [jobHasUrl, setJobHasUrl] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // A missing or failed review shouldn't stop the resume from opening.
    const latestTailoring = getLatestCvTailoring(Number(id)).catch((error) => {
      console.error(error);
      return { cv_tailoring: null };
    });

    void Promise.all([getCurriculum(id), getResumeProfile(), latestTailoring])
      .then(([response, profileResponse, tailoringResponse]) => {
        if (cancelled) return;
        setProfile(profileResponse.profile);
        setCurriculum(response.curriculum);
        setSections(response.curriculum.sections ?? []);
        setTitle(response.curriculum.title);
        setTailoring(tailoringResponse.cv_tailoring);
        setActiveSuggestionId(null);
        setStaleBySection({});
        setReviewError(null);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Polls while a review runs; stops on unmount or when the resume changes.
  // The server always ends a run (it expires one that stops working), so the
  // timeout only needs to outlast the longest review: 8 minutes before the
  // last request starts, plus that request and its retry.
  const tailoringActive = isTailoringActive(tailoring);
  const tailoringId = tailoring?.id;
  useEffect(() => {
    if (!tailoringActive) return;
    const controller = new AbortController();

    pollUntil(() => getLatestCvTailoring(Number(id)), (r) => !isTailoringActive(r.cv_tailoring), {
      intervalMs: 3000,
      timeoutMs: 20 * 60_000,
      signal: controller.signal,
    })
      .then((r) => setTailoring(r.cv_tailoring))
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setReviewError(
          error instanceof PollTimeoutError
            ? "This is taking longer than usual. Reload the page to check again."
            : "Couldn't check on the review. Reload the page to try again."
        );
      });

    return () => controller.abort();
  }, [id, tailoringActive, tailoringId]);

  // Only worth saying the posting wasn't read when the job has a URL.
  const postingJobId = tailoring && !tailoring.used_posting ? tailoring.job_board_entry_id : null;
  useEffect(() => {
    if (postingJobId === null) return;
    let cancelled = false;
    void getJobBoardEntry(String(postingJobId))
      .then((response) => {
        if (!cancelled) setJobHasUrl(Boolean(response.job_board_entry.url?.trim()));
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, [postingJobId]);

  const suggestionsBySection = useMemo(() => {
    const map = new Map<number, CvSuggestion[]>();
    if (tailoring?.status !== "succeeded") return map;
    for (const s of tailoring.suggestions) {
      map.set(s.curriculum_section_id, [...(map.get(s.curriculum_section_id) ?? []), s]);
    }
    return map;
  }, [tailoring]);

  const staleIds = useMemo(() => new Set(Object.values(staleBySection).flat()), [staleBySection]);

  // One stable handler per section, so SectionDocument's effect doesn't rerun each render.
  const staleHandlers = useRef(new Map<number, (ids: number[]) => void>());
  const staleHandler = useCallback((sectionId: number) => {
    let handler = staleHandlers.current.get(sectionId);
    if (!handler) {
      handler = (ids) => setStaleBySection((current) => ({ ...current, [sectionId]: ids }));
      staleHandlers.current.set(sectionId, handler);
    }
    return handler;
  }, []);

  const replaceSuggestion = useCallback(
    (next: CvSuggestion) =>
      setTailoring((current) =>
        current && {
          ...current,
          suggestions: current.suggestions.map((s) => (s.id === next.id ? next : s)),
        }
      ),
    []
  );

  // The suggestion or review changed elsewhere (e.g. a re-run in another
  // tab): show the latest review instead of the one on screen.
  const refreshTailoring = useCallback(async () => {
    try {
      setActiveSuggestionId(null);
      setStaleBySection({});
      setTailoring((await getLatestCvTailoring(Number(id))).cv_tailoring);
    } catch (error) {
      console.error(error);
    }
  }, [id]);

  // Records the decision; SectionDocument changes the text once this resolves
  // and toasts a failure itself, so errors are rethrown, not shown here.
  const onSuggestionResolve = useCallback(
    async (s: CvSuggestion, action: SuggestionAction, text?: string) => {
      const status = statusForAction(action);
      try {
        const { suggestion } = await updateCvSuggestion(
          s.id,
          status === "edited" ? { status, replacement: text ?? "" } : { status }
        );
        replaceSuggestion(suggestion);
      } catch (error) {
        if (isConflict(error)) void refreshTailoring();
        throw error;
      }
    },
    [replaceSuggestion, refreshTailoring]
  );

  const onSuggestionClose = useCallback(() => setActiveSuggestionId(null), []);

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">This resume could not be loaded.</p>
        <NextLink href="/resume" className="text-sm underline">
          Back to your resumes
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

  const saveTitle = async () => {
    const next = title.trim();
    if (!next) {
      setTitle(curriculum.title);
      return;
    }
    if (next === curriculum.title) return;

    try {
      const response = await trackSave("title", updateCurriculum(curriculum.id, { title: next }));
      setCurriculum(response.curriculum);
      setTitle(response.curriculum.title);
    } catch (error) {
      console.error(error);
      toast.error("Failed to rename resume");
    }
  };

  // Open the tab right away (popup blockers allow it during the click), then
  // point it at the print view once pending autosaves have reached the server.
  const exportPdf = async () => {
    const tab = window.open("", "_blank");
    const saved = await waitForSaves();
    if (!saved) {
      toast("Your latest changes are still saving, so the PDF may not include them.");
    }
    // The export view prints only when asked, so the design can be adjusted first.
    const url = `/resume/${curriculum.id}/print`;
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  };

  const tailored = tailoring !== null || curriculum.job_board_entry_id !== null;

  // Opens the suggestion's card and brings its text (or its section) into view.
  const selectSuggestion = (suggestionId: number) => {
    setActiveSuggestionId(suggestionId);
    const s = tailoring?.suggestions.find((item) => item.id === suggestionId);
    const target =
      document.querySelector(`[data-suggestion-id="${suggestionId}"]`) ??
      (s ? document.querySelector(`[data-section-id="${s.curriculum_section_id}"]`) : null);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const dismissSuggestion = async (s: CvSuggestion) => {
    try {
      const { suggestion } = await updateCvSuggestion(s.id, { status: "rejected" });
      replaceSuggestion(suggestion);
      if (activeSuggestionId === s.id) setActiveSuggestionId(null);
    } catch (error) {
      console.error(error);
      toast.error(apiErrorMessage(error, "Couldn't save that change"));
      if (isConflict(error)) void refreshTailoring();
    }
  };

  const rerunReview = async () => {
    setRerunning(true);
    setReviewError(null);
    try {
      // Let pending autosaves land first, so the review reads the latest text.
      await waitForSaves();
      const response = await rerunCvTailoring(curriculum.id);
      setActiveSuggestionId(null);
      setStaleBySection({});
      setTailoring(response.cv_tailoring);
    } catch (error) {
      console.error(error);
      setReviewError(apiErrorMessage(error, "Couldn't start the review. Try again."));
    } finally {
      setRerunning(false);
    }
  };

  const replaceSection = (next: CurriculumSection) =>
    setSections((current) => current.map((item) => (item.id === next.id ? next : item)));

  const onAddSections = async ({ sectionTemplateIds }: SectionPickerResult) => {
    try {
      const response = await addCurriculumSections(curriculum.id, sectionTemplateIds);
      setSections(response.curriculum.sections ?? []);
    } catch (error) {
      toast.error("Failed to add sections");
      throw error;
    }
  };

  // Appends only the new section, so unsaved edits in the others aren't replaced by the server's copy.
  const addMissingSection = async (sectionType: MissingSection) => {
    try {
      const response = await addEmptyCurriculumSection(curriculum.id, sectionType);
      // The endpoint appends, so the last one is the new section.
      const first = (response.curriculum.sections ?? []).at(-1);
      if (first) {
        setSections((current) => (current.some((section) => section.id === first.id) ? current : [...current, first]));
      }
      toast.success(`${sectionType} section added`);
      if (first) {
        requestAnimationFrame(() =>
          document.querySelector(`[data-section-id="${first.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })
        );
      }
    } catch (error) {
      console.error(error);
      toast.error(`Couldn't add the ${sectionType.toLowerCase()} section. Try again.`);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (event.canceled) return;

    const previous = sections;
    const next = move(previous, event);
    if (next.every((section, index) => section.id === previous[index].id)) return;

    setSections(next);
    void trackSave(
      "order",
      reorderCurriculumSections(
        curriculum.id,
        next.map((section) => section.id)
      )
    ).catch((error) => {
      console.error(error);
      toast.error("Failed to save the new order");
      setSections(previous);
    });
  };

  return (
    <DocumentWorkspace
      header={
        <>
          <div className="mb-2 flex items-center justify-between gap-4">
            <NextLink
              href="/resume"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" />
              Resumes
            </NextLink>
            <div className="flex items-center gap-4">
              <NextLink
                href="/resume/sections"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <LayersIcon className="size-4" />
                Section library
              </NextLink>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" onClick={() => void exportPdf()}>
                    <DownloadIcon />
                    Export PDF
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Opens a print view. Choose Save as PDF there.</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <InlineInput
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            aria-label="Resume name"
            className="border-0 py-0 text-4xl font-bold tracking-tight"
          />
          <p className="mt-1 text-base font-light text-muted-foreground">
            Changes here only affect this resume, not your library.
          </p>
        </>
      }
      review={
        tailored ? (
          <ReviewPanel
            tailoring={tailoring}
            sections={sections}
            staleIds={staleIds}
            activeId={activeSuggestionId}
            onSelect={selectSuggestion}
            onDismiss={dismissSuggestion}
            onAddSection={addMissingSection}
            onRerun={() => void rerunReview()}
            rerunning={rerunning}
            jobRemoved={tailoring ? tailoring.job_board_entry_id === null : curriculum.job_board_entry_id === null}
            jobHasUrl={jobHasUrl}
            company={curriculum.tailored_for}
            error={reviewError}
          />
        ) : undefined
      }
      preview={
        <SectionPreview
          document={buildResumeDocument({
            title: curriculum.title,
            header: resolveHeader(profile, curriculum.header),
            sections,
          })}
          emptyMessage="Add sections from your library. Hidden sections and hidden text are left out here."
        />
      }
    >
      <HeaderDocument
        value={curriculum.header ?? {}}
        fallback={profile}
        save={async (draft) => setCurriculum((await updateCurriculum(curriculum.id, { header: draft })).curriculum)}
      />

      <DragDropProvider onDragEnd={onDragEnd}>
        <div className="space-y-8">
          {sections.map((section, index) => (
            <CurriculumSectionCard
              key={section.id}
              curriculumId={curriculum.id}
              section={section}
              index={index}
              onChange={replaceSection}
              twoColumn={resolveDesign(curriculum.styles).template === "sidebar"}
              onRemoved={(sectionId) =>
                setSections((current) => current.filter((item) => item.id !== sectionId))
              }
              {...(tailored && {
                tailored: true,
                suggestions: suggestionsBySection.get(section.id) ?? NO_SUGGESTIONS,
                activeSuggestionId,
                onSuggestionClick: setActiveSuggestionId,
                onSuggestionClose,
                onSuggestionResolve,
                onStaleChange: staleHandler(section.id),
              })}
            />
          ))}
        </div>
      </DragDropProvider>

      <AddSheetButton onClick={() => setPickerOpen(true)}>Add from library</AddSheetButton>

      <SectionPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add from library"
        description="Ticked sections are copied to the end of this resume."
        confirmLabel="Add sections"
        onConfirm={onAddSections}
      />
    </DocumentWorkspace>
  );
};

export default ResumePage;
