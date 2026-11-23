"use client";

import apiClient from "@/api/apiClient";
import { getCurriculum } from "@/api/resources/curriculums/getCurriculum";
import { updateCurriculum } from "@/api/resources/curriculums/updateCurriculum";
import { getResumeProfile } from "@/api/resources/resumeProfile/getResumeProfile";
import Loader from "@/components/common/Loader";
import DesignPanel from "@/components/resume/DesignPanel";
import { resolveHeader } from "@/components/resume/resumeHeader";
import { ResumeTemplate } from "@/components/resume/templates/ResumeTemplate";
import { Button } from "@/components/ui/Button";
import { DESIGN_DEFAULTS, DesignSettings, pageMargin, resolveDesign, sheetPadding } from "@/lib/resume/design";
import { buildResumeDocument, isEmptyDocument, pdfFileName, ResumeDocument } from "@/lib/resume/exportDocument";
import { createSerialQueue } from "@/lib/serialQueue";
import { cn } from "@/lib/utils";
import { PaperSize, PaperSizes } from "@/lib/types";
import { ArrowLeftIcon, DownloadIcon, PaletteIcon } from "lucide-react";
import NextLink from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

// The on-screen sheet is at least one page tall, so a short resume still looks
// like a full sheet of paper. Printing drops the minimum (print:min-h-0!) so it
// can't spill onto a blank second page.
const SHEET_SIZE: Record<PaperSize, { width: string; minHeight: string }> = {
  a4: { width: "210mm", minHeight: "297mm" },
  letter: { width: "8.5in", minHeight: "11in" },
};
const PAPER_LABEL: Record<PaperSize, string> = { a4: "A4", letter: "Letter" };
const DESIGN_SAVE_DELAY_MS = 500;

interface PrintPageProps {
  params: Promise<{ id: string }>;
}

const PrintResumePage = ({ params }: PrintPageProps) => {
  const { id } = use(params);
  const [resume, setResume] = useState<ResumeDocument | null>(null);
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [design, setDesign] = useState<DesignSettings>(DESIGN_DEFAULTS);
  // Bumped on each design change; the sheet updates at once and the save follows.
  const [designEdits, setDesignEdits] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Style saves go out one at a time, so the last change sent is the last applied.
  const [saves] = useState(createSerialQueue);
  // The design change waiting for the debounce, sent early if the page goes away.
  const pendingDesign = useRef<DesignSettings | null>(null);
  // Design saves are numbered per page so the server skips one that arrives
  // after a newer one, such as a slow save overtaken by the save sent on leaving.
  const [styleWriter] = useState(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const styleSeq = useRef(0);
  // Numbered when the save is sent, before it waits in the queue.
  const designPayload = useCallback(
    (next: DesignSettings) => {
      styleSeq.current += 1;
      return { styles: next, styles_writer: styleWriter, styles_seq: styleSeq.current };
    },
    [styleWriter]
  );

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getCurriculum(id), getResumeProfile()])
      .then(([{ curriculum }, { profile }]) => {
        if (cancelled) return;
        setPaper(curriculum.styles.paper ?? "a4");
        setDesign(resolveDesign(curriculum.styles));
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

  useEffect(() => {
    const saveDesign = (next: DesignSettings) => {
      const payload = designPayload(next);
      return saves.run(() => updateCurriculum(Number(id), payload)).catch((error) => {
        console.error(error);
        toast.error("Couldn't save the design. Try again.");
      });
    };
    const flush = () => {
      const next = pendingDesign.current;
      pendingDesign.current = null;
      if (next) void saveDesign(next);
    };

    if (designEdits === 0) return;
    const timer = setTimeout(flush, DESIGN_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [designEdits, designPayload, id, saves]);

  // Leaving within the debounce: send the last change now. In-app navigation
  // keeps the page's JavaScript alive long enough for a normal request; a tab
  // close or reload gets a keepalive request instead.
  useEffect(() => {
    const sendWithKeepalive = () => {
      const next = pendingDesign.current;
      if (!next) return;
      pendingDesign.current = null;
      void fetch(`${apiClient.defaults.baseURL}/curriculums/${id}`, {
        method: "PUT",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(designPayload(next)),
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", sendWithKeepalive);

    return () => {
      window.removeEventListener("pagehide", sendWithKeepalive);
      const next = pendingDesign.current;
      pendingDesign.current = null;
      if (!next) return;
      const payload = designPayload(next);
      void saves.run(() => updateCurriculum(Number(id), payload)).catch(() => undefined);
    };
  }, [designPayload, id, saves]);

  const changeDesign = (next: DesignSettings) => {
    setDesign(next);
    pendingDesign.current = next;
    setDesignEdits((count) => count + 1);
  };

  const changePaper = async (next: PaperSize) => {
    const previous = paper;
    setPaper(next);
    try {
      await saves.run(() => updateCurriculum(Number(id), { styles: { paper: next } }));
    } catch (error) {
      console.error(error);
      setPaper(previous);
      toast.error("Couldn't change the paper size. Try again.");
    }
  };

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

      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <NextLink href={`/resume/${id}`}>
            <ArrowLeftIcon />
            Back to editor
          </NextLink>
        </Button>

        <div className="flex items-center gap-3">
          {!empty && (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={panelOpen}
              onClick={() => setPanelOpen((open) => !open)}
            >
              <PaletteIcon />
              Design
            </Button>
          )}
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
          <Button size="sm" onClick={() => void window.document.fonts.ready.then(() => window.print())} disabled={empty}>
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
        <div className="flex flex-col lg:flex-row print:block">
          <div className="min-w-0 flex-1 overflow-x-auto px-4 py-8 print:overflow-visible print:p-0">
            <div
              className="mx-auto bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.08)] print:w-auto! print:min-h-0! print:p-0! print:shadow-none"
              style={{ ...SHEET_SIZE[paper], padding: sheetPadding(design) }}
            >
              <ResumeTemplate document={resume} paper={paper} design={design} />
            </div>
          </div>
          {/* Hidden rather than unmounted, so reopening keeps the saved designs and any half-typed name. */}
          <aside
            aria-label="Design"
            hidden={!panelOpen}
            className="border-t border-border bg-background px-5 py-5 lg:sticky lg:top-[49px] lg:h-[calc(100vh-49px)] lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0 print:hidden"
          >
            <h2 className="mb-4 text-sm font-semibold">Design</h2>
            <DesignPanel design={design} onChange={changeDesign} />
          </aside>
        </div>
      )}
    </div>
  );
};

export default PrintResumePage;
