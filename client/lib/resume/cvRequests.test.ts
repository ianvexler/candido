import { afterEach, describe, expect, it, vi } from "vitest";
import { Curriculum, CurriculumSection, SectionEntry, SectionTemplate } from "@/lib/types";
import {
  createCvRequests,
  CHANGED_ELSEWHERE,
  INVALID_DATES,
  TextKept,
  MAX_INCLUDES,
  PURPOSE_UNSAVED,
  TRANSFER_INVALID_DATES,
  TRANSFER_UNSAVED,
  UNSAVED,
} from "./cvRequests";
import { waitForSaves } from "./saveTracker";
import type { TransferResult } from "@/api/resources/curriculums/transferWithLibrary";
import { emptyEntry } from "./sectionEntries";

const section = (id: number, changes: Partial<CurriculumSection> = {}) =>
  ({ id, section_template_id: 10, entries: [emptyEntry()], ...changes }) as CurriculumSection;
const invalid: SectionEntry = { ...emptyEntry(), start_date: "2024-02-01", end_date: "2023-02-01" };

const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (initial = [section(1), section(2, { section_template_id: 20 })]) => {
  let shown = initial;
  const edit = (id: number, changes: Partial<CurriculumSection> = {}) => {
    shown = shown.map((item) => (item.id === id ? { ...item, ...changes } : item));
  };
  const deps = {
    current: () => shown,
    flush: vi.fn(async () => true),
    replace: vi.fn(),
    reorder: vi.fn((ids: number[]) => {
      shown = [...shown].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    }),
    sendInclude: vi.fn(async () => shown.map((item) => ({ ...item }))),
    sendOrder: vi.fn(async (ids: number[]): Promise<unknown> => ids),
    saved: vi.fn((id: number) => shown.find((item) => item.id === id)),
    change: vi.fn(),
    setRecord: vi.fn(),
    isSaved: vi.fn(() => true),
    templates: vi.fn((): SectionTemplate[] => []),
    takeTemplate: vi.fn(),
    sendTransfer: vi.fn(async (): Promise<TransferResult> => ({ conflict: false, section: section(1), section_template: null })),
    sendPurpose: vi.fn(
      async (cv_label_id: number | null, force: boolean): Promise<Curriculum> =>
        ({ id: 1, cv_label_id, force, sections: [...shown].reverse().map((item) => ({ ...item })) }) as unknown as Curriculum
    ),
  };
  const order = () => shown.map(({ id }) => id);
  return { ...deps, edit, order, requests: createCvRequests(deps) };
};

afterEach(() => waitForSaves(1000));

describe("changePurpose", () => {
  it("saves first, then shows the sections as ticked, in the server's order", async () => {
    const { requests, flush, sendPurpose, replace, order } = setup();
    const curriculum = await requests.changePurpose(5, false);
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(sendPurpose.mock.invocationCallOrder[0]);
    expect(sendPurpose).toHaveBeenCalledWith(5, false);
    expect(replace).toHaveBeenCalledTimes(2);
    expect(order()).toEqual([2, 1]);
    expect(curriculum.cv_label_id).toBe(5);
  });

  it("sends nothing after a failed save", async () => {
    const { requests, flush, sendPurpose } = setup();
    flush.mockResolvedValue(false);
    await expect(requests.changePurpose(5, false)).rejects.toThrow(PURPOSE_UNSAVED);
    expect(sendPurpose).not.toHaveBeenCalled();
  });

  it("shows nothing when the server asks first", async () => {
    const { requests, sendPurpose, replace } = setup();
    const conflict = Object.assign(new Error("409"), { response: { status: 409 } });
    sendPurpose.mockRejectedValueOnce(conflict);
    await expect(requests.changePurpose(5, false)).rejects.toBe(conflict);
    expect(replace).not.toHaveBeenCalled();
  });

  it("saves and ticks again, without asking, when the CV was edited meanwhile", async () => {
    const { requests, edit, flush, sendPurpose, replace } = setup();
    sendPurpose.mockImplementationOnce(async () => {
      edit(1);
      return { id: 1, cv_label_id: 5, sections: [section(1)] } as unknown as Curriculum;
    });
    await requests.changePurpose(5, false);
    expect(flush).toHaveBeenCalledTimes(2);
    // Saving the edit sent its old ticks too.
    expect(sendPurpose.mock.calls).toEqual([
      [5, false],
      [5, true],
    ]);
    expect(replace).toHaveBeenCalledTimes(2);
  });
});

