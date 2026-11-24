import apiClient from "@/api/apiClient";
import { CurriculumSection, EntryFields, SectionTemplate } from "@/lib/types";
import { isAxiosError } from "axios";

export type TransferDirection = "to_library" | "to_cv" | "keep";

/** An item's html or an entry's fields; null for a side that lacks it. */
export type TransferValue = string | Partial<EntryFields> | null;

export type TransferPayload = {
  direction: TransferDirection;
  entry_id: string;
  /** Without it, the entry's own fields. */
  item_id?: string;
  /** What each side has, as far as is known here. */
  expected_cv: TransferValue;
  expected_library: TransferValue;
};

type TransferRecords = {
  section: CurriculumSection;
  /** Null if it isn't in the library. */
  section_template: SectionTemplate | null;
};

/** `conflict`: refused, as a side has something else. These are the records as they are. */
export type TransferResult = TransferRecords & { conflict: boolean };

/** Passes text between a CV's section and its library section, or accepts that they differ. */
export const transferWithLibrary = async (
  curriculumId: number,
  sectionId: number,
  payload: TransferPayload
): Promise<TransferResult> => {
  try {
    const response = await apiClient.post<TransferRecords>(
      `/curriculums/${curriculumId}/sections/${sectionId}/transfer`,
      payload
    );
    return { conflict: false, ...response.data };
  } catch (error) {
    if (!isAxiosError<TransferRecords>(error) || error.response?.status !== 409 || !error.response.data.section) throw error;
    const { section, section_template } = error.response.data;
    return { conflict: true, section, section_template };
  }
};
