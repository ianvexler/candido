import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHeaderDraft, HeaderValues } from "./headerDraft";
import { waitForSaves } from "./saveTracker";

type Pending = { values: HeaderValues; resolve: () => void; reject: (error: unknown) => void };

let pendingSaves: Pending[] = [];

const setup = (initial: HeaderValues = {}) => {
  const saves: Pending[] = [];
  const onError = vi.fn();
  const onChange = vi.fn();
  const draft = createHeaderDraft<HeaderValues>({
    value: initial,
    save: (values) => new Promise<void>((resolve, reject) => saves.push({ values, resolve, reject })),
    onChange,
    onError,
  });
  pendingSaves = saves;
  return { draft, saves, onError, onChange };
};

const settled = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const isIdle = async () => {
  const waiting = waitForSaves(1);
  await vi.advanceTimersByTimeAsync(1);
  return waiting;
};

beforeEach(() => void vi.useFakeTimers());
afterEach(async () => {
  // What is pending is the same for all.
  pendingSaves.forEach(({ resolve }) => resolve());
  await settled();
  vi.useRealTimers();
});

describe("createHeaderDraft", () => {
  it("saves once, after a pause", () => {
    const { draft, saves, onChange } = setup();
    draft.change(() => ({ name: "S" }));
    vi.advanceTimersByTime(500);
    draft.change((now) => ({ ...now, headline: "H" }));
    vi.advanceTimersByTime(599);
    expect(saves).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(saves.map(({ values }) => values)).toEqual([{ name: "S", headline: "H" }]);
    expect(onChange).toHaveBeenLastCalledWith({ name: "S", headline: "H" });
  });

  it("sends one at a time, then the newest", async () => {
    const { draft, saves } = setup();
    draft.change(() => ({ name: "A" }));
    vi.advanceTimersByTime(600);
    draft.change(() => ({ name: "B" }));
    vi.advanceTimersByTime(600);
    draft.change(() => ({ name: "C" }));
    vi.advanceTimersByTime(600);
    expect(saves).toHaveLength(1);
    saves[0].resolve();
    await settled();
    expect(saves.map(({ values }) => values.name)).toEqual(["A", "C"]);
    saves[1].resolve();
    await settled();
    expect(saves).toHaveLength(2);
  });

  it("keeps what failed and sends it with the next change", async () => {
    const { draft, saves, onError } = setup({ phone: "1" });
    draft.change((now) => ({ ...now, name: "A" }));
    vi.advanceTimersByTime(600);
    saves[0].reject(new Error("offline"));
    await settled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(draft.current()).toEqual({ phone: "1", name: "A" });
    draft.change((now) => ({ ...now, headline: "H" }));
    vi.advanceTimersByTime(600);
    expect(saves[1].values).toEqual({ phone: "1", name: "A", headline: "H" });
  });

  it("flushes what is unsaved, failures included, and says if it was", async () => {
    const { draft, saves } = setup();
    expect(await draft.flush()).toBe(true);
    expect(saves).toHaveLength(0);

    draft.change(() => ({ name: "A" }));
    const first = draft.flush();
    expect(saves).toHaveLength(1);
    saves[0].reject(new Error("offline"));
    expect(await first).toBe(false);

    const second = draft.flush();
    draft.change(() => ({ name: "B" }));
    saves[1].resolve();
    await settled();
    saves[2].resolve();
    expect(await second).toBe(true);
    expect(saves.map(({ values }) => values.name)).toEqual(["A", "A", "B"]);
    vi.advanceTimersByTime(2000);
    expect(saves).toHaveLength(3);
  });

  it("is pending from the edit until it is saved", async () => {
    const { draft, saves } = setup();
    draft.change(() => ({ name: "A" }));
    expect(await isIdle()).toBe(false);
    vi.advanceTimersByTime(600);
    expect(await isIdle()).toBe(false);
    saves[0].resolve();
    await settled();
    expect(await isIdle()).toBe(true);
  });

  it("is sent on leaving, after a request on its way", async () => {
    const { draft, saves } = setup();
    draft.change(() => ({ name: "A" }));
    vi.advanceTimersByTime(600);
    draft.change(() => ({ name: "B" }));
    draft.dispose();
    expect(saves).toHaveLength(1);
    saves[0].resolve();
    await settled();
    expect(saves[1].values).toEqual({ name: "B" });
  });

  it("starts over with a loaded value", async () => {
    const { draft, saves, onChange } = setup();
    draft.change(() => ({ name: "A" }));
    draft.load({ name: "Imported" });
    expect(onChange).toHaveBeenLastCalledWith({ name: "Imported" });
    vi.advanceTimersByTime(600);
    draft.dispose();
    expect(saves).toHaveLength(0);
    expect(await isIdle()).toBe(true);
  });
});
