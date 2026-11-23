"use client";

import { getCurriculum } from "@/api/resources/curriculums/getCurriculum";
import SectionPreview from "@/components/resume/SectionPreview";
import { buildResumeDocument } from "@/lib/resume/exportDocument";
import { Curriculum } from "@/lib/types";
import { useEffect, useState } from "react";

/** The text of the CV that would be sent, to read beside the posting. */
const JobCvPreview = ({ curriculumId, updatedAt }: { curriculumId: number; updatedAt: string }) => {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurriculum(String(curriculumId))
      .then((response) => {
        if (!cancelled) setCurriculum(response.curriculum);
      })
      // Only a preview: the CV can still be opened from its row.
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, [curriculumId, updatedAt]);

  if (curriculum?.id !== curriculumId || !curriculum.resolved_header) return null;

  return (
    <div className="rounded-sm bg-white px-6 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] sm:px-8">
      <SectionPreview
        document={buildResumeDocument({
          title: curriculum.title,
          header: curriculum.resolved_header,
          sections: curriculum.sections ?? [],
        })}
        emptyMessage="This CV has nothing in it yet."
      />
    </div>
  );
};

export default JobCvPreview;
