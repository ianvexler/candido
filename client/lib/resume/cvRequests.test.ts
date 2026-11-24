import { afterEach, describe, expect, it, vi } from "vitest";
import { CurriculumSection, SectionEntry } from "@/lib/types";
import { createCvRequests, INVALID_DATES, MAX_INCLUDES, UNSAVED } from "./cvRequests";
import { waitForSaves } from "./saveTracker";
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
  };
  const order = () => shown.map(({ id }) => id);
  return { ...deps, edit, order, requests: createCvRequests(deps) };
};

afterEach(() => waitForSaves(1000));

describe("include", () => {
  const payload = { section_template_id: 10 };

  it("saves first, then shows the section's first copy", async () => {
    const { requests, flush, sendInclude, replace } = setup([section(3), section(1)]);
    await requests.include(payload);
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(sendInclude.mock.invocationCallOrder[0]);
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("shows a section the CV didn't have", async () => {
    const { requests, sendInclude, replace } = setup([]);
    sendInclude.mockResolvedValue([section(7)]);
    await requests.include(payload);
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
