import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/Empty";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface PanelEmptyProps {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}

/** What a dashboard panel shows when it has nothing to list, filling the space the list would take. */
const PanelEmpty = ({ icon: Icon, title, children }: PanelEmptyProps) => (
  <Empty className="gap-0 border bg-muted/40 p-6 md:p-8">
    <EmptyHeader>
      <EmptyMedia variant="icon" className="rounded-full bg-candido/30 text-candido-black" aria-hidden>
        <Icon className="size-5" strokeWidth={1.75} />
      </EmptyMedia>
      <EmptyTitle className="text-base">{title}</EmptyTitle>
      <EmptyDescription className="max-w-[34ch]">{children}</EmptyDescription>
    </EmptyHeader>
  </Empty>
);

export default PanelEmpty;
