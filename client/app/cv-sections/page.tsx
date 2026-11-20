"use client";

import { createSectionTemplate } from "@/api/resources/sectionTemplates/createSectionTemplate";
import { getSectionTemplates } from "@/api/resources/sectionTemplates/getSectionTemplates";
import Description from "@/components/common/Description";
import Loader from "@/components/common/Loader";
import Title from "@/components/common/Title";
import SectionDocument from "@/components/cvSections/SectionDocument";
import SectionPreview from "@/components/cvSections/SectionPreview";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { SectionTemplate } from "@/lib/types";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const CvSectionsPage = () => {
  const [templates, setTemplates] = useState<SectionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void getSectionTemplates()
      .then((response) => {
        setTemplates(response.section_templates);
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to load your resume");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const onAddSection = async () => {
    setCreating(true);
    try {
      const response = await createSectionTemplate({
        title: "Untitled",
        section_type: "Section",
      });
      setTemplates((current) => [...current, response.section_template]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to add section");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="shrink-0 border-b border-border px-6 py-5">
        <Title>Your resume</Title>
        <Description className="mt-1">
          Write in the document. Highlight text, then hide or show it. The preview on the right drops hidden lines.
        </Description>
      </header>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div className="flex-1 min-h-0 overflow-y-auto bg-muted/50 px-4 py-8 sm:px-8">
          <div className="space-y-8 pb-16">
            {templates.map((template) => (
              <SectionDocument
                key={template.id}
                template={template}
                onChange={(next) =>
                  setTemplates((current) => current.map((item) => (item.id === next.id ? next : item)))
                }
                onDelete={(id) => setTemplates((current) => current.filter((item) => item.id !== id))}
              />
            ))}

            <button
              type="button"
              onClick={() => void onAddSection()}
              disabled={creating}
              className="mx-auto flex w-full max-w-2xl min-h-36 flex-col items-center justify-center gap-1 border border-dashed border-border bg-white/70 text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:bg-white hover:text-foreground disabled:opacity-50"
            >
              <PlusIcon className="size-5" />
              <span className="text-sm font-medium">Add</span>
            </button>
          </div>
        </div>

        <div className="flex h-12 md:h-auto w-full md:w-10 shrink-0 items-center justify-center border-t md:border-t-0 md:border-l border-border bg-background">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setPreviewOpen((open) => !open)}
                aria-label={previewOpen ? "Hide preview" : "Show preview"}
              >
                {previewOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {previewOpen ? "Hide preview" : "Show preview"}
            </TooltipContent>
          </Tooltip>
        </div>

        {previewOpen && (
          <aside className="flex h-80 md:h-auto w-full md:w-md shrink-0 flex-col border-t md:border-t-0 bg-background">
            <div className="border-b border-border px-5 py-3">
              <p className="text-sm font-medium">Preview</p>
              <p className="text-xs text-muted-foreground">Unstyled for now. Export styling comes later.</p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <SectionPreview templates={templates} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default CvSectionsPage;
