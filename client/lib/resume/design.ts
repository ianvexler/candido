import type { CSSProperties } from "react";

/**
 * A resume's look. Mirrors ResumeDesignSettings on the server: the first
 * option of each list (and the accent default) reproduce the original Classic
 * design, so resumes saved before designs existed look unchanged.
 */
export const FONT_OPTIONS = [
  { value: "source_sans", label: "Source Sans" },
  { value: "plex_sans", label: "IBM Plex Sans" },
  { value: "source_serif", label: "Source Serif" },
  { value: "lora", label: "Lora" },
] as const;

export const SIZE_OPTIONS = [
  { value: "medium", label: "Medium" },
  { value: "small", label: "Small" },
  { value: "large", label: "Large" },
] as const;

export const SPACING_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "compact", label: "Compact" },
  { value: "relaxed", label: "Relaxed" },
] as const;

export const HEADING_CASE_OPTIONS = [
  { value: "caps", label: "Capitals" },
  { value: "as_typed", label: "As typed" },
] as const;

export const HEADING_RULE_OPTIONS = [
  { value: "under", label: "Under" },
  { value: "bar", label: "Side bar" },
  { value: "none", label: "None" },
] as const;

// Older designs saved case and line as one setting.
const LEGACY_HEADING_STYLES: Record<string, { heading_case: DesignHeadingCase; heading_rule: DesignHeadingRule }> = {
  caps_rule: { heading_case: "caps", heading_rule: "under" },
  bold: { heading_case: "as_typed", heading_rule: "none" },
  accent_bar: { heading_case: "caps", heading_rule: "bar" },
};

export const DATE_OPTIONS = [
  { value: "right", label: "Right" },
  { value: "below", label: "Below" },
] as const;

export const ACCENT_SWATCHES = [
  { value: "#1a1a1a", label: "Black" },
  { value: "#1f4e79", label: "Navy" },
  { value: "#2f6f4f", label: "Green" },
  { value: "#8a3b12", label: "Rust" },
  { value: "#6b2d5c", label: "Plum" },
  { value: "#4a5568", label: "Slate" },
] as const;

type ValueOf<T extends readonly { value: string }[]> = T[number]["value"];

export type DesignFont = ValueOf<typeof FONT_OPTIONS>;
export type DesignSize = ValueOf<typeof SIZE_OPTIONS>;
export type DesignSpacing = ValueOf<typeof SPACING_OPTIONS>;
export type DesignHeadingCase = ValueOf<typeof HEADING_CASE_OPTIONS>;
export type DesignHeadingRule = ValueOf<typeof HEADING_RULE_OPTIONS>;
export type DesignDatePosition = ValueOf<typeof DATE_OPTIONS>;

/**
 * Fine-tune values, mirroring ResumeDesignSettings::RANGES on the server.
 * Sizes and gaps are in points, margins in millimetres.
 */
export const FINE_TUNE = {
  body_size: { label: "Body text", min: 9, max: 12, step: 0.5, unit: "pt" },
  name_size: { label: "Name", min: 16, max: 30, step: 0.5, unit: "pt" },
  heading_size: { label: "Section headings", min: 8, max: 14, step: 0.5, unit: "pt" },
  title_size: { label: "Entry titles", min: 10, max: 14, step: 0.5, unit: "pt" },
  meta_size: { label: "Roles and dates", min: 8, max: 12, step: 0.5, unit: "pt" },
  line_height: { label: "Line height", min: 1.15, max: 1.6, step: 0.05, unit: "" },
  section_gap: { label: "Between sections", min: 4, max: 28, step: 1, unit: "pt" },
  heading_gap: { label: "Under headings", min: 0, max: 12, step: 0.5, unit: "pt" },
  paragraph_gap: { label: "Between paragraphs", min: 0, max: 8, step: 0.5, unit: "pt" },
  margin_y: { label: "Top and bottom", min: 10, max: 25, step: 1, unit: "mm" },
  margin_x: { label: "Sides", min: 10, max: 25, step: 1, unit: "mm" },
} as const;

export type FineTuneKey = keyof typeof FINE_TUNE;
export const FINE_TUNE_KEYS = Object.keys(FINE_TUNE) as FineTuneKey[];

export type DesignSettings = {
  font: DesignFont;
  size: DesignSize;
  spacing: DesignSpacing;
  /** "#rrggbb" */
  accent: string;
  heading_case: DesignHeadingCase;
  heading_rule: DesignHeadingRule;
  date_position: DesignDatePosition;
} & Record<FineTuneKey, number>;

// Each preset sets these values; picking one overwrites any fine-tuning of them.
const SIZE_PRESETS: Record<DesignSize, Pick<DesignSettings, "body_size" | "name_size" | "heading_size" | "title_size" | "meta_size">> = {
  small: { body_size: 9.5, name_size: 20, heading_size: 8, title_size: 10.5, meta_size: 9.5 },
  medium: { body_size: 10.5, name_size: 22, heading_size: 9, title_size: 11.5, meta_size: 10.5 },
  large: { body_size: 11.5, name_size: 24, heading_size: 10, title_size: 12.5, meta_size: 11.5 },
};
const SPACING_PRESETS: Record<DesignSpacing, Pick<DesignSettings, "line_height" | "section_gap" | "heading_gap" | "paragraph_gap">> = {
  compact: { line_height: 1.25, section_gap: 10, heading_gap: 4, paragraph_gap: 2 },
  normal: { line_height: 1.35, section_gap: 14, heading_gap: 6, paragraph_gap: 3 },
  relaxed: { line_height: 1.45, section_gap: 19, heading_gap: 8, paragraph_gap: 4 },
};
const PRESETS = { size: SIZE_PRESETS, spacing: SPACING_PRESETS };
const MARGIN_DEFAULTS = { margin_y: 16, margin_x: 18 };

