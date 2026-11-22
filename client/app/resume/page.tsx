"use client";

import { createCurriculum } from "@/api/resources/curriculums/createCurriculum";
import { deleteCurriculum } from "@/api/resources/curriculums/deleteCurriculum";
import { getCurriculums } from "@/api/resources/curriculums/getCurriculums";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import Description from "@/components/common/Description";
import Loader from "@/components/common/Loader";
import PageContainer from "@/components/common/PageContainer";
import Title from "@/components/common/Title";
import SectionPickerDialog, { SectionPickerResult } from "@/components/resume/SectionPickerDialog";
import { Button } from "@/components/ui/Button";
import { deleteDescription, splitCurriculums } from "@/lib/resume/curriculumGroups";
import { Curriculum } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { ChevronRightIcon, FileTextIcon, LayersIcon, PlusIcon, Trash2Icon } from "lucide-react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const ResumesPage = () => {
  const router = useRouter();
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Curriculum | null>(null);
  const [copiesOpen, setCopiesOpen] = useState(false);
  const { masters, copies } = splitCurriculums(curriculums);

  useEffect(() => {
    void getCurriculums()
      .then((response) => setCurriculums(response.curriculums))
      .catch((error) => {
        console.error(error);
        toast.error("Failed to load your resumes");
      })
      .finally(() => setLoading(false));
  }, []);

  const onCreate = async ({ name, sectionTemplateIds }: SectionPickerResult) => {
    try {
      const response = await createCurriculum({ title: name, section_template_ids: sectionTemplateIds });
      router.push(`/resume/${response.curriculum.id}`);
    } catch (error) {
      toast.error("Failed to create resume");
      throw error;
    }
  };

  const onDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteCurriculum(pendingDelete.id);
      setCurriculums((current) => current.filter((item) => item.id !== pendingDelete.id));
      toast.success("Resume deleted");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete resume");
    }
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Title>Your resumes</Title>
          <Description className="mt-1">
            Build a resume from sections in your library. Edits here stay with that resume.
          </Description>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <NextLink href="/resume/sections">
              <LayersIcon />
              Section library
            </NextLink>
          </Button>
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            New resume
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : masters.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <FileTextIcon className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">
            {copies.length > 0 ? "No master CVs yet" : "No resumes yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {copies.length > 0
              ? "Create one to reuse for applications."
              : "Write sections in your library, then pick the ones each resume needs."}
          </p>
          <Button className="mt-5" onClick={() => setCreating(true)}>
            <PlusIcon />
            New resume
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {masters.map((curriculum) => (
            <li key={curriculum.id} className="group relative">
              <NextLink
                href={`/resume/${curriculum.id}`}
                className="flex h-full flex-col rounded-lg border border-border bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-colors hover:border-foreground/30"
              >
                <span className="pr-8 font-semibold">{curriculum.title}</span>
                {curriculum.description && (
                  <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{curriculum.description}</span>
                )}
                <span className="mt-auto pt-6 text-xs text-muted-foreground">
                  {curriculum.section_count} {curriculum.section_count === 1 ? "section" : "sections"} · edited{" "}
                  {formatDistanceToNow(new Date(curriculum.updated_at), { addSuffix: true })}
                </span>
              </NextLink>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => setPendingDelete(curriculum)}
                aria-label={`Delete ${curriculum.title}`}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!loading && copies.length > 0 && (
        <div className="mt-10">
          <button
            type="button"
            onClick={() => setCopiesOpen((open) => !open)}
            aria-expanded={copiesOpen}
            aria-controls="tailored-copies"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronRightIcon className={`size-4 transition-transform ${copiesOpen ? "rotate-90" : ""}`} />
            Tailored for jobs ({copies.length})
          </button>
          {copiesOpen && (
            <ul id="tailored-copies" className="mt-3 divide-y divide-border rounded-lg border border-border bg-white">
              {copies.map((curriculum) => (
                <li key={curriculum.id} className="group relative">
                  <NextLink
                    href={`/resume/${curriculum.id}`}
                    className="flex flex-col gap-0.5 px-4 py-3 pr-12 hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="flex min-w-0 items-center gap-2 sm:flex-1">
                      <span className="truncate text-sm font-medium">{curriculum.title}</span>
                      {curriculum.cv_for_job && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          In use
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground sm:w-48 sm:shrink-0">
                      For {curriculum.tailored_for}
                    </span>
                    <span className="text-xs text-muted-foreground sm:w-36 sm:shrink-0 sm:text-right">
                      Edited {formatDistanceToNow(new Date(curriculum.updated_at), { addSuffix: true })}
                    </span>
                  </NextLink>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    onClick={() => setPendingDelete(curriculum)}
                    aria-label={`Delete ${curriculum.title}`}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <SectionPickerDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New resume"
        description="Name it, then tick the library sections to start from. You can add more later."
        confirmLabel="Create resume"
        nameLabel="Name"
        allowEmpty
        onConfirm={onCreate}
      />

      <ConfirmationModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={onDelete}
        title="Delete this resume?"
        description={deleteDescription(pendingDelete)}
        confirmLabel="Delete"
        variant="destructive"
      />
    </PageContainer>
  );
};

export default ResumesPage;
