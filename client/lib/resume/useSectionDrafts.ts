import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiErrorMessage } from "./reviewPanel";
import { createDrafts, EntryVersions, SectionDraft, SectionPatch } from "./sectionDrafts";

const showError = (error: unknown) => {
  console.error(error);
  toast.error(apiErrorMessage(error, "Couldn't save this section. Check your connection and try again."));
};

// What text is being composed in. It may go away or lose focus without ending that.
let composingIn: Node | null = null;
if (typeof window !== "undefined") {
  const stop = () => (composingIn = null);
  window.addEventListener("compositionstart", (event) => (composingIn = event.target as Node), true);
  ["compositionend", "focusout", "blur"].forEach((name) => window.addEventListener(name, stop, true));
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
      busy: () => composingIn?.isConnected ?? false,
    })
  );
  useEffect(() => () => drafts.dispose(), [drafts]);
  // Closing or reloading doesn't wait for the pause: this comes first, and the request may still go out.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void drafts.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [drafts]);

  return { ...state, ...drafts };
};
