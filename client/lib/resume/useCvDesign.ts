import apiClient from "@/api/apiClient";
import { updateCurriculum } from "@/api/resources/curriculums/updateCurriculum";
import type { Curriculum } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createCvDesign, CvLook, LookPayload } from "./cvDesign";
import { resolveDesign } from "./design";

/** A CV's look, as stored. */
export const lookOf = (styles: Curriculum["styles"]): CvLook => ({
  design: resolveDesign(styles),
  paper: styles.paper ?? "a4",
});

const ERRORS = {
  design: "Couldn't save the design. Try again.",
  paper: "Couldn't change the paper size. Try again.",
};

// A tab being closed cancels normal requests.
const sendWithKeepalive = (curriculumId: number, payload: LookPayload) =>
  void fetch(`${apiClient.defaults.baseURL}/curriculums/${curriculumId}`, {
    method: "PUT",
    keepalive: true,
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);

/**
 * A CV's design and paper, and the only thing that saves them. The functions stay
 * the same. `load` gives what is stored. Unsaved changes are sent when the page is left.
 */
export const useCvDesign = (curriculumId: number) => {
  const [look, setLook] = useState(() => lookOf({}));
  const [owner] = useState(() =>
    createCvDesign({
      value: look,
      save: (payload) => updateCurriculum(curriculumId, payload),
      saveOnLeave: (payload) => sendWithKeepalive(curriculumId, payload),
      onChange: setLook,
      onError: (error, what) => {
        console.error(error);
        toast.error(ERRORS[what]);
      },
    })
  );

  useEffect(() => {
    window.addEventListener("pagehide", owner.leave);
    return () => {
      window.removeEventListener("pagehide", owner.leave);
      owner.dispose();
    };
  }, [owner]);

  const load = useCallback((styles: Curriculum["styles"]) => owner.load(lookOf(styles)), [owner]);

  return { ...look, changeDesign: owner.changeDesign, changePaper: owner.changePaper, flush: owner.flush, load };
};
