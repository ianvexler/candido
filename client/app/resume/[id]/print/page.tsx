"use client";

import { getCurriculum } from "@/api/resources/curriculums/getCurriculum";
import { getResumeProfile } from "@/api/resources/resumeProfile/getResumeProfile";
import Loader from "@/components/common/Loader";
import { resolveHeader } from "@/components/resume/resumeHeader";
import { ResumeTemplate } from "@/components/resume/templates/ResumeTemplate";
import { usePdfReady, usePrintOnce } from "@/components/resume/usePrintOnce";
import { Button } from "@/components/ui/Button";
import { pageMargin, sheetPadding } from "@/lib/resume/design";
import { buildResumeDocument, isEmptyDocument, pdfFileName, ResumeDocument } from "@/lib/resume/exportDocument";
import { lookOf } from "@/lib/resume/useCvDesign";
import { PaperSize } from "@/lib/types";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import NextLink from "next/link";
import { use, useEffect, useState, useSyncExternalStore } from "react";

// The on-screen sheet is at least one page tall, so a short resume still looks
// like a full sheet of paper. Printing drops the minimum (print:min-h-0!) so it
// can't spill onto a blank second page.
const SHEET_SIZE: Record<PaperSize, { width: string; minHeight: string }> = {
  a4: { width: "210mm", minHeight: "297mm" },
  letter: { width: "8.5in", minHeight: "11in" },
};

const noChanges = () => () => {};
/** Opened by the server's browser to make the PDF (?pdf=1): it doesn't print, and says when it is ready. */
const useMakingPdf = () =>
  useSyncExternalStore(noChanges, () => new URLSearchParams(window.location.search).has("pdf"), () => false);

/** 404 for a CV that isn't there or isn't theirs (the API says 403); anything else is the server's fault. */
const statusOf = (error: unknown): 404 | 500 => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 403 ? 404 : 500;
};

interface PrintPageProps {
  params: Promise<{ id: string }>;
}

const PrintResumePage = ({ params }: PrintPageProps) => {
  const { id } = use(params);
  const [resume, setResume] = useState<ResumeDocument | null>(null);
  const [{ design, paper }, setLook] = useState(() => lookOf({}));
  const [loadError, setLoadError] = useState<404 | 500 | null>(null);
  const makingPdf = useMakingPdf();

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getCurriculum(id), getResumeProfile()])
      .then(([{ curriculum }, { profile }]) => {
        if (cancelled) return;
        setLook(lookOf(curriculum.styles));
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
        if (!cancelled) setLoadError(statusOf(error));
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

  usePrintOnce(id, !makingPdf && resume !== null && !empty);
  usePdfReady(
    makingPdf,
    loadError
      ? { ready: "error", status: loadError }
      : !resume
        ? { ready: false }
        : empty
          ? { ready: "error", status: 422 }
          : { ready: true }
  );

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">This CV could not be loaded.</p>
        <NextLink href="/resume" className="text-sm underline">
          Back to your CVs
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
      {/* Print margins; the on-screen sheet uses the same padding so it matches the PDF. */}
      <style>{`@page { size: ${paper === "letter" ? "letter" : "A4"}; margin: ${pageMargin(design)}; }`}</style>

      {!makingPdf && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 print:hidden">
          <Button variant="ghost" size="sm" asChild>
            <NextLink href={`/resume/${id}`}>
              <ArrowLeftIcon />
              Back to editor
            </NextLink>
          </Button>

          <Button size="sm" onClick={() => window.print()} disabled={empty}>
            <PrinterIcon />
            Print again
          </Button>
        </div>
      )}

      {empty ? (
        <div className="flex flex-col items-center gap-2 px-4 py-24 text-center">
          <p className="font-medium">Nothing to export yet.</p>
          <p className="text-sm text-muted-foreground">Add sections or show hidden ones in the editor.</p>
          <NextLink href={`/resume/${id}`} className="mt-2 text-sm underline">
            Open the editor
          </NextLink>
        </div>
      ) : (
        <div className="overflow-x-auto px-4 py-8 print:overflow-visible print:p-0">
          <div
            className="mx-auto bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.08)] print:w-auto! print:min-h-0! print:p-0! print:shadow-none"
            style={{ ...SHEET_SIZE[paper], padding: sheetPadding(design) }}
          >
            <ResumeTemplate document={resume} paper={paper} design={design} />
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintResumePage;
