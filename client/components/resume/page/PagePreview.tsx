"use client";

import { useState } from "react";
import FitMeter from "./FitMeter";
import PagedCv, { PagedCvProps } from "./PagedCv";
import type { PagePaging } from "./usePaging";

type PagePreviewProps = Pick<PagedCvProps, "sections" | "versions" | "onSectionChange" | "editors" | "header" | "design" | "paper">;

/** A CV's page on a small screen: only shown. */
const PagePreview = (page: PagePreviewProps) => {
  const [report, setReport] = useState<PagePaging | null>(null);
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 justify-center border-b border-border bg-background px-4 py-0.5">
        <FitMeter report={report} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#e4e7ea] p-4 [scrollbar-gutter:stable] sm:p-8">
        <PagedCv {...page} zoom="fit" onPaging={setReport} readOnly />
      </div>
    </div>
  );
};

export default PagePreview;
