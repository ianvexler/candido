"use client";

import { createSectionTemplate } from "@/api/resources/sectionTemplates/createSectionTemplate";
import { deleteSectionTemplate } from "@/api/resources/sectionTemplates/deleteSectionTemplate";
import { getSectionTemplates } from "@/api/resources/sectionTemplates/getSectionTemplates";
import { updateSectionTemplate } from "@/api/resources/sectionTemplates/updateSectionTemplate";
import Description from "@/components/common/Description";
import Loader from "@/components/common/Loader";
import Title from "@/components/common/Title";
import AddSheetButton from "@/components/resume/AddSheetButton";
import DocumentWorkspace from "@/components/resume/DocumentWorkspace";
import SectionDocument from "@/components/resume/SectionDocument";
import SectionPreview from "@/components/resume/SectionPreview";
import { SectionTemplate } from "@/lib/types";
import { ArrowLeftIcon } from "lucide-react";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const SectionLibraryPage = () => {
  const [templates, setTemplates] = useState<SectionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void getSectionTemplates()
      .then((response) => setTemplates(response.section_templates))
      .catch((error) => {
        console.error(error);
        toast.error("Failed to load your section library");
      })
      .finally(() => setLoading(false));
  }, []);

  const onAddSection = async () => {
    setCreating(true);
    try {
      const response = await createSectionTemplate({ title: "Untitled", section_type: "Section" });
      setTemplates((current) => [...current, response.section_template]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to add section");
    } finally {
      setCreating(false);
    }
  };

  const replaceTemplate = (next: SectionTemplate) =>
    setTemplates((current) => current.map((item) => (item.id === next.id ? next : item)));

  const removeTemplate = async (id: number) => {
    try {
      await deleteSectionTemplate(id);
      setTemplates((current) => current.filter((item) => item.id !== id));
      toast.success("Section deleted");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete section");
    }
  };

  if (loading) {
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
            Resumes
          </NextLink>
          <Title>Section library</Title>
          <Description className="mt-1">
            Write reusable sections here, then add them to a resume. Highlight text to hide or show it.
          </Description>
        </>
      }
      preview={<SectionPreview sections={templates} />}
    >
      {templates.map((template) => (
        <SectionDocument
          key={template.id}
          section={template}
          save={async (fields) => (await updateSectionTemplate(template.id, fields)).section_template}
          onSaved={replaceTemplate}
          onDelete={() => removeTemplate(template.id)}
          deleteTitle="Delete this section?"
          deleteDescription="This removes the reusable section from your library. Resumes that already use it keep their copy."
        />
      ))}

      <AddSheetButton onClick={() => void onAddSection()} disabled={creating}>
        Add section
      </AddSheetButton>
    </DocumentWorkspace>
  );
};

export default SectionLibraryPage;
