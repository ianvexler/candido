"use client";

import { createCurriculum } from "@/api/resources/curriculums/createCurriculum";
import { getCurriculums } from "@/api/resources/curriculums/getCurriculums";
import { getJobBoardEntries } from "@/api/resources/jobBoardEntries/getJobBoardEntries";
import ImportJobsModal from "@/components/common/ImportJobsModal";
import Loader from "@/components/common/Loader";
import PageContainer from "@/components/common/PageContainer";
import JobFormSheet from "@/components/jobBoard/JobFormSheet";
import ImportCvDialog from "@/components/resume/ImportCvDialog";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useJobsRefresh } from "@/contexts/JobsRefreshContext";
import { cvSlotState } from "@/lib/jobBoard/docSlot";
import { jobsToTailor } from "@/lib/jobBoard/tailorJobs";
import { useTailorForJob } from "@/lib/jobBoard/useTailorForJob";
import { splitCurriculums } from "@/lib/resume/curriculumGroups";
import { Curriculum, JobBoardEntry } from "@/lib/types";
import { useFinishSetup } from "@/lib/useSetup";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface StepProps {
  number: number;
  state: "done" | "current" | "todo";
  title: string;
  detail: string;
  children?: ReactNode;
}

const Step = ({ number, state, title, detail, children }: StepProps) => (
  <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-6" aria-current={state === "current" ? "step" : undefined}>
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
        state === "done" && "bg-emerald-100 text-emerald-800",
        state === "current" && "bg-candido text-candido-black",
        state === "todo" && "border border-border text-muted-foreground"
      )}
    >
      {state === "done" ? <CheckIcon className="size-4" role="img" aria-label="Done:" /> : number}
    </span>
    <div className="min-w-0 flex-1 basis-56">
      <h2 className={cn("text-base font-medium", state === "todo" && "text-muted-foreground")}>{title}</h2>
      <p className="text-sm break-words text-muted-foreground">{detail}</p>
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </li>
);

/** First run: a CV, a job, and how they fit. Each step ticks itself off from what the user already has. */
const WelcomePage = () => {
  const router = useRouter();
  const finishSetup = useFinishSetup();
  const { refreshTrigger } = useJobsRefresh();
  const { tailor, busyJobId } = useTailorForJob();
  const [cvs, setCvs] = useState<Curriculum[] | null>(null);
  const [jobs, setJobs] = useState<JobBoardEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [spreadsheet, setSpreadsheet] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([getCurriculums(), getJobBoardEntries()])
        .then(([curriculums, entries]) => {
          setCvs(splitCurriculums(curriculums.curriculums).masters);
          setJobs(entries.job_board_entries);
        })
        .catch((error) => {
          console.error(error);
          toast.error("Couldn't load your CVs and jobs.");
          setCvs((current) => current ?? []);
        }),
    []
  );

  useEffect(() => {
    void load();
    // Also after a spreadsheet import.
  }, [load, refreshTrigger]);

  if (cvs === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader size="lg" />
      </div>
    );
  }

  const cv: Curriculum | undefined = cvs[0];
  const job: JobBoardEntry | undefined = jobsToTailor(jobs)[0];
  const ready = Boolean(cv && job);

  const startFromScratch = async () => {
    setStarting(true);
    try {
      const { curriculum } = await createCurriculum({ title: "My CV", whole_library: true });
      router.push(`/resume/${curriculum.id}`);
    } catch (error) {
      console.error(error);
      toast.error("Couldn't create the CV. Try again.");
      setStarting(false);
    }
  };

  const seeFit = async () => {
    if (!cv || !job) return;
    // A job that already has a CV is opened as it is; nothing is replaced from here.
    if (cvSlotState(job) !== "empty") router.push(`/board/${job.id}`);
    else if (!(await tailor(cv.id, job.id))) return;
    void finishSetup();
  };

  const leaveTo = (href: string) => {
    void finishSetup();
    router.push(href);
  };

  return (
    <PageContainer className="max-w-3xl">
      <h1 className="text-4xl font-bold tracking-tight">Get your first application ready</h1>
      <p className="mt-3 text-base text-muted-foreground">Bring in your CV, add a job, and see how well they fit.</p>

      <ol className="mt-8 divide-y divide-border border-y border-border">
        <Step
          number={1}
          state={cv ? "done" : "current"}
          title="Bring in your CV"
          detail={
            cv
              ? `${cv.title}, ${cv.section_count} ${cv.section_count === 1 ? "section" : "sections"}`
              : "A PDF or Word file. We'll split it into sections you can edit."
          }
        >
          {cv ? (
            <Button variant="outline" onClick={() => router.push(`/resume/${cv.id}`)}>
              Open
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => void startFromScratch()} disabled={starting}>
                Start from scratch
              </Button>
              <Button variant="candido" onClick={() => setImporting(true)}>
                Import a CV
              </Button>
            </>
          )}
        </Step>

        <Step
          number={2}
          state={job ? "done" : cv ? "current" : "todo"}
          title="Add a job you want"
          detail={job ? `${job.title} at ${job.company}` : "Its title, company and description."}
        >
          {job ? (
            <Button variant="outline" onClick={() => router.push(`/board?job=${job.id}`)}>
              Open
            </Button>
          ) : (
            <Button variant={cv ? "candido" : "outline"} onClick={() => setAdding(true)}>
              Add a job
            </Button>
          )}
        </Step>

        <Step
          number={3}
          state={ready ? "current" : "todo"}
          title="See how you fit"
          detail={job ? `Prepare your application to ${job.company}.` : "Get edits made for that job."}
        >
          {ready && (
            <Button variant="candido" onClick={() => void seeFit()} disabled={busyJobId !== null}>
              {busyJobId !== null ? "Opening…" : "Prepare application"}
            </Button>
          )}
        </Step>
      </ol>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Jobs already in a spreadsheet?{" "}
          <button type="button" onClick={() => setSpreadsheet(true)} className="text-foreground underline underline-offset-4">
            Import them
          </button>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => leaveTo("/dashboard")}>
            Skip for now
          </Button>
          <Button variant="outline" onClick={() => leaveTo("/board")}>
            Go to my board
          </Button>
        </div>
      </div>

      <ImportCvDialog open={importing} onClose={() => setImporting(false)} onApplied={() => void load()} createCv />

      <Sheet open={adding} onOpenChange={(open) => !open && setAdding(false)}>
        {adding && (
          <JobFormSheet
            allEntries={jobs}
            onClose={() => setAdding(false)}
            onAddJob={(added) => setJobs((prev) => [...prev, added])}
          />
        )}
      </Sheet>

      <ImportJobsModal isOpen={spreadsheet} onClose={() => setSpreadsheet(false)} />
    </PageContainer>
  );
};

export default WelcomePage;
