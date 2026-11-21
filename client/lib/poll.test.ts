import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollUntil, PollTimeoutError } from "./poll";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pollUntil", () => {
  it("resolves with the first value that is done", async () => {
    const values = ["pending", "processing", "succeeded"];
    const fetcher = vi.fn(async () => values.shift() as string);

    const result = pollUntil(fetcher, (value) => value === "succeeded", { intervalMs: 2000, timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(4000);

    await expect(result).resolves.toBe("succeeded");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects with a timeout error when it never finishes", async () => {
    const fetcher = vi.fn(async () => "pending");

    const result = pollUntil(fetcher, () => false, { intervalMs: 2000, timeoutMs: 5000 });
    const assertion = expect(result).rejects.toBeInstanceOf(PollTimeoutError);
    await vi.advanceTimersByTimeAsync(6000);

    await assertion;
  });

  it("stops polling once aborted", async () => {
    const fetcher = vi.fn(async () => "pending");
    const controller = new AbortController();

    const result = pollUntil(fetcher, () => false, { intervalMs: 2000, timeoutMs: 60_000, signal: controller.signal });
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.advanceTimersByTimeAsync(10_000);

    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
