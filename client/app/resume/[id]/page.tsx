"use client";

import { getCurriculum } from "@/api/resources/curriculums/getCurriculum";
import { getLatestCvTailoring } from "@/api/resources/cvTailorings/getLatestCvTailoring";
import { updateCurriculum } from "@/api/resources/curriculums/updateCurriculum";
import { updateCurriculumSection } from "@/api/resources/curriculums/updateCurriculumSection";
import { getResumeProfile } from "@/api/resources/resumeProfile/getResumeProfile";
import Loader from "@/components/common/Loader";
import AddSheetButton from "@/components/resume/AddSheetButton";
import CurriculumSectionCard from "@/components/resume/CurriculumSectionCard";
import CvChecklist from "@/components/resume/CvChecklist";
import CvPageHeader from "@/components/resume/CvPageHeader";
import CvWorkspace, { CvTab } from "@/components/resume/CvWorkspace";
import HeaderDocument from "@/components/resume/HeaderDocument";
import ReviewPanel from "@/components/resume/review/ReviewPanel";
import { buildChecklist, tickSuggestion } from "@/lib/resume/checklist";
import { resolveDesign } from "@/lib/resume/design";
import { isLeftOut, sectionColumn } from "@/lib/resume/exportDocument";
import { trackSave, waitForSaves } from "@/lib/resume/saveTracker";
import type { SectionPatch } from "@/lib/resume/sectionDrafts";
import { useCvChecklist } from "@/lib/resume/useCvChecklist";
import { useCvReview } from "@/lib/resume/useCvReview";
import { useSectionDrafts } from "@/lib/resume/useSectionDrafts";
import { useSectionLibrary } from "@/lib/resume/useSectionLibrary";
import { Curriculum, CurriculumSection, CvSuggestion, MissingSection, ResumeHeader } from "@/lib/types";
import NextLink from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

const NO_SUGGESTIONS: CvSuggestion[] = [];

interface ResumePageProps {
  params: Promise<{ id: string }>;
}

const saveSection = async (section: CurriculumSection, patch: SectionPatch) =>
  (await updateCurriculumSection(section.curriculum_id, section.id, patch)).section;

