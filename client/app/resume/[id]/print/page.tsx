"use client";

import { getCurriculum } from "@/api/resources/curriculums/getCurriculum";
import { updateCurriculum } from "@/api/resources/curriculums/updateCurriculum";
import { getResumeProfile } from "@/api/resources/resumeProfile/getResumeProfile";
import Loader from "@/components/common/Loader";
import { resolveHeader } from "@/components/resume/resumeHeader";
import { ClassicTemplate } from "@/components/resume/templates/ClassicTemplate";
import { Button } from "@/components/ui/Button";
import { buildResumeDocument, isEmptyDocument, pdfFileName, ResumeDocument } from "@/lib/resume/exportDocument";
import { cn } from "@/lib/utils";
import { PaperSize, PaperSizes } from "@/lib/types";
import { ArrowLeftIcon, DownloadIcon } from "lucide-react";
import NextLink from "next/link";
import { use, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

// Print margins; the on-screen sheet uses the same padding so it matches the PDF.
const PAGE_MARGIN = "16mm 18mm";
const SHEET_WIDTH: Record<PaperSize, string> = { a4: "210mm", letter: "8.5in" };
const PAPER_LABEL: Record<PaperSize, string> = { a4: "A4", letter: "Letter" };

interface PrintPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}

const PrintResumePage = ({ params, searchParams }: PrintPageProps) => {
  const { id } = use(params);
  const { print } = use(searchParams);
  const [resume, setResume] = useState<ResumeDocument | null>(null);
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [loadError, setLoadError] = useState(false);
  const printed = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getCurriculum(id), getResumeProfile()])
      .then(([{ curriculum }, { profile }]) => {
        if (cancelled) return;
        setPaper(curriculum.styles.paper ?? "a4");
        setResume(
          buildResumeDocument({
            title: curriculum.title,
            header: resolveHeader(profile, curriculum.header),
            sections: curriculum.sections ?? [],
          })
        );
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Browsers suggest the page title as the PDF's file name.
  useEffect(() => {
    if (!resume) return;
    const previous = window.document.title;
    window.document.title = pdfFileName(resume);
    return () => {
      window.document.title = previous;
    };
  }, [resume]);

  const empty = resume ? isEmptyDocument(resume) : true;

  // Opened with ?print=1 from the editor: print once fonts are ready.
  useEffect(() => {
    if (print !== "1" || !resume || empty || printed.current) return;
    printed.current = true;
    void window.document.fonts.ready.then(() => window.print());
  }, [print, resume, empty]);

  const changePaper = async (next: PaperSize) => {
    const previous = paper;
    setPaper(next);
    try {
      await updateCurriculum(Number(id), { styles: { paper: next } });
    } catch (error) {
      console.error(error);
      setPaper(previous);
      toast.error("Couldn't change the paper size. Try again.");
    }
  };

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">This resume could not be loaded.</p>
        <NextLink href="/resume" className="text-sm underline">
          Back to your resumes
        </NextLink>
      </div>
    );
  }

  if (!resume) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/60 print:bg-white">
      <style>{`@page { size: ${paper === "letter" ? "letter" : "A4"}; margin: ${PAGE_MARGIN}; }`}</style>

      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <NextLink href={`/resume/${id}`}>
            <ArrowLeftIcon />
            Back to editor
          </NextLink>
        </Button>

        <div className="flex items-center gap-3">
          <div role="group" aria-label="Paper size" className="flex rounded-md border border-border p-0.5">
            {PaperSizes.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={paper === size}
                onClick={() => void changePaper(size)}
                className={cn(
                  "rounded px-2.5 py-1 text-sm transition-colors",
                  paper === size ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {PAPER_LABEL[size]}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => window.print()} disabled={empty}>
            <DownloadIcon />
            Save as PDF
          </Button>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-2 px-4 py-24 text-center">
          <p className="font-medium">Nothing to export yet.</p>
          <p className="text-sm text-muted-foreground">Add sections or show hidden ones in the editor.</p>
          <NextLink href={`/resume/${id}`} className="mt-2 text-sm underline">
            Open the editor
          </NextLink>
        </div>
      ) : (
        <div className="px-4 py-8 print:p-0">
          <div
            className="mx-auto bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.08)] print:w-auto! print:p-0! print:shadow-none"
            style={{ width: SHEET_WIDTH[paper], padding: PAGE_MARGIN }}
          >
            <ClassicTemplate document={resume} paper={paper} />
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintResumePage;