describe("include", () => {
  const payload = { section_template_id: 10 };

  it("saves first, then shows the section's first copy", async () => {
    const { requests, flush, sendInclude, replace } = setup([section(3), section(1)]);
    await requests.include(payload);
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(sendInclude.mock.invocationCallOrder[0]);
    expect(replace).toHaveBeenCalledOnce();
    // The server goes by position too.
    expect(replace).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });

  it("shows a section the CV didn't have", async () => {
    const { requests, sendInclude, replace } = setup([]);
    sendInclude.mockResolvedValue([section(7)]);
    // Which section it is in, for whoever places it.
    await expect(requests.include(payload)).resolves.toBe(7);
    expect(replace).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("sends nothing after a failed save", async () => {
    const { requests, flush, sendInclude } = setup();
    flush.mockResolvedValue(false);
    await expect(requests.include(payload)).rejects.toThrow(UNSAVED);
    expect(sendInclude).not.toHaveBeenCalled();
  });

  it("sends nothing while the section has an invalid date range, which isn't saved", async () => {
    const { requests, sendInclude, replace } = setup([section(1, { entries: [invalid] })]);
    await expect(requests.include(payload)).rejects.toThrow(INVALID_DATES);
    expect(sendInclude).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("ignores invalid dates in other sections", async () => {
    const { requests, replace } = setup([section(1), section(2, { section_template_id: 20, entries: [invalid] })]);
    await requests.include(payload);
    expect(replace).toHaveBeenCalledOnce();
  });

  it("saves and includes again when the section was edited meanwhile", async () => {
    const { requests, edit, flush, sendInclude, replace } = setup();
    sendInclude.mockImplementationOnce(async () => {
      edit(1);
      return [section(1)];
    });
    await requests.include(payload);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(sendInclude).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledOnce();
  });

  it("stops when the edit meanwhile made the dates invalid", async () => {
    const { requests, edit, sendInclude, replace } = setup();
    sendInclude.mockImplementationOnce(async () => {
      edit(1, { entries: [invalid] });
      return [section(1)];
    });
    await expect(requests.include(payload)).rejects.toThrow(INVALID_DATES);
    expect(replace).not.toHaveBeenCalled();
  });

  it("doesn't mind edits of other sections", async () => {
    const { requests, edit, sendInclude, replace } = setup();
    sendInclude.mockImplementationOnce(async () => {
      edit(2);
      return [section(1)];
    });
    await requests.include(payload);
    expect(sendInclude).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledOnce();
  });

  it("gives up on a section that keeps changing, without replacing it", async () => {
    const { requests, edit, sendInclude, replace } = setup();
    sendInclude.mockImplementation(async () => {
      edit(1);
      return [section(1)];
    });
    await expect(requests.include(payload)).rejects.toThrow();
    expect(sendInclude).toHaveBeenCalledTimes(MAX_INCLUDES);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("the queue", () => {
  it("runs one request at a time, in order, and goes on after a failure", async () => {
    const { requests } = setup();
    const log: string[] = [];
    const first = deferred();
    const a = requests.enqueue(async () => {
      log.push("a");
      await first.promise;
    });
    const b = requests.enqueue(async () => log.push("b"));
    await settle();
    expect(log).toEqual(["a"]);
    first.reject(new Error("no"));
    await expect(a).rejects.toThrow("no");
    await b;
    expect(log).toEqual(["a", "b"]);
  });

  it("includes only after a reorder before it", async () => {
    const { requests, sendOrder, sendInclude } = setup();
    const saving = deferred<unknown>();
    sendOrder.mockReturnValueOnce(saving.promise);
    const ordered = requests.orderSections([2, 1]);
    const included = requests.include({ section_template_id: 10 });
    await settle();
    expect(sendInclude).not.toHaveBeenCalled();
    saving.resolve(null);
    await Promise.all([ordered, included]);
    expect(sendInclude).toHaveBeenCalledOnce();
  });
});

describe("orderSections", () => {
  const three = () => setup([section(1), section(2), section(3)]);

  it("sends nothing when the order is the same", async () => {
    const { requests, sendOrder } = three();
    await requests.orderSections([1, 2, 3]);
    expect(sendOrder).not.toHaveBeenCalled();
  });

  it("goes back to the saved order when saving fails", async () => {
    const { requests, sendOrder, order } = three();
    sendOrder.mockRejectedValueOnce(new Error("no"));
    await expect(requests.orderSections([2, 1, 3])).rejects.toThrow();
    expect(order()).toEqual([1, 2, 3]);
  });

  it("keeps a later move when an earlier one fails", async () => {
    const { requests, sendOrder, order } = three();
    const saving = deferred<unknown>();
    sendOrder.mockReturnValueOnce(saving.promise);
    const a = requests.orderSections([2, 1, 3]);
    const b = requests.orderSections([2, 3, 1]);
    await settle();
    saving.reject(new Error("no"));
    await expect(a).rejects.toThrow();
    await b;
    expect(sendOrder).toHaveBeenLastCalledWith([2, 3, 1]);
    expect(order()).toEqual([2, 3, 1]);
  });

  it("goes back to the last saved order when several fail", async () => {
    const { requests, sendOrder, order } = three();
    await requests.orderSections([1, 3, 2]);
    sendOrder.mockRejectedValue(new Error("no"));
    const a = requests.orderSections([3, 1, 2]);
    const b = requests.orderSections([3, 2, 1]);
    await Promise.allSettled([a, b]);
    expect(order()).toEqual([1, 3, 2]);
  });

  it("goes back to the earlier move if only the later one fails", async () => {
    const { requests, sendOrder, order } = three();
    const saving = deferred<unknown>();
    sendOrder.mockReturnValueOnce(saving.promise).mockRejectedValueOnce(new Error("no"));
    const a = requests.orderSections([2, 1, 3]);
    await settle();
    const b = requests.orderSections([2, 3, 1]);
    saving.resolve(null);
    await a;
    await expect(b).rejects.toThrow();
    expect(order()).toEqual([2, 1, 3]);
  });
});

describe("transfer", () => {
  const li = (text: string) => `<li data-cv-item="x">${text}</li>`;
  const written = (text: string, title = "T", id = "e") => ({ ...emptyEntry(), id, title, content: `<ul>${li(text)}</ul>` });
  const template = (text: string) => ({ id: 10, entries: [{ ...written(text), id: "other" }] }) as SectionTemplate;
  const ofItem = { sectionId: 1, entryId: "e", itemId: "x" };
  const result = (text: string, changes: Partial<TransferResult> = {}): TransferResult => ({
    conflict: false,
    section: section(1, { entries: [written(text)], base_items: { x: li(text) } }),
    section_template: template(text),
    ...changes,
  });
  const start = () => {
    const all = setup([section(1, { entries: [written("CV")] })]);
    all.templates.mockReturnValue([template("Library")]);
    all.sendTransfer.mockResolvedValue(result("CV"));
    return all;
  };

  it("saves, sends what each side has, then shows both records", async () => {
    const { requests, flush, saved, sendTransfer, replace, takeTemplate } = start();
    // What the server stored may be written differently.
    saved.mockReturnValue(section(1, { entries: [written("Stored")] }));
    await requests.transfer(ofItem, "to_library");
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(sendTransfer.mock.invocationCallOrder[0]);
    expect(sendTransfer).toHaveBeenCalledWith(1, {
      direction: "to_library",
      entry_id: "e",
      item_id: "x",
      expected_cv: li("Stored"),
      expected_library: li("Library"),
    });
    expect(replace).toHaveBeenCalledWith(result("CV").section);
    expect(takeTemplate).toHaveBeenCalledWith(10, result("CV").section_template);
  });

  it("sends the library text there was when it was asked for", async () => {
    const { requests, templates, flush, sendTransfer } = start();
    flush.mockImplementationOnce(async () => {
      templates.mockReturnValue([template("Newer")]);
      return true;
    });
    await requests.transfer(ofItem, "to_library");
    expect(sendTransfer).toHaveBeenCalledWith(1, expect.objectContaining({ expected_library: li("Library") }));
  });

  it("sends fields, and null for what the library lacks", async () => {
    const { requests, sendTransfer } = start();
    await requests.transfer({ sectionId: 1, entryId: "e" }, "to_library");
    expect(sendTransfer).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ expected_cv: expect.objectContaining({ title: "T", role: null }), expected_library: null })
    );
  });

  it("sends nothing unsaved or with invalid dates", async () => {
    const first = start();
    first.flush.mockResolvedValue(false);
    await expect(first.requests.transfer(ofItem, "to_library")).rejects.toThrow(TRANSFER_UNSAVED);
    const second = start();
    second.edit(1, { entries: [written("CV"), invalid] });
    await expect(second.requests.transfer(ofItem, "to_library")).rejects.toThrow(TRANSFER_INVALID_DATES);
    expect(first.sendTransfer).not.toHaveBeenCalled();
    expect(second.sendTransfer).not.toHaveBeenCalled();
  });

  it("sends nothing for what is gone", async () => {
    const { requests, sendTransfer } = start();
    await requests.transfer({ ...ofItem, sectionId: 9 }, "to_library");
    await requests.transfer({ ...ofItem, itemId: "gone" }, "to_library");
    expect(sendTransfer).not.toHaveBeenCalled();
  });

  it("shows both records and says so when it changed elsewhere", async () => {
    const { requests, sendTransfer, replace, takeTemplate } = start();
    const refused = result("Other", { conflict: true, section_template: null });
    sendTransfer.mockResolvedValue(refused);
    await expect(requests.transfer(ofItem, "to_library")).rejects.toThrow(CHANGED_ELSEWHERE);
    expect(replace).toHaveBeenCalledWith(refused.section);
    expect(takeTemplate).toHaveBeenCalledWith(10, null);
  });

  it("keeps what was edited during the request", async () => {
    const { requests, edit, sendTransfer, replace, change, setRecord, takeTemplate } = start();
    sendTransfer.mockImplementationOnce(async () => {
      edit(1, { entries: [written("CV", "Typed")] });
      return result("Library");
    });
    await requests.transfer(ofItem, "to_cv");
    expect(replace).not.toHaveBeenCalled();
    expect(takeTemplate).toHaveBeenCalledOnce();
    expect(setRecord).toHaveBeenCalledWith(1, expect.objectContaining({ base_items: { x: li("Library") } }), true);
    const pull = change.mock.calls[0][1];
    expect(pull(section(1, { entries: [written("CV", "Typed")] }))).toEqual({ entries: [written("Library", "Typed")] });
  });

  it("pulls nothing over text typed before it could be sent", async () => {
    const { requests, edit, flush, sendTransfer } = start();
    flush.mockImplementationOnce(async () => {
      edit(1, { entries: [written("Typed")] });
      return true;
    });
    await expect(requests.transfer(ofItem, "to_cv")).rejects.toBeInstanceOf(TextKept);
    expect(sendTransfer).not.toHaveBeenCalled();
  });

  it("says so when the text was typed over during the request", async () => {
    const { requests, edit, change, sendTransfer } = start();
    change.mockImplementation((_id, pull) => pull(section(1, { entries: [written("Typed")] })));
    sendTransfer.mockImplementationOnce(async () => {
      edit(1, { entries: [written("Typed")] });
      return result("Library");
    });
    await expect(requests.transfer(ofItem, "to_cv")).rejects.toBeInstanceOf(TextKept);
  });

  it("goes again when it was refused and edited here meanwhile", async () => {
    const { requests, edit, sendTransfer, replace } = start();
    sendTransfer.mockImplementationOnce(async () => {
      edit(1, { entries: [written("Typed")] });
      return result("CV", { conflict: true });
    });
    await requests.transfer(ofItem, "to_library");
    expect(sendTransfer).toHaveBeenCalledTimes(2);
    expect(sendTransfer).toHaveBeenLastCalledWith(1, expect.objectContaining({ expected_cv: li("Typed") }));
    expect(replace).toHaveBeenCalledOnce();
  });

  it("saves again when typed in since, and gives up in the end", async () => {
    const once = start();
    once.isSaved.mockReturnValueOnce(false);
    await once.requests.transfer(ofItem, "to_library");
    expect(once.flush).toHaveBeenCalledTimes(2);
    expect(once.sendTransfer).toHaveBeenCalledOnce();
    const never = start();
    never.isSaved.mockReturnValue(false);
    await expect(never.requests.transfer(ofItem, "to_library")).rejects.toThrow();
    await expect(never.requests.include({ section_template_id: 10 })).rejects.toThrow();
    expect(never.sendTransfer).not.toHaveBeenCalled();
    expect(never.sendInclude).not.toHaveBeenCalled();
  });

  it("waits its turn", async () => {
    const { requests, sendTransfer } = start();
    const first = deferred();
    const a = requests.enqueue(() => first.promise);
    const b = requests.transfer(ofItem, "to_library");
    await settle();
    expect(sendTransfer).not.toHaveBeenCalled();
    first.resolve();
    await Promise.all([a, b]);
    expect(sendTransfer).toHaveBeenCalledOnce();
  });
});
