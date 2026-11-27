import { getCurriculum } from "@/api/resources/curriculums/getCurriculum";
import { updateCurriculum } from "@/api/resources/curriculums/updateCurriculum";
import { updateCurriculumSection } from "@/api/resources/curriculums/updateCurriculumSection";
import { getLatestCvTailoring } from "@/api/resources/cvTailorings/getLatestCvTailoring";
import { getResumeProfile } from "@/api/resources/resumeProfile/getResumeProfile";
import { Curriculum, CurriculumSection, ResumeHeader } from "@/lib/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { downloadPdf, pdfFailed } from "./downloadPdf";
import { flushAll } from "./flushAll";
import type { HeaderValues } from "./headerDraft";
import { trackSave, waitForSaves } from "./saveTracker";
import type { SectionPatch } from "./sectionDrafts";
import { useCvChecklist } from "./useCvChecklist";
import { useCvDesign } from "./useCvDesign";
import { useCvReview } from "./useCvReview";
import { useHeaderDraft } from "./useHeaderDraft";
import { useSectionDrafts } from "./useSectionDrafts";
import { useSectionLibrary } from "./useSectionLibrary";

const NO_HEADER: HeaderValues = {};

const saveSection = async (section: CurriculumSection, patch: SectionPatch) =>
  (await updateCurriculumSection(section.curriculum_id, section.id, patch)).section;

/**
 * A CV and what edits and saves it. However it is shown, these are the only
 * owners of its sections, header and design.
 */
export const useCv = (id: string) => {
  const curriculumId = Number(id);
  // Not its sections, header or styles as they are now: those are below.
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [profile, setProfile] = useState<ResumeHeader | null>(null);
  const [loadError, setLoadError] = useState(false);

  const drafts = useSectionDrafts<CurriculumSection>(saveSection);
  const { sections, load, flush } = drafts;
  const library = useSectionLibrary();
  const { refresh: refreshLibrary } = library;
  const checklist = useCvChecklist(curriculumId, drafts, library, curriculum?.cv_label_id ?? null);
  const review = useCvReview(curriculumId, sections, flush);
  const { setTailoring } = review;
  const header = useHeaderDraft<HeaderValues>({
    value: NO_HEADER,
    fallback: profile ?? undefined,
    save: (values) => updateCurriculum(curriculumId, { header: values }),
  });
  const { load: loadHeader, flush: flushHeader } = header;
  const look = useCvDesign(curriculumId);
  const { load: loadLook, flush: flushLook } = look;

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
        loadHeader(response.curriculum.header ?? NO_HEADER);
        loadLook(response.curriculum.styles);
        setTailoring(tailoringResponse.cv_tailoring);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id, load, loadHeader, loadLook, refreshLibrary, setTailoring]);

  const saveTitle = async (title: string) => {
    const response = await trackSave("title", updateCurriculum(curriculumId, { title }));
    setCurriculum(response.curriculum);
  };

  const [exporting, setExporting] = useState(false);
  // Saves first, so the PDF has the latest edits, then has the server make it.
  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await flushAll([flush, flushHeader, flushLook]);
      if (result === "saving") toast("Your latest changes are still saving, so the PDF may not include them.");
      if (result === "failed") {
        toast.error("Your latest changes couldn't be saved, so the PDF wasn't made. Try again.");
        return;
      }
      await downloadPdf(curriculumId);
    } catch (error) {
      console.error(error);
      pdfFailed(curriculumId);
    } finally {
      setExporting(false);
    }
  };

  return { curriculum, setCurriculum, profile, loadError, drafts, library, checklist, review, header, look, saveTitle, exportPdf, exporting };
};
