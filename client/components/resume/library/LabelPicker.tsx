"use client";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import type { PurposeFilter } from "@/lib/resume/purposes";
import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import { CvLabel } from "@/lib/types";
import { PlusIcon } from "lucide-react";
import { Popover } from "radix-ui";
import { ReactNode, useId, useState } from "react";
import toast from "react-hot-toast";
import { NameInput } from "./PurposeList";

/** The chosen purpose first, then the rest as listed. */
export const pickerLabels = (labels: CvLabel[], filter: PurposeFilter): CvLabel[] => {
  if (filter.kind !== "label") return labels;
  const chosen = labels.filter(({ id }) => id === filter.id);
  return [...chosen, ...labels.filter(({ id }) => id !== filter.id)];
};

/**
 * toggle: a checkbox per label, ticked for the target's own ones.
 * add / remove: choosing a label adds it to, or takes it off, every target.
 */
export type PickerMode =
  | { kind: "toggle"; own: number[]; inherited: number[] }
  | { kind: "add" }
  | { kind: "remove" };

interface LabelPickerProps {
  labels: CvLabel[];
  filter: PurposeFilter;
  mode: PickerMode;
  /** Says what went wrong itself. */
  onChoose: (labelId: number, on: boolean) => Promise<void>;
  /** Offers "New collection", which is then added to the target. */
  onCreate?: (name: string) => Promise<CvLabel>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What it labels, for screen readers. */
  title: string;
  /** The button that opens it. */
  children: ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
  /** Where focus goes as it closes, when `children` can't take it back. */
  onCloseAutoFocus?: (event: Event) => void;
}

const ROW = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm [@media(pointer:coarse)]:min-h-11";

/** Which purposes something is labelled with, and labelling it with others. */
const LabelPicker = ({
  labels,
  filter,
  mode,
  onChoose,
  onCreate,
  open,
  onOpenChange,
  title,
  children,
  align = "end",
  side = "bottom",
  onCloseAutoFocus,
}: LabelPickerProps) => {
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const listed = pickerLabels(labels, filter);
  const idPrefix = useId();

  const choose = async (labelId: number, on: boolean) => {
    setBusy(true);
    try {
      await onChoose(labelId, on);
    } finally {
      setBusy(false);
    }
    if (mode.kind !== "toggle") onOpenChange(false);
  };

  const create = async (name: string) => {
    if (!onCreate) return false;
    let created: CvLabel;
    try {
      created = await onCreate(name);
    } catch (error) {
      console.error(error);
      toast.error(apiErrorMessage(error, "Couldn't add this collection."));
      return false;
    }
    setCreating(false);
    await choose(created.id, true);
    return true;
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setCreating(false);
        onOpenChange(next);
      }}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          side={side}
          sideOffset={4}
          collisionPadding={8}
          aria-label={title}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={(event) => {
            // Escape leaves the new name first.
            if (creating) {
              event.preventDefault();
              setCreating(false);
            }
          }}
          className="z-50 flex max-h-(--radix-popover-content-available-height) w-60 max-w-[calc(100vw-1rem)] flex-col rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ul className="min-h-0 overflow-y-auto" aria-busy={busy || undefined}>
            {listed.map((label) => {
              if (mode.kind !== "toggle") {
                return (
                  <li key={label.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void choose(label.id, mode.kind === "add")}
                      className={`${ROW} hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50`}
                    >
                      <span className="truncate">{label.name}</span>
                    </button>
                  </li>
                );
              }
              const own = mode.own.includes(label.id);
              const id = `${idPrefix}-${label.id}`;
              return (
                <li key={label.id} className={`${ROW} hover:bg-muted`}>
                  <Checkbox
                    id={id}
                    checked={own}
                    disabled={busy}
                    onCheckedChange={(checked) => void choose(label.id, checked === true)}
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer truncate">
                    {label.name}
                  </label>
                  {!own && mode.inherited.includes(label.id) && (
                    <span className="shrink-0 text-xs text-muted-foreground">from entry</span>
                  )}
                </li>
              );
            })}
          </ul>
          {onCreate && (
            <div className="mt-1 border-t pt-1">
              {creating ? (
                <div className="px-1 py-0.5">
                  <NameInput label="New collection" onSubmit={create} onCancel={() => setCreating(false)} />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="w-full justify-start text-muted-foreground [@media(pointer:coarse)]:h-11"
                  onClick={() => setCreating(true)}
                >
                  <PlusIcon />
                  New collection
                </Button>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default LabelPicker;