export const DESIGN_KEYS = ["font", "size", "spacing", "accent", "heading_case", "heading_rule", "date_position", ...FINE_TUNE_KEYS] as const;

export const DESIGN_DEFAULTS: DesignSettings = {
  font: "source_sans",
  size: "medium",
  spacing: "normal",
  accent: "#1a1a1a",
  heading_case: "caps",
  heading_rule: "under",
  date_position: "right",
  ...SIZE_PRESETS.medium,
  ...SPACING_PRESETS.normal,
  ...MARGIN_DEFAULTS,
};

const HEX = /^#[0-9a-f]{6}$/i;
// Paragraph gaps scale the template's small inner gaps, which were tuned at 3pt.
const BASE_PARAGRAPH_GAP = 3;

const pick = <T extends string>(options: readonly { value: T }[], value: unknown, fallback: T): T =>
  options.some((option) => option.value === value) ? (value as T) : fallback;

const validNumber = (key: FineTuneKey, value: unknown) => {
  const { min, max, step } = FINE_TUNE[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return false;
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
};

/**
 * A resume's design from its stored styles, with defaults for anything missing
 * or invalid. A fine-tune value that's missing comes from the size or spacing
 * preset, so resumes saved before fine-tuning existed look the same.
 */
export const resolveDesign = (styles: Record<string, unknown> | null | undefined): DesignSettings => {
  const raw = styles ?? {};
  const accent = typeof raw.accent === "string" && HEX.test(raw.accent) ? raw.accent.toLowerCase() : DESIGN_DEFAULTS.accent;
  const size = pick(SIZE_OPTIONS, raw.size, DESIGN_DEFAULTS.size);
  const spacing = pick(SPACING_OPTIONS, raw.spacing, DESIGN_DEFAULTS.spacing);
  const legacyHeading = LEGACY_HEADING_STYLES[String(raw.heading_style)] ?? DESIGN_DEFAULTS;
  const fallbacks: Record<FineTuneKey, number> = { ...SIZE_PRESETS[size], ...SPACING_PRESETS[spacing], ...MARGIN_DEFAULTS };
  const fineTune = Object.fromEntries(
    FINE_TUNE_KEYS.map((key) => [key, validNumber(key, raw[key]) ? (raw[key] as number) : fallbacks[key]])
  ) as Record<FineTuneKey, number>;

  return {
    font: pick(FONT_OPTIONS, raw.font, DESIGN_DEFAULTS.font),
    size,
    spacing,
    accent,
    heading_case: pick(HEADING_CASE_OPTIONS, raw.heading_case, legacyHeading.heading_case),
    heading_rule: pick(HEADING_RULE_OPTIONS, raw.heading_rule, legacyHeading.heading_rule),
    date_position: pick(DATE_OPTIONS, raw.date_position, DESIGN_DEFAULTS.date_position),
    ...fineTune,
  };
};

/** The design with a size or spacing preset picked: sets every value the preset covers. */
export const applyPreset = <K extends keyof typeof PRESETS>(
  design: DesignSettings,
  kind: K,
  preset: keyof (typeof PRESETS)[K]
): DesignSettings => ({ ...design, [kind]: preset, ...(PRESETS[kind][preset] as Partial<DesignSettings>) });

/** The preset whose values the design has now, or null once any of them is fine-tuned. */
export const matchingPreset = <K extends keyof typeof PRESETS>(design: DesignSettings, kind: K) => {
  const presets = PRESETS[kind] as Record<string, Partial<Record<FineTuneKey, number>>>;
  const match = Object.entries(presets).find(([, values]) =>
    Object.entries(values).every(([key, value]) => design[key as FineTuneKey] === value)
  );
  return (match?.[0] ?? null) as keyof (typeof PRESETS)[K] | null;
};

/** The printed page's margins: top and bottom, then the sides. */
export const pageMargin = (design: DesignSettings) => `${design.margin_y}mm ${design.margin_x}mm`;

const pt = (value: number) => `${value}pt`;

/** CSS custom properties the Classic stylesheet reads. */
export const designStyle = (design: DesignSettings, fontFamilies: Record<DesignFont, string>): CSSProperties =>
  ({
    "--rc-font": fontFamilies[design.font],
    "--rc-size": pt(design.body_size),
    "--rc-name-size": pt(design.name_size),
    "--rc-heading-size": pt(design.heading_size),
    "--rc-title-size": pt(design.title_size),
    "--rc-meta-size": pt(design.meta_size),
    "--rc-line": String(design.line_height),
    "--rc-section-gap": pt(design.section_gap),
    "--rc-heading-gap": pt(design.heading_gap),
    "--rc-gap": String(Number((design.paragraph_gap / BASE_PARAGRAPH_GAP).toFixed(4))),
    "--rc-accent": design.accent,
  }) as CSSProperties;

const channel = (value: number) => {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

// Headings in capitals tint the accent toward white (see .rc-heading in classic.css).
const CLASSIC_HEADING_MIX = 0.82;

/**
 * The "#rrggbb" colour section headings print in. Capitals are tinted lighter
 * than the accent, except beside a side bar, where the text matches the bar.
 */
export const headingColor = (design: DesignSettings) => {
  if (design.heading_case !== "caps" || design.heading_rule === "bar") return design.accent;
  return (
    "#" +
    [1, 3, 5]
      .map((start) => parseInt(design.accent.slice(start, start + 2), 16))
      .map((value) => Math.round(value * CLASSIC_HEADING_MIX + 255 * (1 - CLASSIC_HEADING_MIX)))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
  );
};

/** WCAG contrast ratio between a "#rrggbb" colour and white (1 to 21). */
export const contrastWithWhite = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return 1.05 / (luminance + 0.05);
};
