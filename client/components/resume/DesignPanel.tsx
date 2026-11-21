"use client";

import { createResumeDesign } from "@/api/resources/resumeDesigns/createResumeDesign";
import { deleteResumeDesign } from "@/api/resources/resumeDesigns/deleteResumeDesign";
import { getResumeDesigns } from "@/api/resources/resumeDesigns/getResumeDesigns";
import { updateResumeDesign } from "@/api/resources/resumeDesigns/updateResumeDesign";
import { Button } from "@/components/ui/Button";
import {
  ACCENT_SWATCHES,
  contrastWithWhite,
  DATE_OPTIONS,
  DESIGN_DEFAULTS,
  DesignSettings,
  DESIGN_KEYS,
  FONT_OPTIONS,
  HEADING_OPTIONS,
  headingColor,
  resolveDesign,
  SIZE_OPTIONS,
  SPACING_OPTIONS,
} from "@/lib/resume/design";
import { ResumeDesign } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckIcon, RotateCcwIcon, StarIcon, Trash2Icon } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FONT_FAMILIES } from "./templates/ClassicTemplate";
import IconAction from "./IconAction";

// Below this, headings get hard to read on white paper.
const MIN_ACCENT_CONTRAST = 3;

interface DesignPanelProps {
  design: DesignSettings;
  onChange: (next: DesignSettings) => void;
}

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

const sameDesign = (a: DesignSettings, b: DesignSettings) => DESIGN_KEYS.every((key) => a[key] === b[key]);

