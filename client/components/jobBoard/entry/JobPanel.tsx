import { ReactNode } from "react";

/** A titled block on the job page. */
const JobPanel = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-5">
    <div className="flex items-start justify-between gap-3">
      <h2 className="min-w-0 font-semibold break-words">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

export default JobPanel;
