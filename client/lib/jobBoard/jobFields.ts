import { JobBoardEntry, JobStatus } from "@/lib/types";
import { format, parse, parseISO } from "date-fns";

/** A job's details as they're edited in a form. */
export type JobFieldValues = {
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  status: JobStatus;
  /** Editor HTML. */
  description: string;
  tags: string[];
  /** A date input's value, or "". */
  closingDate: string;
};

export const emptyJobFields = (): JobFieldValues => ({
  title: "",
  company: "",
  location: "",
  salary: "",
  url: "",
  status: JobStatus.PENDING,
  description: "",
  tags: [],
  closingDate: "",
});

/** A stored closing date as a date input's value. */
export const toDateInput = (date: Date | string | null | undefined): string =>
  date ? format(typeof date === "string" ? parseISO(date) : date, "yyyy-MM-dd") : "";

/** A date input's value as midnight in the user's time zone; null when empty. */
export const fromDateInput = (value: string): Date | null => (value ? parse(value, "yyyy-MM-dd", new Date()) : null);

export const jobFieldsOf = (entry: JobBoardEntry): JobFieldValues => ({
  title: entry.title,
  company: entry.company,
  location: entry.location ?? "",
  salary: entry.salary ?? "",
  url: entry.url ?? "",
  status: entry.status,
  description: entry.description ?? "",
  tags: entry.job_board_tags?.map((tag) => tag.name) ?? [],
  closingDate: toDateInput(entry.closing_date),
});

/** Tags are a set: their order doesn't count as a change. */
export const sameJobFields = (a: JobFieldValues, b: JobFieldValues): boolean => {
  const comparable = ({ tags, ...rest }: JobFieldValues) => JSON.stringify([rest, [...tags].sort()]);
  return comparable(a) === comparable(b);
};

/** The editor's HTML has something to read in it. */
export const hasText = (html: string): boolean => html.replace(/<[^>]*>|&nbsp;/g, "").trim() !== "";

/** Nothing has been entered. */
export const isBlankJob = (fields: JobFieldValues): boolean => {
  const { status, tags, description, ...text } = fields;
  return (
    status === JobStatus.PENDING &&
    tags.length === 0 &&
    !hasText(description) &&
    Object.values(text).every((value) => !value.trim())
  );
};

export const hasRequiredFields = ({ title, company }: JobFieldValues): boolean =>
  title.trim() !== "" && company.trim() !== "";

/** The end of a status column. */
export const nextNumberIn = (entries: Pick<JobBoardEntry, "status" | "number">[], status: JobStatus): number =>
  Math.max(0, ...entries.filter((entry) => entry.status === status).map((entry) => entry.number)) + 1;
