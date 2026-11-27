import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * Which job's panel is open, kept in the address (?job=12): refreshing keeps it open and the
 * browser's back button closes it. Uses the history API, so the page behind isn't reloaded.
 */
export const useOpenJob = () => {
  const pathname = usePathname();
  const value = useSearchParams().get("job");
  const jobId = value && /^\d+$/.test(value) ? Number(value) : null;
  // Opened from here, so closing can go back instead of leaving an extra history entry.
  const pushed = useRef(false);

  useEffect(() => {
    if (jobId === null) pushed.current = false;
  }, [jobId]);

  const openJob = useCallback(
    /** With replace, picking another job doesn't add a history entry for each one looked at. */
    (id: number, { replace = false }: { replace?: boolean } = {}) => {
      if (replace) {
        window.history.replaceState(null, "", `${pathname}?job=${id}`);
        return;
      }
      pushed.current = true;
      window.history.pushState(null, "", `${pathname}?job=${id}`);
    },
    [pathname]
  );

  const closeJob = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", pathname);
    }
  }, [pathname]);

  return { jobId, openJob, closeJob };
};