const CvPage = ({ id }: { id: string }) => {
  const curriculumId = Number(id);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [profile, setProfile] = useState<ResumeHeader | null>(null);
  const drafts = useSectionDrafts<CurriculumSection>(saveSection);
  const { sections, versions, load, change, flush } = drafts;
  const library = useSectionLibrary();
  const { refresh: refreshLibrary } = library;
  const { pending, actions, addSection } = useCvChecklist(curriculumId, drafts, library);
  const review = useCvReview(curriculumId, sections, flush);
  const { setTailoring } = review;
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<CvTab>("cv");

  useEffect(() => {
    let cancelled = false;

    // A missing or failed review shouldn't stop the resume from opening.
    const latestTailoring = getLatestCvTailoring(Number(id)).catch((error) => {
      console.error(error);
      return { cv_tailoring: null };
    });

    // A page just left may still be saving.
    const ready = waitForSaves();
    void ready.then(refreshLibrary);
    void ready
      .then(() => Promise.all([getCurriculum(id), getResumeProfile(), latestTailoring]))
      .then(([response, profileResponse, tailoringResponse]) => {
        if (cancelled) return;
        setProfile(profileResponse.profile);
        setCurriculum(response.curriculum);
        load(response.curriculum.sections ?? []);
        setTailoring(tailoringResponse.cv_tailoring);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id, load, refreshLibrary, setTailoring]);

  const createdAt = curriculum?.created_at;
  const checklist = useMemo(
    () => (createdAt === undefined ? [] : buildChecklist(sections, library.templates, createdAt)),
    [sections, library.templates, createdAt]
  );

  // The heading of a section just added, once it's on the page.
  const focusSection = useRef<number | null>(null);
  useEffect(() => {
    if (focusSection.current === null) return;
    const heading = document.querySelector<HTMLInputElement>(
      `[data-section-id="${focusSection.current}"] input[aria-label="Section heading"]`
    );
    if (!heading) return;
    focusSection.current = null;
    heading.focus();
    heading.select();
  });

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

  const saveTitle = async (title: string) => {
    const response = await trackSave("title", updateCurriculum(curriculum.id, { title }));
    setCurriculum(response.curriculum);
  };

  // Open the tab right away (popup blockers allow it during the click), then
  // point it at the print view once pending autosaves have reached the server.
  const exportPdf = async () => {
    const printTab = window.open("", "_blank");
    const flushed = flush();
    const saved = await waitForSaves();
    if (!saved || !(await flushed)) {
      toast("Your latest changes are still saving, so the PDF may not include them.");
    }
    // The export view prints only when asked, so the design can be adjusted first.
    const url = `/resume/${curriculum.id}/print`;
    if (printTab) printTab.location.href = url;
    else window.location.assign(url);
  };

  const { tailoring, activeId } = review;
  const tailored = tailoring !== null || curriculum.job_board_entry_id !== null;
  const twoColumn = resolveDesign(curriculum.styles).template === "sidebar";
  // As the export has it, so a section being written in stays while it's blank.
  const shown = sections.filter((section) => !isLeftOut(section));

  // Opens the suggestion's card and brings its text (or its section) into view.
  // One about left out text first offers to tick that, in the panel.
  const openSuggestion = (s: CvSuggestion) => {
    review.setActiveId(s.id);
    setTab("cv");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target =
          document.querySelector(`[data-suggestion-id="${s.id}"]`) ??
          document.querySelector(`[data-section-id="${s.curriculum_section_id}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      })
    );
  };

  const selectSuggestion = (s: CvSuggestion) => {
    if (review.leftOutIds.has(s.id)) review.setActiveId(s.id);
    else openSuggestion(s);
  };

  const includeSuggestion = (s: CvSuggestion) => {
    change(s.curriculum_section_id, (section) => tickSuggestion(section, s));
    openSuggestion(s);
  };

  const addNamedSection = async (name: string) => {
    setAdding(true);
    try {
      const section = await addSection(name);
      if (section) focusSection.current = section.id;
      setTab("cv");
      return true;
    } catch (error) {
      console.error(error);
      toast.error(`Couldn't add the ${name.toLowerCase()} section. Try again.`);
      return false;
    } finally {
      setAdding(false);
    }
  };

  const addMissingSection = async (name: MissingSection) => {
    if (await addNamedSection(name)) toast.success(`${name} section added`);
  };

  return (
    <CvWorkspace
      tab={tab}
      onTabChange={setTab}
      header={<CvPageHeader curriculum={curriculum} onRename={saveTitle} onExport={() => void exportPdf()} />}
      checklist={
        <CvChecklist
          sections={checklist}
          pending={pending}
          actions={actions}
          columns={twoColumn ? new Map(sections.map((section) => [section.id, sectionColumn(section)])) : null}
          libraryLoading={library.loading}
          libraryFailed={library.failed}
          onRetryLibrary={refreshLibrary}
        />
      }
      review={
        tailored ? (
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
        ) : undefined
      }
    >
      <HeaderDocument
        value={curriculum.header ?? {}}
        fallback={profile}
        save={async (draft) => setCurriculum((await updateCurriculum(curriculum.id, { header: draft })).curriculum)}
      />

      {shown.map((section) => (
        <CurriculumSectionCard
          key={section.id}
          section={section}
          versions={versions[section.id]}
          onChange={change}
          onRemove={actions.removeSection}
          twoColumn={twoColumn}
          {...(tailored && {
            suggestions: review.suggestionsBySection.get(section.id) ?? NO_SUGGESTIONS,
            activeSuggestionId: activeId,
            onSuggestionClick: review.setActiveId,
            onSuggestionClose: review.close,
            onSuggestionResolve: review.resolve,
          })}
        />
      ))}

      {shown.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Nothing is in this CV yet. Tick what to include, or{" "}
          <NextLink href="/resume/sections" className="underline">
            write in your library
          </NextLink>
          .
        </p>
      )}

      <AddSheetButton onClick={() => void addNamedSection("Section")} disabled={adding}>
        Add section
      </AddSheetButton>
    </CvWorkspace>
  );
};

const ResumePage = ({ params }: ResumePageProps) => {
  const { id } = use(params);
  // What a CV's page holds and is still doing is about that CV only.
  return <CvPage key={id} id={id} />;
};

export default ResumePage;
