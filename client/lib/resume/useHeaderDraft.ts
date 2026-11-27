import { EMPTY_HEADER, resolveHeader } from "@/components/resume/resumeHeader";
import type { ResumeHeader, ResumeHeaderTextField, ResumeLink } from "@/lib/types";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { createHeaderDraft, HeaderValues } from "./headerDraft";
import { apiErrorMessage } from "./reviewPanel";

interface HeaderDraftOptions<T> {
  /** What to start with; `load` takes a later one. */
  value: T;
  /** For a CV: the profile, which blank fields and absent links fall back to. */
  fallback?: ResumeHeader;
  save: (values: T) => Promise<unknown>;
}

const showError = (error: unknown) => {
  console.error(error);
  toast.error(apiErrorMessage(error, "Couldn't save the header. Check your connection and try again."));
};

/**
 * A header as edited, and the only thing that saves it. The same object until
 * something changes. Unsaved changes are sent when the page is left.
 */
export const useHeaderDraft = <T extends HeaderValues>({ value, fallback, save }: HeaderDraftOptions<T>) => {
  const [draft, setDraft] = useState(value);
  const [owner] = useState(() => createHeaderDraft<T>({ value, save, onChange: setDraft, onError: showError }));
  useLayoutEffect(() => owner.saveWith(save), [owner, save]);
  useEffect(() => () => owner.dispose(), [owner]);
  // Closing or reloading doesn't wait for the pause.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void owner.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [owner]);

  return useMemo(() => {
    const shownLinks = (values: T) => values.links ?? fallback?.links ?? [];
    return {
      draft: draft as HeaderValues,
      fallback,
      /** As the CV shows it. */
      resolved: resolveHeader(fallback ?? EMPTY_HEADER, draft),
      /** The links as edited, blank ones too. */
      links: shownLinks(draft),
      isOverridden: (field: ResumeHeaderTextField | "links") =>
        fallback !== undefined && (field === "links" ? draft.links !== undefined : Boolean(draft[field]?.trim())),
      setText: (field: ResumeHeaderTextField, text: string) => owner.change((latest) => ({ ...latest, [field]: text })),
      /** Undefined for the profile's. */
      setLinks: (links: ResumeLink[] | undefined) =>
        owner.change((latest) => {
          const next = { ...latest, links };
          if (links === undefined) delete next.links;
          return next;
        }),
      editLink: (index: number, patch: Partial<ResumeLink>) =>
        owner.change((latest) => ({
          ...latest,
          links: shownLinks(latest).map((link, i) => (i === index ? { ...link, ...patch } : link)),
        })),
      flush: owner.flush,
      load: owner.load,
    };
  }, [draft, fallback, owner]);
};

export type HeaderDraft = Omit<ReturnType<typeof useHeaderDraft>, "load">;
