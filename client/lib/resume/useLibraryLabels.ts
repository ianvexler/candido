import { createCvLabel } from "@/api/resources/cvLabels/createCvLabel";
import { deleteCvLabel } from "@/api/resources/cvLabels/deleteCvLabel";
import { LabelTarget, setLabelOnItems } from "@/api/resources/cvLabels/setLabelOnItems";
import { updateCvLabel } from "@/api/resources/cvLabels/updateCvLabel";
import { CvLabel } from "@/lib/types";
import { useCallback, useMemo, useState } from "react";

/** Give functions that stay the same, so these do too. */
interface LibraryLabelsOptions {
  /** Shows a section's labels as the server has them now. */
  setItemLabels: (templateId: number, map: Record<string, number[]>) => void;
  /** The label is gone from the server, and so from every section there. */
  onRemoved: (labelId: number) => void;
}

/** As the server lists them: by name, ignoring case. */
const byName = (a: CvLabel, b: CvLabel) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id;

/**
 * The user's purposes, and labelling library content with them. Labels are kept
 * apart from the section drafts, so saving text never overwrites them. Each
 * function throws what the request did; callers say so.
 */
export const useLibraryLabels = ({ setItemLabels, onRemoved }: LibraryLabelsOptions) => {
  const [labels, setLabels] = useState<CvLabel[]>([]);

  const load = useCallback((loaded: CvLabel[]) => setLabels([...loaded].sort(byName)), []);

  const create = useCallback(async (name: string) => {
    const { cv_label } = await createCvLabel(name.trim());
    setLabels((current) => [...current.filter(({ id }) => id !== cv_label.id), cv_label].sort(byName));
    return cv_label;
  }, []);

  const rename = useCallback(async (id: number, name: string) => {
    const { cv_label } = await updateCvLabel(id, name.trim());
    setLabels((current) => current.map((label) => (label.id === id ? cv_label : label)).sort(byName));
    return cv_label;
  }, []);

  const remove = useCallback(async (id: number) => {
    await deleteCvLabel(id);
    setLabels((current) => current.filter((label) => label.id !== id));
    onRemoved(id);
  }, [onRemoved]);

  const apply = useCallback(async (labelId: number, on: boolean, targets: LabelTarget[]) => {
    const { section_templates } = await setLabelOnItems(labelId, on, targets);
    section_templates.forEach((template) => setItemLabels(template.id, template.item_labels ?? {}));
  }, [setItemLabels]);

  return useMemo(() => ({ labels, load, create, rename, remove, apply }), [labels, load, create, rename, remove, apply]);
};
