import { JobBoardEntry } from "@/lib/types";
import { cvSlotState } from "./docSlot";

export type SheetCvAction = "download" | "upload" | "replace" | "open" | "replace-with-file";

export interface SheetCvMenuItem {
  action: SheetCvAction;
  label: string;
  /** Ask before acting, because the current CV would be lost or unlinked. */
  confirm?: { title: string; description: string; confirmLabel: string; destructive?: boolean };
}

export interface SheetCvMenu {
  /** Names what currently fills the slot, when it isn't a plain upload. */
  heading?: string;
  items: SheetCvMenuItem[];
}

/** The /sheet row's CV menu for whatever fills the job's one CV slot. */
export const sheetCvMenu = (
  entry: Pick<JobBoardEntry, "cv_curriculum" | "cv_key" | "cv_text">,
): SheetCvMenu => {
  switch (cvSlotState(entry)) {
    case "copy":
      return {
        heading: entry.cv_curriculum?.title || "CV copy",
        items: [
          { action: "open", label: "Open" },
          {
            action: "replace-with-file",
            label: "Replace with file…",
            confirm: {
              title: "Replace the CV copy with a file?",
              description: "The copy is deleted from your resumes, along with its review. Your original CV isn't changed.",
              confirmLabel: "Replace",
              destructive: true,
            },
          },
        ],
      };
    case "text":
      return {
        heading: "Pasted CV",
        items: [
          {
            action: "replace-with-file",
            label: "Replace with file…",
            confirm: {
              title: "Replace the pasted CV?",
              description: "The current text is deleted.",
              confirmLabel: "Replace",
              destructive: true,
            },
          },
        ],
      };
    case "file":
      return {
        items: [
          { action: "download", label: "Download" },
          { action: "replace", label: "Replace" },
        ],
      };
    default:
      return { items: [{ action: "upload", label: "Upload" }] };
  }
};
