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

export const HEADING_OPTIONS = [
  { value: "caps_rule", label: "Classic" },
  { value: "bold", label: "Bold" },
  { value: "accent_bar", label: "Colour bar" },
] as const;

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
export type DesignHeadingStyle = ValueOf<typeof HEADING_OPTIONS>;
export type DesignDatePosition = ValueOf<typeof DATE_OPTIONS>;

export type DesignSettings = {
  font: DesignFont;
  size: DesignSize;
  spacing: DesignSpacing;
  /** "#rrggbb" */
  accent: string;
  heading_style: DesignHeadingStyle;
  date_position: DesignDatePosition;
};

export const DESIGN_KEYS = ["font", "size", "spacing", "accent", "heading_style", "date_position"] as const;

export const DESIGN_DEFAULTS: DesignSettings = {
  font: "source_sans",
  size: "medium",
  spacing: "normal",
  accent: "#1a1a1a",
  heading_style: "caps_rule",
  date_position: "right",
};

const BASE_SIZE: Record<DesignSize, string> = { small: "9.5pt", medium: "10.5pt", large: "11.5pt" };
const SPACING: Record<DesignSpacing, { gap: string; line: string }> = {
  compact: { gap: "0.7", line: "1.25" },
  normal: { gap: "1", line: "1.35" },
  relaxed: { gap: "1.35", line: "1.45" },
};
const HEX = /^#[0-9a-f]{6}$/i;

const pick = <T extends string>(options: readonly { value: T }[], value: unknown, fallback: T): T =>
  options.some((option) => option.value === value) ? (value as T) : fallback;

/** A resume's design from its stored styles, with defaults for anything missing or invalid. */
export const resolveDesign = (styles: Record<string, unknown> | null | undefined): DesignSettings => {
  const raw = styles ?? {};
  const accent = typeof raw.accent === "string" && HEX.test(raw.accent) ? raw.accent.toLowerCase() : DESIGN_DEFAULTS.accent;
  return {
    font: pick(FONT_OPTIONS, raw.font, DESIGN_DEFAULTS.font),
    size: pick(SIZE_OPTIONS, raw.size, DESIGN_DEFAULTS.size),
    spacing: pick(SPACING_OPTIONS, raw.spacing, DESIGN_DEFAULTS.spacing),
    accent,
    heading_style: pick(HEADING_OPTIONS, raw.heading_style, DESIGN_DEFAULTS.heading_style),
    date_position: pick(DATE_OPTIONS, raw.date_position, DESIGN_DEFAULTS.date_position),
  };
};

/** CSS custom properties the Classic stylesheet reads. */
export const designStyle = (design: DesignSettings, fontFamilies: Record<DesignFont, string>): CSSProperties =>
  ({
    "--rc-font": fontFamilies[design.font],
    "--rc-size": BASE_SIZE[design.size],
    "--rc-gap": SPACING[design.spacing].gap,
    "--rc-line": SPACING[design.spacing].line,
    "--rc-accent": design.accent,
  }) as CSSProperties;

const channel = (value: number) => {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

/** WCAG contrast ratio between a "#rrggbb" colour and white (1 to 21). */
export const contrastWithWhite = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return 1.05 / (luminance + 0.05);
};
