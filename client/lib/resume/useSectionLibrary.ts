import { getSectionTemplates } from "@/api/resources/sectionTemplates/getSectionTemplates";
import { SectionTemplate } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

const NO_TEMPLATES: SectionTemplate[] = [];

/** The section library, kept up to date when the window is returned to. Load it first with `refresh`. */
export const useSectionLibrary = () => {
  const [templates, setTemplates] = useState<SectionTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const requests = useRef(0);
  const refreshing = useRef(false);
  // As `templates`, but newer than what is rendered.
  const latest = useRef(NO_TEMPLATES);
  const show = useCallback((next: SectionTemplate[]) => {
    latest.current = next;
    setTemplates(next);
  }, []);

  /** Never rejects. What was loaded before stays if this fails. */
  const refresh = useCallback(async () => {
    const request = ++requests.current;
    refreshing.current = true;
    try {
      const response = await getSectionTemplates();
      if (request !== requests.current) return;
      show(response.section_templates);
      setFailed(false);
    } catch (error) {
      console.error(error);
      if (request === requests.current) setFailed(true);
    } finally {
      if (request === requests.current) refreshing.current = false;
    }
  }, [show]);

  const current = useCallback(() => latest.current, []);

  /** Puts in a section just received, or takes out the one with this id if it's gone. */
  const take = useCallback(
    (id: number | null, template: SectionTemplate | null) => {
      const known = latest.current;
      if (!template) show(known.filter((other) => other.id !== id));
      else if (!known.some((other) => other.id === template.id)) show([...known, template]);
      else show(known.map((other) => (other.id === template.id ? template : other)));
      // What is on its way may be older than this.
      if (refreshing.current) void refresh();
    },
    [refresh, show]
  );

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return {
    templates: templates ?? NO_TEMPLATES,
    failed: failed && templates === null,
    loading: !failed && templates === null,
    refresh,
    current,
    take,
  };
};
