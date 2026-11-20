"use client";

import { addCurriculumSections } from "@/api/resources/curriculums/addCurriculumSections";
import { getCurriculum } from "@/api/resources/curriculums/getCurriculum";
import { reorderCurriculumSections } from "@/api/resources/curriculums/reorderCurriculumSections";
import { updateCurriculum } from "@/api/resources/curriculums/updateCurriculum";
import { getResumeProfile } from "@/api/resources/resumeProfile/getResumeProfile";
import Loader from "@/components/common/Loader";
import AddSheetButton from "@/components/resume/AddSheetButton";
import CurriculumSectionCard from "@/components/resume/CurriculumSectionCard";
import DocumentWorkspace from "@/components/resume/DocumentWorkspace";
import HeaderDocument from "@/components/resume/HeaderDocument";
import { resolveHeader } from "@/components/resume/resumeHeader";
import SectionPickerDialog, { SectionPickerResult } from "@/components/resume/SectionPickerDialog";
import SectionPreview from "@/components/resume/SectionPreview";
import { buildResumeDocument } from "@/lib/resume/exportDocument";
import { trackSave, waitForSaves } from "@/lib/resume/saveTracker";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import InlineInput from "@/components/ui/InlineInput";
import { Curriculum, CurriculumSection, ResumeHeader } from "@/lib/types";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { ArrowLeftIcon, DownloadIcon, LayersIcon } from "lucide-react";
import NextLink from "next/link";
import { ComponentProps, use, useEffect, useState } from "react";
import toast from "react-hot-toast";

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

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getCurriculum(id), getResumeProfile()])
      .then(([response, profileResponse]) => {
        if (cancelled) return;
        setProfile(profileResponse.profile);
        setCurriculum(response.curriculum);
        setSections(response.curriculum.sections ?? []);
        setTitle(response.curriculum.title);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

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
    const url = `/resume/${curriculum.id}/print?print=1`;
    if (tab) tab.location.href = url;
    else window.location.assign(url);
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
              onRemoved={(sectionId) =>
                setSections((current) => current.filter((item) => item.id !== sectionId))
              }
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
