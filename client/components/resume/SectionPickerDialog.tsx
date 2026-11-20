"use client";

import { getSectionTemplates } from "@/api/resources/sectionTemplates/getSectionTemplates";
import Loader from "@/components/common/Loader";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SectionTemplate } from "@/lib/types";
import NextLink from "next/link";
import { Dialog } from "radix-ui";
import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";

export type SectionPickerResult = {
  name: string;
  sectionTemplateIds: number[];
};

interface SectionPickerDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Shows a name field (for a new resume) when set. */
  nameLabel?: string;
  /** Allow confirming with nothing ticked (a new, empty resume). */
  allowEmpty?: boolean;
  onConfirm: (result: SectionPickerResult) => Promise<void>;
}

/** Choose library sections to copy into a resume. */
const SectionPickerDialog = ({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  nameLabel,
  allowEmpty = false,
  onConfirm,
}: SectionPickerDialogProps) => {
  const [templates, setTemplates] = useState<SectionTemplate[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void getSectionTemplates()
      .then((response) => {
        if (!cancelled) setTemplates(response.section_templates);
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to load your section library");
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const reset = () => {
    setSelected(new Set());
    setName("");
    setTemplates(null);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const toggle = (id: number, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const canSubmit = !submitting && (allowEmpty || selected.size > 0) && (!nameLabel || name.trim());

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      // Keep library order rather than the order boxes were ticked.
      const ids = (templates ?? []).map((template) => template.id).filter((id) => selected.has(id));
      await onConfirm({ name: name.trim(), sectionTemplateIds: ids });
      reset();
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-101 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-background p-6 shadow-lg">
          <Dialog.Title asChild>
            <h2 className="text-lg font-semibold">{title}</h2>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </Dialog.Description>

          <form onSubmit={onSubmit} className="mt-5 flex min-h-0 flex-col gap-4">
            {nameLabel && (
              <div className="space-y-1.5">
                <Label htmlFor="resume-name">{nameLabel}</Label>
                <Input
                  id="resume-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Backend roles"
                  autoFocus
                />
              </div>
            )}

            <div className="min-h-0 overflow-y-auto rounded-md border border-border">
              {templates === null ? (
                <div className="flex justify-center py-8">
                  <Loader />
                </div>
              ) : templates.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  Your library is empty.{" "}
                  <NextLink href="/resume/sections" className="underline">
                    Write some sections
                  </NextLink>{" "}
                  first.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {templates.map((template) => (
                    <li key={template.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50">
                        <Checkbox
                          className="mt-0.5"
                          checked={selected.has(template.id)}
                          onCheckedChange={(checked) => toggle(template.id, checked === true)}
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {template.section_type}
                          </span>
                          <span className="block truncate text-sm font-medium">{template.title}</span>
                          {template.description && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {template.description}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {confirmLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default SectionPickerDialog;
