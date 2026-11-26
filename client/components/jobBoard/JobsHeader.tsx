"use client";

import { ReactNode, useState } from "react";
import { FileInputIcon, PlusIcon } from "lucide-react";
import Description from "@/components/common/Description";
import ImportJobsModal from "@/components/common/ImportJobsModal";
import Title from "@/components/common/Title";
import { Button } from "@/components/ui/Button";

interface JobsHeaderProps {
  title: string;
  description: string;
  onAddJob: () => void;
  /** The filters, shown under the title row. */
  children?: ReactNode;
}

/** The header shared by the board and the sheet: title, filters, Import and Add job. */
const JobsHeader = ({ title, description, onAddJob, children }: JobsHeaderProps) => {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="flex shrink-0 flex-col gap-4 min-w-0 px-1">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Title>{title}</Title>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileInputIcon />
            Import
          </Button>
          <Button onClick={onAddJob}>
            <PlusIcon />
            Add job
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between min-w-0">
        <Description className="-mt-3">{description}</Description>
        {children && <div className="flex w-full min-w-0 lg:w-auto">{children}</div>}
      </div>

      <ImportJobsModal isOpen={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
};

export default JobsHeader;
