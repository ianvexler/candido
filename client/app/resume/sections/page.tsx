"use client";

import { getResumeProfile } from "@/api/resources/resumeProfile/getResumeProfile";
import { updateResumeProfile } from "@/api/resources/resumeProfile/updateResumeProfile";
import { createSectionTemplate } from "@/api/resources/sectionTemplates/createSectionTemplate";
import { deleteSectionTemplate } from "@/api/resources/sectionTemplates/deleteSectionTemplate";
import { getSectionTemplates } from "@/api/resources/sectionTemplates/getSectionTemplates";
import { updateSectionTemplate } from "@/api/resources/sectionTemplates/updateSectionTemplate";
import Description from "@/components/common/Description";
import Loader from "@/components/common/Loader";
import Title from "@/components/common/Title";
import AddSheetButton from "@/components/resume/AddSheetButton";
import DocumentWorkspace from "@/components/resume/DocumentWorkspace";
import HeaderDocument from "@/components/resume/HeaderDocument";
import ImportCvDialog from "@/components/resume/ImportCvDialog";
import LibrarySection from "@/components/resume/LibrarySection";
import { Button } from "@/components/ui/Button";
import SectionPreview from "@/components/resume/SectionPreview";
import { buildResumeDocument } from "@/lib/resume/exportDocument";
import { waitForSaves } from "@/lib/resume/saveTracker";
import type { SectionPatch } from "@/lib/resume/sectionDrafts";
import { useSectionDrafts } from "@/lib/resume/useSectionDrafts";
import { ResumeHeader, SectionTemplate } from "@/lib/types";
import { ArrowLeftIcon, FileUpIcon } from "lucide-react";
import NextLink from "next/link";
import { memo, useCallback, useDeferredValue, useEffect, useState } from "react";
import toast from "react-hot-toast";

const saveTemplate = async (template: SectionTemplate, patch: SectionPatch) =>
  (await updateSectionTemplate(template.id, patch)).section_template;

/** Memoised, as it reads all of the library. */
const LibraryPreview = memo(({ profile, templates }: { profile: ResumeHeader; templates: SectionTemplate[] }) => (
  <SectionPreview document={buildResumeDocument({ title: "Library", header: profile, sections: templates })} />
));
LibraryPreview.displayName = "LibraryPreview";

const SectionLibraryPage = () => {
  const { sections: templates, versions, load, add, change, remove } = useSectionDrafts<SectionTemplate>(saveTemplate);
  // The preview may follow a little later than typing.
  const previewed = useDeferredValue(templates);
  const [profile, setProfile] = useState<ResumeHeader | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // The header editor is uncontrolled; bump this to reload it after an import fills the profile.
  const [headerVersion, setHeaderVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // A page just left may still be saving.
    void waitForSaves()
      .then(() => Promise.all([getSectionTemplates(), getResumeProfile()]))
      .then(([templatesResponse, profileResponse]) => {
        if (cancelled) return;
        load(templatesResponse.section_templates);
        setProfile(profileResponse.profile);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Failed to load your section library");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [load]);

  const onAddSection = async () => {
    setCreating(true);
    try {
      const response = await createSectionTemplate({ section_type: "Section" });
      add([response.section_template]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to add section");
    } finally {
      setCreating(false);
    }
  };

  const removeTemplate = useCallback(
    async (id: number) => {
      try {
        await remove(id, deleteSectionTemplate(id));
        toast.success("Section deleted");
      } catch (error) {
        console.error(error);
        toast.error("Failed to delete section");
      }
    },
    [remove]
  );

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  return (
    <DocumentWorkspace
      header={
        <>
          <NextLink
            href="/resume"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            CVs
          </NextLink>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Title>Section library</Title>
              <Description className="mt-1">
                Write each section once, then reuse it in any CV.
              </Description>
            </div>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUpIcon />
              Import from CV
            </Button>
          </div>
          <ImportCvDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onApplied={({ section_templates, profile: nextProfile }) => {
              add(section_templates);
              setProfile(nextProfile);
              setHeaderVersion((version) => version + 1);
              const count = section_templates.length;
              toast.success(count > 0 ? `Added ${count} ${count === 1 ? "section" : "sections"} from your CV` : "Profile updated");
            }}
          />
        </>
      }
      preview={
        <LibraryPreview profile={profile} templates={previewed} />
      }
    >
      <HeaderDocument
        key={headerVersion}
        value={profile}
        save={async (draft) => setProfile((await updateResumeProfile(draft)).profile)}
      />

      {templates.map((template) => (
        <LibrarySection
          key={template.id}
          template={template}
          versions={versions[template.id]}
          onChange={change}
          onDelete={removeTemplate}
        />
      ))}

      <AddSheetButton onClick={() => void onAddSection()} disabled={creating}>
        Add section
      </AddSheetButton>
    </DocumentWorkspace>
  );
};

export default SectionLibraryPage;
