export type User = {
  id: number;
  email: string;
  name: string;
  sessions?: Session[];
  setup_completed: boolean;
  admin: boolean;
  verified: boolean;
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
  cv_curriculum: { id: number; title: string; updated_at: string; fit: CvTailoringReport["fit"] | null } | null;
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

export type SectionTemplate = SectionFields & {
  id: number;
  user_id: number;
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
} & SectionDetails

/** Optional details for experience/education-style sections. */
export type SectionDetails = {
  /** Job title, degree, etc. */
  role: string | null;
  /** Employer, school, etc. */
  organization: string | null;
  location: string | null;
  /** "YYYY-MM-01"; month precision. */
  start_date: string | null;
  end_date: string | null;
  /** Ongoing; shown as "Present" and has no end date. */
  current: boolean;
}

export type ResumeLink = {
  label: string;
  url: string;
}

/** Name and contact details at the top of a resume. */
export type ResumeHeader = {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: ResumeLink[];
}

export const ResumeHeaderTextFields = ["name", "headline", "email", "phone", "location"] as const;
export type ResumeHeaderTextField = (typeof ResumeHeaderTextFields)[number];

/** Paper a resume is printed on. Missing means "a4". */
export const PaperSizes = ["a4", "letter"] as const;
export type PaperSize = (typeof PaperSizes)[number];

export const CurriculumLayouts = ["single_column", "two_column"] as const;
export type CurriculumLayout = (typeof CurriculumLayouts)[number];

/** A section's column in a two-column template. */
export type SectionPlacement = "main" | "sidebar";

export type CurriculumSection = SectionFields & {
  id: number;
  /** Chosen column in a two-column template; null places it by its type. */
  placement: SectionPlacement | null;
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
  styles: { paper?: PaperSize } & Record<string, unknown>;
  section_count: number;
  job_board_entry_id: number | null;
  source_curriculum_id: number | null;
  tailored_for: string | null;
  cv_for_job: { id: number; company: string } | null;
  /** Fields this resume overrides; anything missing comes from the profile. Full view only. */
  header?: Partial<ResumeHeader>;
  /** Profile with this resume's overrides applied. Full view only. */
  resolved_header?: ResumeHeader;
  sections?: CurriculumSection[];
  created_at: Date;
  updated_at: Date;
}

/** A saved resume look. Applying it copies these settings into a resume. */
export type ResumeDesign = {
  id: number;
  name: string;
  settings: Partial<import("@/lib/resume/design").DesignSettings>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const CvImportStatuses = ["pending", "processing", "succeeded", "failed"] as const;
export type CvImportStatus = (typeof CvImportStatuses)[number];

/** A section found in an uploaded CV, ready to add to the library. */
export type CvImportSection = SectionFields;

export type CvImport = {
  id: number;
  status: CvImportStatus;
  filename: string;
  error_message: string | null;
  result: { header: ResumeHeader; sections: CvImportSection[] } | null;
  applied_at: string | null;
  created_at: string;
}

export const CvTailoringStatuses = ["pending", "processing", "succeeded", "failed"] as const;
export type CvTailoringStatus = (typeof CvTailoringStatuses)[number];

export const CvSuggestionStatuses = ["pending", "accepted", "edited", "rejected", "superseded"] as const;
export type CvSuggestionStatus = (typeof CvSuggestionStatuses)[number];

/** One suggested change to a resume section: a rewrite of a quoted passage, or a note about it. */
export type CvSuggestion = {
  id: number;
  curriculum_section_id: number;
  kind: "rewrite" | "note";
  field: "content" | "description" | null;
  quote: string;
  replacement: string | null;
  reason: string;
  status: CvSuggestionStatus;
  position: number | null;
}

export type MissingSection = "Experience" | "Education" | "Skills";

export type CvTailoringReport = {
  fit: "strong" | "partial" | "weak";
  summary: string;
  requirements: { text: string; covered: "yes" | "partly" | "no" }[];
  gaps: string[];
  /** Essential sections the CV has none of. Absent on reviews from before this was added. */
  missing_sections?: { section: MissingSection; reason: string }[];
}

/** A review of one resume against one job. */
export type CvTailoring = {
  id: number;
  status: CvTailoringStatus;
  error_message: string | null;
  job_title: string;
  company: string;
  job_board_entry_id: number | null;
  used_posting: boolean;
  report: CvTailoringReport | null;
  created_at: string;
  suggestions: CvSuggestion[];
}
