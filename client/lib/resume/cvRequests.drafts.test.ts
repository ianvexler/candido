import type { IncludePayload } from "@/api/resources/curriculums/includeFromLibrary";
import type { TransferPayload, TransferResult } from "@/api/resources/curriculums/transferWithLibrary";
import { Curriculum, CurriculumSection, SectionEntry, SectionTemplate } from "@/lib/types";
import { afterEach, describe, expect, it } from "vitest";
import { createCvRequests, RequestStopped, TextKept } from "./cvRequests";
import { replaceItem } from "./items";
import { createDrafts, SectionDraft, SectionPatch } from "./sectionDrafts";
import { emptyEntry } from "./sectionEntries";
import { waitForSaves } from "./saveTracker";
import { valueIn } from "./transfer";

// The requests with the real drafts, and a server that answers when let.

const li = (id: string, text: string) => `<li data-cv-item="${id}">${text}</li>`;
const list = (x: string, y: string) => `<ul>${li("x", x)}${li("y", y)}</ul>`;
const entry = (id: string, content: string): SectionEntry => ({ ...emptyEntry(), id, title: id, content });
const section = (id: number, entries: SectionEntry[]) =>
  ({ id, section_type: "Work", section_template_id: id * 10, hidden: false, placement: null, base_items: {}, base_fields: {}, entries }) as unknown as CurriculumSection;

const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = () => {
  const server = new Map<number, CurriculumSection>([
    [1, section(1, [entry("a", list("X", "Y"))])],
    [2, section(2, [entry("b", list("P", "Q"))])],
  ]);
  const template = { ...section(10, [entry("a", list("Library", "Y"))]), id: 10 } as unknown as SectionTemplate;
  const gates: {
    saves: Map<number, Promise<void>>;
    before?: Promise<void>;
    after?: Promise<void>;
    /** Runs while the purpose is being changed, the first time. */
    duringPurpose?: () => void;
  } = { saves: new Map() };
  const purposes: { force: boolean; stored: string }[] = [];
  const saves: { id: number; patch: SectionPatch }[] = [];

  const drafts = createDrafts<CurriculumSection>({
    save: async ({ id }, patch) => {
      saves.push({ id, patch });
      await gates.saves.get(id);
      server.set(id, { ...server.get(id)!, ...patch } as CurriculumSection);
      return server.get(id)!;
    },
    onChange: () => undefined,
    onError: () => undefined,
    delayMs: 60_000,
  });
  drafts.load([...server.values()]);

  const requests = createCvRequests({
    ...drafts,
    templates: () => [template],
    takeTemplate: () => undefined,
    sendOrder: async () => undefined,
    sendInclude: async ({ item_id }: IncludePayload) => {
      const now = server.get(1)!;
      const content = now.entries[0].content.replace("</ul>", `${li(item_id!, "New")}</ul>`);
      if (!now.entries[0].content.includes(`"${item_id}"`)) server.set(1, { ...now, entries: [{ ...now.entries[0], content }] });
      return [...server.values()];
    },
    sendTransfer: async (id, payload: TransferPayload): Promise<TransferResult> => {
      await gates.before;
      const now = server.get(id)!;
      const conflict = valueIn(now, { entryId: payload.entry_id, itemId: payload.item_id }) !== payload.expected_cv;
      sent.push(payload);
      if (!conflict && payload.direction === "to_cv") {
        const content = replaceItem(now.entries[0].content, "x", li("x", "Library"));
        server.set(id, { ...now, entries: [{ ...now.entries[0], content }], base_items: { x: li("x", "Library") } });
      }
      const result = { conflict, section: server.get(id)!, section_template: template };
      await gates.after;
      return result;
    },
    // Leaves item y out of section 1, as a purpose would.
    sendPurpose: async (cv_label_id, force) => {
      const now = server.get(1)!;
      purposes.push({ force, stored: now.entries[0].content });
      const content = now.entries[0].content.replace('data-cv-item="y">', 'data-cv-item="y" data-cv-off="true">');
      server.set(1, { ...now, entries: [{ ...now.entries[0], content }] });
      const during = gates.duringPurpose;
      gates.duringPurpose = undefined;
      during?.();
      return { id: 1, cv_label_id, sections: [...server.values()] } as unknown as Curriculum;
    },
  });
  const sent: TransferPayload[] = [];
  const type = (id: number, content: string) =>
    drafts.change(id, ({ entries }: SectionDraft) => ({ entries: [{ ...entries[0], content }] }));
  const shown = (id = 1) => drafts.current().find((item) => item.id === id)!.entries[0].content;
  const stored = (id = 1) => server.get(id)!.entries[0].content;
  return { drafts, requests, gates, saves, sent, purposes, type, shown, stored };
};

const X = { sectionId: 1, entryId: "a", itemId: "x" };

/** Section 1 is clean and typed in while section 2 is still being saved. */
const typeDuringSlowSave = async (all: ReturnType<typeof setup>, start: () => Promise<unknown>, content: string) => {
  const slow = gate();
  all.gates.saves.set(2, slow.opened);
  all.type(2, list("P2", "Q"));
  const done = start();
  await settle();
  all.type(1, content);
  slow.open();
  await done;
};

