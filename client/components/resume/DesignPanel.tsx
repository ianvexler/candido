"use client";

import { createResumeDesign } from "@/api/resources/resumeDesigns/createResumeDesign";
import { deleteResumeDesign } from "@/api/resources/resumeDesigns/deleteResumeDesign";
import { getResumeDesigns } from "@/api/resources/resumeDesigns/getResumeDesigns";
import { updateResumeDesign } from "@/api/resources/resumeDesigns/updateResumeDesign";
import { Button } from "@/components/ui/Button";
import {
  ACCENT_SWATCHES,
  applyPreset,
  contrastWithWhite,
  DATE_OPTIONS,
  DESIGN_DEFAULTS,
  DesignSettings,
  DESIGN_KEYS,
  FINE_TUNE,
  FineTuneKey,
  FONT_OPTIONS,
  HEADING_CASE_OPTIONS,
  HEADING_RULE_OPTIONS,
  headingColor,
  matchingPreset,
  resolveDesign,
  SIZE_OPTIONS,
  SPACING_OPTIONS,
  TEMPLATE_OPTIONS,
} from "@/lib/resume/design";
import { ResumeDesign } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronRightIcon, RotateCcwIcon, StarIcon, Trash2Icon } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FONT_FAMILIES } from "./templates/fonts";
import IconAction from "./IconAction";
import TemplateThumbnail from "./TemplateThumbnail";

// Below this, headings get hard to read on white paper.
const MIN_ACCENT_CONTRAST = 3;

interface DesignPanelProps {
  design: DesignSettings;
  onChange: (next: DesignSettings) => void;
  /** What a design being saved is called so far, or null. */
  newName: string | null;
  onNewNameChange: (name: string | null) => void;
}

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

const sameDesign = (a: DesignSettings, b: DesignSettings) => DESIGN_KEYS.every((key) => a[key] === b[key]);

/** Controls for a resume's look, and the user's saved designs. */
const DesignPanel = ({ design, onChange, newName, onNewNameChange }: DesignPanelProps) => {
  const [saved, setSaved] = useState<ResumeDesign[] | null>(null);
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
      onNewNameChange(null);
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
                    label={item.is_default ? "Default for new CVs (click to unset)" : "Use for new CVs"}
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
          <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={() => onNewNameChange("")}>
            Save this design
          </Button>
        ) : (
          <form onSubmit={saveAsNew} className="mt-2 flex gap-2">
            <input
              autoFocus
              value={newName}
              maxLength={60}
              onChange={(event) => onNewNameChange(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && onNewNameChange(null)}
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

      <Group label="Template">
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATE_OPTIONS.map((option) => {
            const selected = design.template === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                title={option.description}
                onClick={() => set("template", option.value)}
                className="group/template flex flex-col items-center gap-1.5 rounded-md text-sm outline-none"
              >
                <span
                  className={cn(
                    "block w-full overflow-hidden rounded-md border bg-muted/50 p-2.5 transition-colors",
                    "group-focus-visible/template:ring-2 group-focus-visible/template:ring-ring",
                    selected ? "border-foreground/50 ring-1 ring-foreground/50" : "border-border group-hover/template:border-foreground/25"
                  )}
                >
                  <span className="mx-auto block w-20 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                    <TemplateThumbnail template={option.value} accent={design.accent} />
                  </span>
                </span>
                <span className={cn(selected ? "font-medium text-foreground" : "text-muted-foreground group-hover/template:text-foreground")}>
                  {option.label}
                </span>
                <span className="sr-only">{option.description}</span>
              </button>
            );
          })}
        </div>
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

      {/* A preset shows as picked only while none of its values is fine-tuned. */}
      <Group label="Text size">
        <Segmented
          options={SIZE_OPTIONS}
          value={matchingPreset(design, "size")}
          onChange={(value) => onChange(applyPreset(design, "size", value))}
        />
      </Group>

      <Group label="Spacing">
        <Segmented
          options={SPACING_OPTIONS}
          value={matchingPreset(design, "spacing")}
          onChange={(value) => onChange(applyPreset(design, "spacing", value))}
        />
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
        <div className="space-y-1.5">
          <Segmented
            label="Text"
            options={HEADING_CASE_OPTIONS}
            value={design.heading_case}
            onChange={(value) => set("heading_case", value)}
          />
          <Segmented
            label="Line"
            options={HEADING_RULE_OPTIONS}
            value={design.heading_rule}
            onChange={(value) => set("heading_rule", value)}
          />
        </div>
      </Group>

      <Group label="Dates">
        <Segmented options={DATE_OPTIONS} value={design.date_position} onChange={(value) => set("date_position", value)} />
      </Group>

      <details className="group/fine border-t border-border pt-4">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRightIcon className="size-3.5 transition-transform group-open/fine:rotate-90" aria-hidden />
          Fine-tune
        </summary>
        <div className="mt-4 space-y-5">
          {FINE_TUNE_GROUPS.map((group) => (
            <Group key={group.label} label={group.label}>
              <div className="space-y-3">
                {group.keys.map((key) => (
                  <FineTuneSlider key={key} fineKey={key} value={design[key]} onChange={(value) => set(key, value)} />
                ))}
              </div>
            </Group>
          ))}
        </div>
      </details>

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

const FINE_TUNE_GROUPS: { label: string; keys: FineTuneKey[] }[] = [
  { label: "Text sizes", keys: ["body_size", "name_size", "heading_size", "title_size", "meta_size"] },
  { label: "Spacing", keys: ["line_height", "section_gap", "heading_gap", "paragraph_gap"] },
  { label: "Page margins", keys: ["margin_y", "margin_x"] },
];

// Range inputs can report float noise such as 1.2000000000000002; snap to the step.
const snap = (key: FineTuneKey, value: number) => {
  const { min, step } = FINE_TUNE[key];
  return Number((min + Math.round((value - min) / step) * step).toFixed(2));
};

const FineTuneSlider = ({
  fineKey,
  value,
  onChange,
}: {
  fineKey: FineTuneKey;
  value: number;
  onChange: (value: number) => void;
}) => {
  const { label, min, max, step, unit } = FINE_TUNE[fineKey];
  const id = `fine-tune-${fineKey}`;
  const shown = unit ? `${value} ${unit}` : value.toFixed(2);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id}>{label}</label>
        <span className="text-xs tabular-nums text-muted-foreground">{shown}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={shown}
        onChange={(event) => onChange(snap(fineKey, Number(event.target.value)))}
        className="w-full accent-foreground"
      />
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
  label,
  options,
  value,
  onChange,
}: {
  /** Shown beside the options, for a group with more than one row. */
  label?: string;
  options: readonly { value: T; label: string }[];
  /** null when no option matches, e.g. a preset after fine-tuning. */
  value: T | null;
  onChange: (value: T) => void;
}) => {
  const control = (
    <div role="group" aria-label={label} className="flex flex-1 rounded-md border border-border p-0.5">
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
  if (!label) return control;
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="w-8 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      {control}
    </div>
  );
};

export default DesignPanel;
