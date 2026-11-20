export type User = {
  id: number;
  email: string;
  name: string;
  sessions?: Session[];
  setup_completed: boolean;
  admin: boolean;
  last_login_at: Date;
  job_board_entries_count?: number;
}

export type Session = {
  token: string;
  expires_at: Date;
}

export enum JobStatus {
  PENDING = 'PENDING',
  APPLIED = 'APPLIED',
  ASSESSMENT = 'ASSESSMENT',
  INTERVIEW = 'INTERVIEW',
  OFFERED = 'OFFERED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  ARCHIVED = 'ARCHIVED',
}

export const jobStatusColors: Record<JobStatus, string> = {
  PENDING: "bg-slate-300",
  APPLIED: "bg-yellow-500",
  ASSESSMENT: "bg-cyan-500",
  INTERVIEW: "bg-indigo-500",
  OFFERED: "bg-emerald-500",
  REJECTED: "bg-red-400",
  ACCEPTED: "bg-green-600",
  ARCHIVED: "bg-black",
};

export type JobBoardEntry = {
  id: number;
  number: number;
  title: string;
  company: string;
  location: string;
  description: string;
  salary: string;
  url: string;
  status: JobStatus;
  created_at: Date;
  updated_at: Date;
  job_board_tags: JobBoardTag[];
  cv_text?: string;
  cv_key?: string;
  cv_filename?: string;
  cover_letter_text?: string;
  cover_letter_key?: string;
  cover_letter_filename?: string;
  closing_date?: Date;
}

export type JobBoardTag = {
  id: number;
  name: string;
}

export const JobEntryFileTypes = ["CV", "Cover Letter"] as const;
export type JobEntryFileType = (typeof JobEntryFileTypes)[number];

export enum FeedbackType {
  BUG = 'BUG',
  SUGGESTION = 'SUGGESTION',
  OTHER = 'OTHER',
}

export type FeedbackEntry = {
  id: number;
  user_id: number;
  user: User;
  created_at: Date;
  updated_at: Date;
  title: string;
  content: string;
  type: FeedbackType;
}

export type JobBoardEntriesStats = {
  counts: {
    total: number;
    pending: number;
    applied: number;
    assessment: number;
    interview: number;
    offered: number;
    accepted: number;
    rejected: number;
  };
  this_week: number;
  last_week: number;
  response_rate: number;
  top_tags: {
    name: string;
    count: number;
  }[];
};

export type Note = {
  id: number;
  user_id: number;
  user: User;
  created_at: Date;
  updated_at: Date;
  content: string;
}

export type SectionTemplate = {
  id: number;
  user_id: number;
  title: string;
  section_type: string;
  description: string | null;
  /** Editor HTML. Hidden text is wrapped in <span data-cv-hidden>. */
  content: string;
  styles: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/** Fields every resume section has, whether in the library or inside a CV. */
export type SectionFields = {
  title: string;
  section_type: string;
  description: string | null;
  /** Editor HTML. Hidden text is wrapped in <span data-cv-hidden>. */
  content: string;
}

export const CurriculumLayouts = ["single_column", "two_column"] as const;
export type CurriculumLayout = (typeof CurriculumLayouts)[number];

export type CurriculumSection = SectionFields & {
  id: number;
  curriculum_id: number;
  section_template_id: number | null;
  styles: Record<string, unknown>;
  position: number;
  hidden: boolean;
  synced_at: Date | null;
  /** The library section was edited after this copy was last synced. */
  library_updated: boolean;
  created_at: Date;
  updated_at: Date;
}

export type Curriculum = {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  layout: CurriculumLayout;
  styles: Record<string, unknown>;
  section_count: number;
  sections?: CurriculumSection[];
  created_at: Date;
  updated_at: Date;
}