afterEach(() => waitForSaves(1000));

describe("typing while another section is being saved", () => {
  it("survives a pull into the same entry", async () => {
    const all = setup();
    await typeDuringSlowSave(all, () => all.requests.transfer(X, "to_cv"), list("X", "Typed"));
    expect(all.shown()).toBe(list("Library", "Typed"));
    await all.drafts.flush();
    expect(all.stored()).toBe(list("Library", "Typed"));
  });

  it("is what goes to the library", async () => {
    const all = setup();
    await typeDuringSlowSave(all, () => all.requests.transfer(X, "to_library"), list("Typed", "Y"));
    expect(all.sent).toHaveLength(1);
    expect(all.sent[0].expected_cv).toBe(li("x", "Typed"));
  });

  it("survives an include into the same entry", async () => {
    const all = setup();
    const include = () => all.requests.include({ section_template_id: 10, entry_id: "a", item_id: "n" });
    await typeDuringSlowSave(all, include, list("X", "Typed"));
    const expected = list("X", "Typed").replace("</ul>", `${li("n", "New")}</ul>`);
    expect(all.shown()).toBe(expected);
    expect(all.stored()).toBe(expected);
  });

  it("stops everything if it can't be saved", async () => {
    const all = setup();
    const slow = gate();
    all.gates.saves.set(2, slow.opened);
    all.type(2, list("P2", "Q"));
    const done = all.requests.transfer(X, "to_library");
    await settle();
    all.gates.saves.set(1, Promise.reject(new Error("offline")));
    all.type(1, list("Typed", "Y"));
    slow.open();
    await expect(done).rejects.toBeInstanceOf(RequestStopped);
    expect(all.sent).toEqual([]);
  });
});

describe("changing the purpose", () => {
  const leftOut = (content: string) => content.replace('data-cv-item="y">', 'data-cv-item="y" data-cv-off="true">');

  it("saves what waits to be saved first, so the server compares against it", async () => {
    const all = setup();
    all.type(1, list("X", "Typed"));
    await all.requests.changePurpose(5, false);
    expect(all.purposes).toEqual([{ force: false, stored: list("X", "Typed") }]);
    expect(all.shown()).toBe(leftOut(list("X", "Typed")));
  });

  it("keeps what was typed while it was being changed, and ticks it again", async () => {
    const all = setup();
    all.gates.duringPurpose = () => all.type(1, list("X", "Typed"));
    await all.requests.changePurpose(5, false);
    expect(all.purposes.map(({ force }) => force)).toEqual([false, true]);
    expect(all.shown()).toBe(leftOut(list("X", "Typed")));
    expect(all.stored()).toBe(leftOut(list("X", "Typed")));
  });
});

describe("a pull whose text was typed over", () => {
  it.each(["before", "after"] as const)("still saves the old text when restored (held %s)", async (when) => {
    const all = setup();
    const held = gate();
    all.gates[when] = held.opened;
    const done = all.requests.transfer(X, "to_cv");
    await settle();
    all.type(1, list("Typed", "Y"));
    held.open();
    await expect(done).rejects.toBeInstanceOf(TextKept);
    all.type(1, list("X", "Y"));
    await all.drafts.flush();
    expect(all.shown()).toBe(list("X", "Y"));
    expect(all.stored()).toBe(list("X", "Y"));
  });

  it("is tried again after a failed save", async () => {
    const all = setup();
    const held = gate();
    all.gates.after = held.opened;
    const done = all.requests.transfer(X, "to_cv");
    await settle();
    all.type(1, list("Typed", "Y"));
    held.open();
    await expect(done).rejects.toBeInstanceOf(TextKept);
    all.type(1, list("X", "Y"));
    all.gates.saves.set(1, Promise.reject(new Error("offline")));
    expect(await all.drafts.flush()).toBe(false);
    all.gates.saves.delete(1);
    expect(await all.drafts.flush()).toBe(true);
    expect(all.stored()).toBe(list("X", "Y"));
  });
});

it("pulls into what a later save put back", async () => {
  const all = setup();
  const held = gate();
  all.gates.after = held.opened;
  const done = all.requests.transfer(X, "to_cv");
  await settle();
  all.type(1, list("X", "Typed"));
  await all.drafts.flush();
  expect(all.stored()).toBe(list("X", "Typed"));
  held.open();
  await done;
  await all.drafts.flush();
  expect(all.shown()).toBe(list("Library", "Typed"));
  expect(all.stored()).toBe(list("Library", "Typed"));
});

describe("flush", () => {
  it("goes on until nothing is unsaved", async () => {
    const all = setup();
    await typeDuringSlowSave(all, () => all.drafts.flush(), list("X", "Typed"));
    expect(all.stored()).toBe(list("X", "Typed"));
    expect(all.drafts.isSaved(1)).toBe(true);
  });
});