/** Controls for a resume's look, and the user's saved designs. */
const DesignPanel = ({ design, onChange }: DesignPanelProps) => {
  const [saved, setSaved] = useState<ResumeDesign[] | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const set = <K extends keyof DesignSettings>(key: K, value: DesignSettings[K]) => onChange({ ...design, [key]: value });

  useEffect(() => {
    void getResumeDesigns()
      .then((response) => setSaved(response.resume_designs))
      .catch((error) => {
        console.error(error);
        setSaved([]);
      });
  }, []);

  const saveAsNew = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName?.trim();
    if (!name) return;
    try {
      const { resume_design } = await createResumeDesign({ name, settings: design });
      setSaved((current) => [...(current ?? []), resume_design]);
      setNewName(null);
      toast.success(`Saved "${resume_design.name}"`);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save this design. Try again."));
    }
  };

  const makeDefault = async (target: ResumeDesign) => {
    try {
      const { resume_design } = await updateResumeDesign(target.id, { is_default: !target.is_default });
      setSaved((current) =>
        (current ?? []).map((item) =>
          item.id === resume_design.id ? resume_design : { ...item, is_default: resume_design.is_default ? false : item.is_default }
        )
      );
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't change the default design. Try again."));
    }
  };

  const remove = async (target: ResumeDesign) => {
    try {
      await deleteResumeDesign(target.id);
      setSaved((current) => (current ?? []).filter((item) => item.id !== target.id));
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't delete this design. Try again."));
    }
  };

  // Checks the colour headings print in, which Classic tints lighter than the accent.
  const lowContrast = contrastWithWhite(headingColor(design)) < MIN_ACCENT_CONTRAST;

  return (
    <div className="space-y-5 text-sm">
      <Group label="Saved designs">
        {saved === null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : saved.length === 0 ? (
          <p className="text-muted-foreground">Save this look to reuse it on other resumes.</p>
        ) : (
          <ul className="space-y-1">
            {saved.map((item) => {
              const itemDesign = resolveDesign(item.settings);
              const applied = sameDesign(itemDesign, design);
              return (
                <li key={item.id} className="group/design flex items-center gap-1 rounded-md pl-2 hover:bg-muted/60">
                  <button
                    type="button"
                    onClick={() => onChange(itemDesign)}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                  >
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: itemDesign.accent }}
                    />
                    <span className="truncate">{item.name}</span>
                    {applied && <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="In use" />}
                  </button>
                  <IconAction
                    label={item.is_default ? "Default for new resumes (click to unset)" : "Use for new resumes"}
                    active={item.is_default}
                    onClick={() => void makeDefault(item)}
                  >
                    <StarIcon className={cn(item.is_default && "fill-current")} />
                  </IconAction>
                  <IconAction label="Delete design" onClick={() => void remove(item)}>
                    <Trash2Icon />
                  </IconAction>
                </li>
              );
            })}
          </ul>
        )}

        {newName === null ? (
          <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={() => setNewName("")}>
            Save this design
          </Button>
        ) : (
          <form onSubmit={saveAsNew} className="mt-2 flex gap-2">
            <input
              autoFocus
              value={newName}
              maxLength={60}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setNewName(null)}
              placeholder="Name, e.g. Corporate"
              aria-label="Design name"
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 outline-none focus:border-foreground/40"
            />
            <Button type="submit" size="sm" disabled={!newName.trim()}>
              Save
            </Button>
          </form>
        )}
      </Group>

      <Group label="Font">
        <div className="grid grid-cols-2 gap-1.5">
          {FONT_OPTIONS.map((option) => (
            <OptionButton
              key={option.value}
              selected={design.font === option.value}
              onClick={() => set("font", option.value)}
              style={{ fontFamily: FONT_FAMILIES[option.value] }}
            >
              {option.label}
            </OptionButton>
          ))}
        </div>
      </Group>

      <Group label="Text size">
        <Segmented options={SIZE_OPTIONS} value={design.size} onChange={(value) => set("size", value)} />
      </Group>

      <Group label="Spacing">
        <Segmented options={SPACING_OPTIONS} value={design.spacing} onChange={(value) => set("spacing", value)} />
      </Group>

      <Group label="Accent colour">
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_SWATCHES.map((swatch) => (
            <button
              key={swatch.value}
              type="button"
              aria-label={swatch.label}
              aria-pressed={design.accent === swatch.value}
              title={swatch.label}
              onClick={() => set("accent", swatch.value)}
              className={cn(
                "size-7 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                design.accent === swatch.value ? "ring-2 ring-foreground/60" : "hover:ring-2 hover:ring-border"
              )}
              style={{ background: swatch.value }}
            />
          ))}
          <label className="relative size-7 cursor-pointer overflow-hidden rounded-full border border-dashed border-border" title="Custom colour">
            <span className="sr-only">Custom colour</span>
            <input
              type="color"
              value={design.accent}
              onChange={(event) => set("accent", event.target.value.toLowerCase())}
              className="absolute -inset-2 size-12 cursor-pointer opacity-0"
            />
            <span
              aria-hidden
              className="absolute inset-1 rounded-full"
              style={{
                background: ACCENT_SWATCHES.some((swatch) => swatch.value === design.accent)
                  ? "conic-gradient(#e11d48, #f59e0b, #10b981, #3b82f6, #8b5cf6, #e11d48)"
                  : design.accent,
              }}
            />
          </label>
        </div>
        {lowContrast && (
          <p role="status" className="mt-2 text-xs text-amber-700">
            This colour may be hard to read when printed.
          </p>
        )}
      </Group>

      <Group label="Section headings">
        <Segmented options={HEADING_OPTIONS} value={design.heading_style} onChange={(value) => set("heading_style", value)} />
      </Group>

      <Group label="Dates">
        <Segmented options={DATE_OPTIONS} value={design.date_position} onChange={(value) => set("date_position", value)} />
      </Group>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        onClick={() => onChange(DESIGN_DEFAULTS)}
        disabled={sameDesign(design, DESIGN_DEFAULTS)}
      >
        <RotateCcwIcon />
        Reset to the default look
      </Button>
    </div>
  );
};

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <fieldset className="space-y-2">
    <legend className="mb-2 text-xs font-medium text-muted-foreground">{label}</legend>
    {children}
  </fieldset>
);

const OptionButton = ({
  selected,
  onClick,
  children,
  style,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
}) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    style={style}
    className={cn(
      "rounded-md border px-2 py-1.5 text-sm transition-colors",
      selected ? "border-foreground/40 bg-muted font-medium" : "border-border hover:bg-muted/60"
    )}
  >
    {children}
  </button>
);

const Segmented = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <div className="flex rounded-md border border-border p-0.5">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className={cn(
          "flex-1 rounded px-2 py-1 text-sm transition-colors",
          value === option.value ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export default DesignPanel;
