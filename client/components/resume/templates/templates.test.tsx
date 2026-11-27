import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PageEditing, PageEditingContext, TextSlot } from "@/components/resume/page/PageEditing";
import { DESIGN_DEFAULTS } from "@/lib/resume/design";
import { ExportEntry, ResumeDocument } from "@/lib/resume/exportDocument";
import { ContactLines, EntryLine } from "./parts";
import { ResumeTemplate } from "./ResumeTemplate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// next/font only works inside Next's own build.
vi.mock("./fonts", () => ({ FONT_FAMILIES: {} }));

const entry = (id: string, fields: Partial<ExportEntry> = {}): ExportEntry => ({
  id,
  title: "",
  subtitle: "",
  meta: "",
  summary: "",
  html: "",
  ...fields,
});

const full: ResumeDocument = {
  title: "Platform roles",
  header: {
    name: "Sam & Co",
    headline: "Engineer",
    email: "sam@example.com",
    phone: "07700 900123",
    location: "Leeds",
    links: [
      { label: "GitHub", url: "https://github.com/x" },
      { label: "", url: "https://x.test/me" },
    ],
  },
  sections: [
    {
      id: 1,
      heading: "Experience",
      column: "main",
      entries: [
        entry("a", { title: "Northwind", subtitle: "Lead", meta: "Mar 2022 – Present", summary: "Short  summary", html: "<ul><li><p>One</p></li></ul>" }),
        entry("b", { subtitle: "Engineer", html: "<p>Untitled entry</p>" }),
        entry("c", { title: "Title only" }),
        entry("d", { meta: "2020" }),
      ],
    },
    { id: 2, heading: "", column: "main", entries: [entry("e", { html: "<p>No heading</p>" })] },
    { id: 3, heading: "Empty", column: "main", entries: [] },
    { id: 4, heading: "Skills", column: "sidebar", entries: [entry("f", { html: "<p>Ruby</p>" })] },
  ],
};

const bare: ResumeDocument = {
  title: "",
  header: { name: "", headline: "", email: "", phone: "", location: "", links: [] },
  sections: [],
};

const markup = (document: ResumeDocument, template: "classic" | "sidebar") =>
  renderToStaticMarkup(<ResumeTemplate document={document} paper="a4" design={{ ...DESIGN_DEFAULTS, template }} />);

describe("the templates, not being edited", () => {
  it.each(["classic", "sidebar"] as const)("render as they always have: %s", (template) => {
    expect(markup(full, template)).toMatchSnapshot();
    expect(markup(bare, template)).toMatchSnapshot();
  });
});

const none: PageEditing = { text: () => null, line: () => null, body: () => null, contact: () => null };

/** Every piece of text the document has, as the drafts would give it. */
const valueOf = (doc: ResumeDocument) => (slot: TextSlot) => {
  if (!("sectionId" in slot)) return doc.header[slot.kind];
  const section = doc.sections.find(({ id }) => id === slot.sectionId)!;
  if (!("entryId" in slot)) return section.heading;
  return section.entries.find(({ id }) => id === slot.entryId)![slot.kind];
};

const editing = (doc: ResumeDocument, extra: Partial<PageEditing> = {}): PageEditing => ({
  ...none,
  text: (slot) => ({ value: valueOf(doc)(slot), label: slot.kind, onChange: () => {} }),
  ...extra,
});

const render = (document: ResumeDocument, template: "classic" | "sidebar", value: PageEditing | null) => {
  const host = window.document.createElement("div");
  const root = createRoot(host);
  act(() =>
    root.render(
      <PageEditingContext value={value}>
        <ResumeTemplate document={document} paper="a4" design={{ ...DESIGN_DEFAULTS, template }} />
      </PageEditingContext>
    )
  );
  return host;
};

/** Elements, classes and text, without what only editing adds. */
const shape = (el: Element, depth = 0): string =>
  [
    `${" ".repeat(depth)}${el.tagName}.${[...el.classList].filter((name) => name !== "page-text").join(".")}`,
    ...[...el.childNodes].map((node) =>
      node instanceof Element ? shape(node, depth + 1) : `${" ".repeat(depth + 1)}${node.textContent!.replace(/\s+/g, " ")}`
    ),
  ].join("\n");

describe.each(["classic", "sidebar"] as const)("the templates, being edited: %s", (template) => {
  it.each([
    ["full", full],
    ["bare", bare],
  ])("have the same elements, classes and text: %s", (_, doc) => {
    expect(shape(render(doc, template, editing(doc)))).toBe(shape(render(doc, template, null)));
  });

  it("make every piece of text editable", () => {
    const texts = [...render(full, template, editing(full)).querySelectorAll(".page-text")].map((el) => el.textContent);
    expect(texts.sort()).toEqual(
      ["Sam & Co", "Engineer", "Experience", "Northwind", "Short summary", "Title only", "Empty", "Skills"].sort()
    );
  });

  it("say which section, entry and block is which", () => {
    const host = render(full, template, none);
    const values = (name: string) => [...host.querySelectorAll(`[${name}]`)].map((el) => `${el.className}:${el.getAttribute(name)}`);
    expect(values("data-section-id").sort()).toEqual([1, 2, 3, 4].map((id) => `rc-section:${id}`));
    expect(values("data-entry-id").sort()).toEqual([..."abcdef"].map((id) => `rc-entry:${id}`));
    expect(values("data-block").sort()).toEqual([
      "rc-header:header",
      "rc-heading:heading",
      ...Array.from({ length: 6 }, () => "rc-section-head:head"),
    ]);
  });

  it("render as printed where nothing is bound", () => {
    expect(shape(render(full, template, none))).toBe(shape(render(full, template, null)));
    expect(render(full, template, none).querySelector("[contenteditable]")).toBeNull();
  });

  it("take replacements that wrap the printed lines", () => {
    const value = editing(full, {
      line: (entry) => (entry.id === "a" ? <EntryLine entry={entry} /> : null),
      contact: () => <ContactLines header={full.header} stacked={template === "sidebar"} />,
    });
    expect(shape(render(full, template, value))).toBe(shape(render(full, template, null)));
  });

  it("put a replacement where there was nothing, too", () => {
    const value = editing(full, { line: (entry) => (entry.id === "c" ? <i className="line" /> : null) });
    expect(render(full, template, value).querySelector('[data-entry-id="c"] .rc-section-head > .line')).not.toBeNull();
  });

  it("replace only what is inside a body", () => {
    const value = editing(full, { body: (entry) => ("ac".includes(entry.id) ? <i>{entry.id}</i> : null) });
    const host = render(full, template, value);
    const body = (id: string) => host.querySelector(`[data-entry-id="${id}"] > .rc-body`)?.innerHTML;
    expect([body("a"), body("b"), body("c"), body("d")]).toEqual(["<i>a</i>", "<p>Untitled entry</p>", "<i>c</i>", undefined]);
  });

  it("offer an empty field that is open", () => {
    const value = editing(full, {
      text: (slot) =>
        slot.kind === "summary" && slot.entryId === "c"
          ? { value: "", label: "Summary", placeholder: "Add a summary", open: true, onChange: () => {} }
          : null,
    });
    expect(render(full, template, value).querySelector('[data-entry-id="c"] p.rc-summary')).not.toBeNull();
  });
});
