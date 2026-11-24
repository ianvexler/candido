import { getSectionTemplates } from "@/api/resources/sectionTemplates/getSectionTemplates";
import { SectionTemplate } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

const NO_TEMPLATES: SectionTemplate[] = [];

/** The section library, kept up to date when the window is returned to. Load it first with `refresh`. */
export const useSectionLibrary = () => {
  const [templates, setTemplates] = useState<SectionTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const requests = useRef(0);

  /** Never rejects. What was loaded before stays if this fails. */
  const refresh = useCallback(async () => {
    const request = ++requests.current;
    try {
      const response = await getSectionTemplates();
      if (request !== requests.current) return;
      setTemplates(response.section_templates);
      setFailed(false);
    } catch (error) {
      console.error(error);
      if (request === requests.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return { templates: templates ?? NO_TEMPLATES, failed: failed && templates === null, refresh };
};
