import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createDrafts, EntryVersions, SectionDraft, SectionPatch } from "./sectionDrafts";

const showError = (error: unknown) => {
  console.error(error);
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  toast.error(message ?? "Couldn't save this section. Check your connection and try again.");
};

// The same in every page, so it's only watched once.
let composing = false;
if (typeof window !== "undefined") {
  window.addEventListener("compositionstart", () => (composing = true), true);
  window.addEventListener("compositionend", () => (composing = false), true);
}

/**
 * A page's sections: what is on screen, and the only thing that saves them. The
 * functions stay the same. `save` is the one given first, so it must go by its
 * arguments alone. Unsaved changes are sent when the page is left.
 */
export const useSectionDrafts = <T extends SectionDraft & { id: number }>(
  save: (section: T, patch: SectionPatch) => Promise<T>
) => {
  const [state, setState] = useState<{ sections: T[]; versions: Record<number, EntryVersions> }>({
    sections: [],
    versions: {},
  });
  const [drafts] = useState(() =>
    createDrafts<T>({
      save,
      onChange: (sections, versions) => setState({ sections, versions }),
      onError: showError,
      busy: () => composing,
    })
  );
  useEffect(() => () => drafts.dispose(), [drafts]);

  return { ...state, ...drafts };
};
