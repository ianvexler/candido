import { afterEach, describe, expect, it, vi } from "vitest";
import { markPending, markSettled, trackSave, waitForSaves } from "./saveTracker";

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForSaves", () => {
  it("resolves true right away when nothing is pending", async () => {
    await expect(waitForSaves()).resolves.toBe(true);
  });

  it("resolves true once the last pending save settles", async () => {
    markPending("section-1");
    markPending("header");
    const waiting = waitForSaves();

    markSettled("section-1");
    let done = false;
    void waiting.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);

    markSettled("header");
    await expect(waiting).resolves.toBe(true);
  });

  it("resolves false when a save never settles before the timeout", async () => {
    vi.useFakeTimers();
    markPending("section-stuck");
    const waiting = waitForSaves(3000);

    vi.advanceTimersByTime(3000);

    await expect(waiting).resolves.toBe(false);
    markSettled("section-stuck");
  });

  it("ignores settling a key that was never pending", async () => {
    markSettled("never-pending");

    await expect(waitForSaves()).resolves.toBe(true);
  });
});

describe("trackSave", () => {
  it("waits for every overlapping save on the same key", async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    void trackSave("section-1", new Promise<void>((resolve) => (finishFirst = resolve)));
    void trackSave("section-1", new Promise<void>((resolve) => (finishSecond = resolve)));
    const waiting = waitForSaves();
    let done = false;
    void waiting.then(() => (done = true));

    finishFirst();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(false);

    finishSecond();
    await expect(waiting).resolves.toBe(true);
  });

  it("settles when the save fails and passes the failure on", async () => {
    const failing = trackSave("title", Promise.reject(new Error("offline")));

    await expect(failing).rejects.toThrow("offline");
    await expect(waitForSaves()).resolves.toBe(true);
  });
});
