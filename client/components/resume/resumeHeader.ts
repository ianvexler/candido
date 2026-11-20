import { ResumeHeader, ResumeHeaderTextFields } from "@/lib/types";

export const EMPTY_HEADER: ResumeHeader = {
  name: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  links: [],
};

/** Mirrors the server: blank override text and missing links fall back to the profile. */
export const resolveHeader = (profile: ResumeHeader, overrides: Partial<ResumeHeader> = {}): ResumeHeader => {
  const resolved: ResumeHeader = { ...profile };
  ResumeHeaderTextFields.forEach((field) => {
    const value = overrides[field]?.trim();
    if (value) resolved[field] = value;
  });
  if (overrides.links) resolved.links = overrides.links.filter((link) => link.url.trim());
  return resolved;
};

export const hasHeaderContent = (header: ResumeHeader) =>
  ResumeHeaderTextFields.some((field) => header[field].trim()) || header.links.some((link) => link.url.trim());
