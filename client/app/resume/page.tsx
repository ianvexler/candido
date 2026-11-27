"use client";

import { getCvLabels } from "@/api/resources/cvLabels/getCvLabels";
import { deleteCurriculum } from "@/api/resources/curriculums/deleteCurriculum";
import { getCurriculums } from "@/api/resources/curriculums/getCurriculums";
import FitBadge from "@/components/common/FitBadge";
import ImportCvDialog from "@/components/resume/ImportCvDialog";
import NewCvDialog, { createCvFor } from "@/components/resume/NewCvDialog";
import TailorToJob from "@/components/resume/TailorToJob";
import { useAuth } from "@/contexts/AuthContext";
import { copyReadiness } from "@/lib/jobBoard/tailorJobs";
import { capitalize } from "@/lib/utils";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import Description from "@/components/common/Description";
import Loader from "@/components/common/Loader";
import PageContainer from "@/components/common/PageContainer";
import Title from "@/components/common/Title";
import { Button } from "@/components/ui/Button";
import { deleteDescription, splitCurriculums } from "@/lib/resume/curriculumGroups";
import { Curriculum, CvLabel } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { FileUpIcon, LibraryBigIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface CopyRowProps {
  copy: Curriculum;
  reviewsAvailable: boolean;
  onDelete: () => void;
}

/** A copy made for a job. The one the job uses opens its application; an unused one opens as a CV. */
const CopyRow = ({ copy, reviewsAvailable, onDelete }: CopyRowProps) => {
  const job = copy.tailoring?.job;
  const ready = copy.cv_for_job ? copyReadiness(copy, reviewsAvailable) : null;
  const status = copy.cv_for_job ? ready?.label ?? (job ? capitalize(job.status.toLowerCase()) : null) : "Not in use";
  const source = copy.tailoring?.source_title;
  const about = job && source ? `${job.title}, from ${source}` : job?.title ?? (source ? `From ${source}` : "");

  return (
    <li className="group relative flex flex-wrap items-center gap-x-4 gap-y-1 py-3 pr-10">
      <div className="min-w-0 flex-1 basis-56">
        <NextLink
          href={copy.cv_for_job ? `/board/${copy.cv_for_job.id}` : `/resume/${copy.id}`}
          className="font-medium break-words after:absolute after:inset-0 hover:underline"
        >
          {job?.company ?? copy.tailored_for}
        </NextLink>
        <p className="truncate text-sm text-muted-foreground">{about || copy.title}</p>
      </div>
      {status && <span className="text-sm text-muted-foreground">{status}</span>}
      {copy.tailoring?.fit && <FitBadge fit={copy.tailoring.fit} />}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-0 -translate-y-1/2 text-muted-foreground"
        onClick={onDelete}
        aria-label={`Delete ${copy.title}`}
      >
        <Trash2Icon />
      </Button>
    </li>
  );
};

const ResumesPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Curriculum | null>(null);
  const [importing, setImporting] = useState(false);
  const [tailoringCv, setTailoringCv] = useState<Curriculum | null>(null);
  /** The purposes to pick from, while asking what a new CV is for. */
  const [choosing, setChoosing] = useState<CvLabel[] | null>(null);
  const { masters, copies } = splitCurriculums(curriculums);

  useEffect(() => {
    void getCurriculums()
      .then((response) => setCurriculums(response.curriculums))
      .catch((error) => {
        console.error(error);
        toast.error("Failed to load your CVs");
      })
      .finally(() => setLoading(false));
  }, []);

  /** Resolves false if it failed. */
  const create = async (labelId: number | null) => {
    try {
      router.push(await createCvFor(labelId));
      return true;
    } catch (error) {
      console.error(error);
      toast.error("Failed to create CV");
      return false;
    }
  };

  // Asks what it is for, unless there are no purposes to pick from.
  const onCreate = async () => {
    setCreating(true);
    try {
      const { cv_labels: labels } = await getCvLabels();
      if (labels.length > 0) {
        setChoosing(labels);
        setCreating(false);
      } else if (!(await create(null))) {
        setCreating(false);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to create CV");
      setCreating(false);
    }
  };

  const onDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteCurriculum(pendingDelete.id);
      setCurriculums((current) => current.filter((item) => item.id !== pendingDelete.id));
      toast.success("CV deleted");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete CV");
    }
  };

  const libraryLink = (
    <Button variant="ghost" asChild>
      <NextLink href="/resume/sections">
        <LibraryBigIcon />
        Library
      </NextLink>
    </Button>
  );

  return (
    <PageContainer>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Title>Your CVs</Title>
          <Description className="mt-1">Keep a CV or two, and tailor a copy for each job.</Description>
        </div>
        <div className="flex flex-wrap gap-2">
          {libraryLink}
          {!loading && masters.length > 0 && (
            <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <FileUpIcon />
              Import a CV
            </Button>
            <Button onClick={() => void onCreate()} disabled={creating}>
              <PlusIcon />
              New CV
            </Button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : masters.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <p className="text-base font-medium">Start with the CV you have</p>
          <p className="mt-1 text-sm text-muted-foreground">We&apos;ll read it into sections you can edit and tailor.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="candido" onClick={() => setImporting(true)}>
              <FileUpIcon />
              Import a CV
            </Button>
            <Button variant="outline" onClick={() => void onCreate()} disabled={creating}>
              New CV
            </Button>
          </div>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {masters.map((curriculum) => (
            <li
              key={curriculum.id}
              className="group relative flex flex-col rounded-lg border border-border bg-white p-5 transition-colors hover:border-foreground/30"
            >
              <NextLink
                href={`/resume/${curriculum.id}`}
                // The whole card opens the CV; its buttons sit above this.
                className="pr-8 font-semibold break-words after:absolute after:inset-0 after:rounded-lg"
              >
                {curriculum.title}
              </NextLink>
              {curriculum.description && (
                <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{curriculum.description}</span>
              )}
              <span className="mt-1 text-sm text-muted-foreground">
                {curriculum.section_count} {curriculum.section_count === 1 ? "section" : "sections"}, edited{" "}
                {formatDistanceToNow(new Date(curriculum.updated_at), { addSuffix: true })}
              </span>
              <div className="mt-auto pt-5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="relative"
                  onClick={() => setTailoringCv(curriculum)}
                  aria-label={`Tailor ${curriculum.title} to a job`}
                >
                  <SparklesIcon />
                  Tailor to a job
                </Button>
              </div>
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
        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Tailored for jobs</h2>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {copies.map((copy) => (
              <CopyRow
                key={copy.id}
                copy={copy}
                reviewsAvailable={user?.reviews_available ?? true}
                onDelete={() => setPendingDelete(copy)}
              />
            ))}
          </ul>
        </section>
      )}

      {choosing && <NewCvDialog labels={choosing} onPick={create} onClose={() => setChoosing(null)} />}

      {tailoringCv && <TailorToJob curriculum={tailoringCv} onClose={() => setTailoringCv(null)} />}

      <ImportCvDialog
        open={importing}
        onClose={() => setImporting(false)}
        createCv
        onApplied={({ curriculum_id }) => {
          if (curriculum_id) router.push(`/resume/${curriculum_id}`);
          else toast.success("Profile updated");
        }}
      />

      <ConfirmationModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={onDelete}
        title="Delete this CV?"
        description={deleteDescription(pendingDelete)}
        confirmLabel="Delete"
        variant="destructive"
      />
    </PageContainer>
  );
};

export default ResumesPage;
