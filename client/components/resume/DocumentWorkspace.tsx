"use client";

import { Button } from "@/components/ui/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { ReactNode, useState } from "react";

interface DocumentWorkspaceProps {
  header: ReactNode;
  /** The paper documents on the left. */
  children: ReactNode;
  preview: ReactNode;
  /** When given, the aside gets Review / Preview tabs, Review first. */
  review?: ReactNode;
}

/** Documents on the left, a collapsible unstyled preview (and review, if any) on the right. */
const DocumentWorkspace = ({ header, children, preview, review }: DocumentWorkspaceProps) => {
  const [previewOpen, setPreviewOpen] = useState(true);
  const hasReview = review !== undefined && review !== null;
  const toggleLabel = hasReview
    ? previewOpen ? "Hide panel" : "Show panel"
    : previewOpen ? "Hide preview" : "Show preview";

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="shrink-0 border-b border-border px-6 py-5">{header}</header>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div className="flex-1 min-h-0 overflow-y-auto bg-muted/50 px-4 py-8 sm:px-8">
          <div className="space-y-8 pb-16">{children}</div>
        </div>

        <div className="flex h-12 md:h-auto w-full md:w-10 shrink-0 items-center justify-center border-t md:border-t-0 md:border-l border-border bg-background">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setPreviewOpen((open) => !open)}
                aria-label={toggleLabel}
              >
                {previewOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{toggleLabel}</TooltipContent>
          </Tooltip>
        </div>

        {previewOpen && hasReview && (
          <aside className="flex h-96 md:h-auto w-full md:w-md min-w-0 shrink-0 flex-col border-t md:border-t-0 bg-background">
            <Tabs defaultValue="review" className="min-h-0 flex-1 gap-0">
              <div className="border-b border-border px-5 py-2.5">
                <TabsList>
                  <TabsTrigger value="review" className="px-3">Review</TabsTrigger>
                  <TabsTrigger value="preview" className="px-3">Preview</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="review" className="min-h-0 overflow-y-auto overflow-x-hidden">
                {review}
              </TabsContent>
              <TabsContent value="preview" className="min-h-0 overflow-y-auto px-6 py-6">
                {preview}
              </TabsContent>
            </Tabs>
          </aside>
        )}

        {previewOpen && !hasReview && (
          <aside className="flex h-80 md:h-auto w-full md:w-md shrink-0 flex-col border-t md:border-t-0 bg-background">
            <div className="border-b border-border px-5 py-3">
              <p className="text-sm font-medium">Preview</p>
              <p className="text-xs text-muted-foreground">What the CV contains, without styling</p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">{preview}</div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default DocumentWorkspace;
