import { Curriculum } from "@/lib/types";

/** A per-job copy of a CV (as opposed to a master CV). */
export const isCopy = (c: Pick<Curriculum, "tailored_for">): boolean =>
  Boolean(c.tailored_for?.trim());

/** Splits master CVs from per-job copies, preserving order. */
export const splitCurriculums = (
  list: Curriculum[],
): { masters: Curriculum[]; copies: Curriculum[] } => {
  const masters: Curriculum[] = [];
  const copies: Curriculum[] = [];
  for (const c of list) (isCopy(c) ? copies : masters).push(c);
  return { masters, copies };
};

/** Confirmation text for deleting a CV; warns when a job uses it as its CV. */
export const deleteDescription = (c: Pick<Curriculum, "cv_for_job"> | null): string =>
  c?.cv_for_job
    ? `This is the CV for your ${c.cv_for_job.company} application; its CV slot will be empty.`
    : "Your library is not affected.";
