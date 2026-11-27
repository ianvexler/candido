import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCvDesign, CvLook, LookPayload } from "./cvDesign";
import { DESIGN_DEFAULTS } from "./design";
import { waitForSaves } from "./saveTracker";

const look = (accent: string) => ({ ...DESIGN_DEFAULTS, accent });

const setUp = () => {
  const requests: { payload: LookPayload; resolve: () => void; reject: () => void }[] = [];
  const save = vi.fn(
    (payload: LookPayload) =>
      new Promise<void>((resolve, reject) => requests.push({ payload, resolve, reject: () => reject(new Error("no")) }))
  );
  const left: LookPayload[] = [];
  const shown: CvLook[] = [];
  const errors: string[] = [];
  const owner = createCvDesign({
    value: { design: DESIGN_DEFAULTS, paper: "a4" },
    save,
    saveOnLeave: (payload) => left.push(payload),
    onChange: (next) => shown.push(next),
    onError: (_, what) => errors.push(what),
  });
  const settle = () => vi.advanceTimersByTimeAsync(0);
  return { owner, requests, left, shown, errors, settle };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createCvDesign", () => {
  it("shows a change at once and saves the last one after a pause", async () => {
    const { owner, requests, shown } = setUp();
    owner.changeDesign(look("#111111"));
    await vi.advanceTimersByTimeAsync(400);
    owner.changeDesign(look("#222222"));
    expect(shown.map(({ design }) => design.accent)).toEqual(["#111111", "#222222"]);
    await vi.advanceTimersByTimeAsync(499);
    expect(requests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests.map(({ payload }) => payload.styles?.accent)).toEqual(["#222222"]);
    requests[0].resolve();
    expect(await owner.flush()).toBe(true);
  });

  it("numbers saves in order and sends one at a time", async () => {
    const { owner, requests, settle } = setUp();
    owner.changeDesign(look("#111111"));
    await vi.advanceTimersByTimeAsync(500);
    owner.changeDesign(look("#222222"));
    await vi.advanceTimersByTimeAsync(500);
    expect(requests).toHaveLength(1);
    requests[0].resolve();
    await settle();
    expect(requests.map(({ payload }) => payload.styles_seq)).toEqual([1, 2]);
    expect(requests[0].payload.styles_writer).toBe(requests[1].payload.styles_writer);
    requests[1].resolve();
    await settle();
  });

  it("is pending until saved", async () => {
    const { owner, requests } = setUp();
    owner.changeDesign(look("#111111"));
    const saved = waitForSaves(10_000);
    let done = false;
    void saved.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(600);
    expect(done).toBe(false);
    requests[0].resolve();
    expect(await saved).toBe(true);
  });

  it("flushes without the pause, along with what is on its way", async () => {
    const { owner, requests, settle } = setUp();
    owner.changePaper("letter");
    owner.changeDesign(look("#111111"));
    let result: boolean | null = null;
    void owner.flush().then((each) => (result = each));
    await settle();
    requests[0].resolve();
    await settle();
    expect(result).toBeNull();
    requests[1].resolve();
    await settle();
    expect(result).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests).toHaveLength(2);
  });

  it("waits in a flush for what is changed during it", async () => {
    const { owner, requests, settle } = setUp();
    owner.changeDesign(look("#111111"));
    let result: boolean | null = null;
    void owner.flush().then((each) => (result = each));
    await settle();
    owner.changePaper("letter");
    requests[0].resolve();
    await settle();
    expect(result).toBeNull();
    requests[1].resolve();
    await settle();
    expect(result).toBe(true);
  });

  it("sends a design that couldn't be saved again on a flush", async () => {
    const { owner, requests, errors, shown, settle } = setUp();
    owner.changeDesign(look("#111111"));
    let result: boolean | null = null;
    void owner.flush().then((each) => (result = each));
    await settle();
    requests[0].reject();
    await settle();
    expect([result, errors]).toEqual([false, ["design"]]);
    expect(shown.at(-1)?.design.accent).toBe("#111111");
    void owner.flush().then((each) => (result = each));
    await settle();
    requests[1].resolve();
    await settle();
    expect(result).toBe(true);
    expect(requests[1].payload.styles_seq).toBe(2);
  });

  it("doesn't let a failed save shorten a newer change's pause", async () => {
    const { owner, requests, settle } = setUp();
    owner.changeDesign(look("#111111"));
    await vi.advanceTimersByTimeAsync(500);
    owner.changeDesign(look("#222222"));
    requests[0].reject();
    await settle();
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(requests[1].payload.styles?.accent).toBe("#222222");
    requests[1].resolve();
    await settle();
  });

  it("puts the paper back when it can't be saved, keeping the design", async () => {
    const { owner, requests, shown, errors, settle } = setUp();
    owner.changePaper("letter");
    expect(shown.at(-1)?.paper).toBe("letter");
    owner.changeDesign(look("#111111"));
    await settle();
    requests[0].reject();
    await settle();
    expect(shown.at(-1)).toEqual({ design: look("#111111"), paper: "a4" });
    expect(errors).toEqual(["paper"]);
    owner.load({ design: DESIGN_DEFAULTS, paper: "a4" });
  });

  it("keeps a newer paper when an older one fails", async () => {
    const { owner, requests, shown, settle } = setUp();
    owner.changePaper("letter");
    owner.changePaper("a4");
    await settle();
    requests[0].reject();
    await settle();
    requests[1].resolve();
    await settle();
    expect(shown.at(-1)?.paper).toBe("a4");
    expect(await owner.flush()).toBe(true);
  });

  it("sends what is unsaved when the page goes away, numbered after what is on its way", async () => {
    const { owner, requests, left } = setUp();
    owner.leave();
    expect(left).toEqual([]);
    owner.changeDesign(look("#111111"));
    await vi.advanceTimersByTimeAsync(500);
    owner.changeDesign(look("#222222"));
    owner.changePaper("letter");
    owner.leave();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ styles: { accent: "#222222", paper: "letter" }, styles_seq: 3 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests).toHaveLength(1);
    // Back from the browser's cache.
    void owner.flush();
    requests[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    requests[1].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests[2].payload).toMatchObject({ styles: { accent: "#222222" }, styles_seq: 4 });
    requests[2].resolve();
  });

  it("sends what is waiting when its page is left inside the app", async () => {
    const { owner, requests, settle } = setUp();
    owner.changeDesign(look("#111111"));
    owner.dispose();
    await settle();
    expect(requests.map(({ payload }) => payload.styles?.accent)).toEqual(["#111111"]);
    owner.dispose();
    requests[0].resolve();
    await settle();
    expect(requests).toHaveLength(1);
  });

  it("numbers paper saves, with the design as it is", async () => {
    const { owner, requests, settle } = setUp();
    owner.changeDesign(look("#111111"));
    owner.changePaper("letter");
    await settle();
    expect(requests[0].payload).toMatchObject({ styles: { accent: "#111111", paper: "letter" }, styles_seq: 1 });
    expect(requests[0].payload.styles_writer).toBeTruthy();
    requests[0].resolve();
    await vi.advanceTimersByTimeAsync(1000);
    // It had the design too.
    expect(requests).toHaveLength(1);
    expect(await owner.flush()).toBe(true);
  });

  it("doesn't put back a paper that leaving has sent, and sends it again on a flush", async () => {
    const { owner, requests, shown, left, settle } = setUp();
    owner.changePaper("letter");
    await settle();
    owner.leave();
    expect(left[0].styles?.paper).toBe("letter");
    requests[0].reject();
    await settle();
    expect(shown.at(-1)?.paper).toBe("letter");
    let result: boolean | null = null;
    void owner.flush().then((each) => (result = each));
    await settle();
    expect(requests[1].payload).toMatchObject({ styles: { paper: "letter" }, styles_seq: 3 });
    requests[1].resolve();
    await settle();
    expect(result).toBe(true);
  });
});
