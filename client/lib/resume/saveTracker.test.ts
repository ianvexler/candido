import { afterEach, describe, expect, it, vi } from "vitest";
import { markPending, markSettled, waitForSaves } from "./saveTracker";

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
