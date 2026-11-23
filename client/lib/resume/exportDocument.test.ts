import { ResumeHeader, SectionEntry, SectionFields } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { buildResumeDocument, isEmptyDocument, pdfFileName, sectionColumn } from "./exportDocument";
import { emptyEntry } from "./sectionEntries";

type InputSection = SectionFields & { id: number; hidden?: boolean; placement?: "main" | "sidebar" | null };
/** Section fields, or fields of its single entry. */
type Overrides = Partial<Omit<InputSection, "hidden">> & Partial<Omit<SectionEntry, "id" | "hidden">> & { hidden?: boolean };

const header = (overrides: Partial<ResumeHeader> = {}): ResumeHeader => ({
  name: "Alex Rivera",
  headline: "Backend engineer",
  email: "alex@example.com",
  phone: "",
  location: "Lisbon",
  links: [],
  ...overrides,
});

const emptyHeader = (): ResumeHeader => ({ name: "", headline: "", email: "", phone: "", location: "", links: [] });

const entry = (id: string, overrides: Partial<SectionEntry> = {}): SectionEntry => ({
  ...emptyEntry(),
  title: "Acme",
  content: "<p>Built things</p>",
  ...overrides,
  id,
});

const section = (
  id: number,
  { section_type = "Experience", entries, hidden, placement, ...fields }: Overrides = {}
): InputSection => ({ id, section_type, hidden, placement, entries: entries ?? [entry(`e${id}`, fields as Partial<SectionEntry>)] });

const build = (sections: InputSection[], h: ResumeHeader = header(), title = "Platform roles") =>
  buildResumeDocument({ title, header: h, sections });

describe("buildResumeDocument", () => {
  it("drops hidden sections and keeps the rest in order", () => {
    const doc = build([section(1, { title: "First" }), section(2, { hidden: true }), section(3, { title: "Third" })]);

    expect(doc.sections.map((s) => s.id)).toEqual([1, 3]);
  });

  it("drops hidden text from the body", () => {
    const doc = build([section(1, { content: '<p>Led <span data-cv-hidden="true">quietly</span> work</p>' })]);

    expect(doc.sections[0].entries[0].html).toContain("Led");
    expect(doc.sections[0].entries[0].html).not.toContain("quietly");
  });

  it("drops a section with nothing visible", () => {
    const doc = build([
      section(1, { title: " ", section_type: " ", content: '<p><span data-cv-hidden="true">x</span></p>' }),
    ]);

    expect(doc.sections).toEqual([]);
  });

  it("keeps a section that only has a title", () => {
    const doc = build([section(1, { title: "Volunteering", section_type: "", content: "" })]);

    expect(doc.sections.map((s) => s.entries[0].title)).toEqual(["Volunteering"]);
  });

  it("keeps a section's entries under one heading, without hidden and empty ones", () => {
    const entries = [entry("a"), entry("b", { hidden: true }), entry("c", { title: "", content: "" }), entry("d")];
    const doc = build([section(1, { entries })]);

    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].entries.map((item) => item.id)).toEqual(["a", "d"]);
  });

  it("drops a section whose entries are all left out, but keeps a bare heading", () => {
    const doc = build([
      section(1, { entries: [entry("a", { hidden: true })] }),
      section(2, { entries: [entry("b", { title: "", content: "" })] }),
    ]);

    expect(doc.sections.map((item) => item.id)).toEqual([2]);
  });

  it("doesn't repeat an organisation that is also the title", () => {
    const doc = build([section(1, { title: "Acme", role: "Engineer", organization: "acme " })]);

    expect(doc.sections[0].entries[0].subtitle).toBe("Engineer");
  });

  it("joins role and organisation into the subtitle", () => {
    const [both, orgOnly, neither] = build([
      section(1, { role: "Senior engineer", organization: "Globex" }),
      section(2, { organization: "Globex" }),
      section(3),
    ])
      .sections.map((item) => item.entries[0]);

    expect(both.subtitle).toBe("Senior engineer · Globex");
    expect(orgOnly.subtitle).toBe("Globex");
    expect(neither.subtitle).toBe("");
  });

  it("joins dates and location into the meta line", () => {
    const [full, locationOnly, nothing] = build([
      section(1, { start_date: "2022-03-01", current: true, location: "Lisbon" }),
      section(2, { location: "Lisbon" }),
      section(3),
    ])
      .sections.map((item) => item.entries[0]);

    expect(full.meta).toBe("Mar 2022 – Present · Lisbon");
    expect(locationOnly.meta).toBe("Lisbon");
    expect(nothing.meta).toBe("");
  });

  it("trims header text and drops links without an address", () => {
    const doc = build(
      [],
      header({
        name: "  Alex Rivera ",
        links: [
          { label: "Site", url: "https://alex.example.com" },
          { label: "Empty", url: "  " },
        ],
      })
    );

    expect(doc.header.name).toBe("Alex Rivera");
    expect(doc.header.links).toEqual([{ label: "Site", url: "https://alex.example.com" }]);
  });
});

describe("isEmptyDocument", () => {
  it("is true with no sections and a blank header", () => {
    expect(isEmptyDocument(build([], emptyHeader()))).toBe(true);
  });

  it("is true when no section is visible, even with a header", () => {
    expect(isEmptyDocument(build([section(1, { hidden: true })], header()))).toBe(true);
  });

  it("is false when a section is visible", () => {
    expect(isEmptyDocument(build([section(1)], emptyHeader()))).toBe(false);
  });
});

describe("pdfFileName", () => {
  it("combines the name and the resume title", () => {
    expect(pdfFileName(build([]))).toBe("Alex Rivera - Platform roles");
  });

  it("uses only the title when the name is blank", () => {
    expect(pdfFileName(build([], header({ name: " " })))).toBe("Platform roles");
  });
});

describe("sectionColumn", () => {
  it("puts short-list sections in the sidebar and the rest in the main column by default", () => {
    for (const type of ["Skills", "Technical skills", "Languages", "Certifications", "Interests", "Tools", "Awards"]) {
      expect(sectionColumn({ section_type: type, placement: null })).toBe("sidebar");
    }
    for (const type of ["Experience", "Education", "Projects", "Summary", ""]) {
      expect(sectionColumn({ section_type: type, placement: null })).toBe("main");
    }
  });

  it("uses the placement chosen for the section over its type", () => {
    expect(sectionColumn({ section_type: "Skills", placement: "main" })).toBe("main");
    expect(sectionColumn({ section_type: "Experience", placement: "sidebar" })).toBe("sidebar");
  });

  it("carries the column into the exported document", () => {
    const doc = build([section(1, { section_type: "Skills" }), section(2, { placement: "sidebar" }), section(3)]);
    expect(doc.sections.map((item) => item.column)).toEqual(["sidebar", "sidebar", "main"]);
  });
});
