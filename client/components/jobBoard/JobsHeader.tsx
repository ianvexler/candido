"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { FileInputIcon, PlusIcon, SquareKanbanIcon, Table2Icon } from "lucide-react";
import Description from "@/components/common/Description";
import ImportJobsModal from "@/components/common/ImportJobsModal";
import Title from "@/components/common/Title";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const views = [
  { href: "/board", label: "Board", icon: SquareKanbanIcon },
  { href: "/sheet", label: "Sheet", icon: Table2Icon },
];

interface JobsHeaderProps {
  description: string;
  onAddJob: () => void;
  /** The filters, shown under the title row. */
  children?: ReactNode;
}

/** The header shared by the board and the sheet: two views of the same jobs. */
const JobsHeader = ({ description, onAddJob, children }: JobsHeaderProps) => {
  const pathname = usePathname();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="flex shrink-0 flex-col gap-4 min-w-0 px-1">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          <Title>Jobs</Title>
          <div className="flex rounded-lg bg-muted p-0.5" role="tablist" aria-label="View">
            {views.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors",
                    active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

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
