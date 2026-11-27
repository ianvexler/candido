import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { flushAll } from "./flushAll";
import { markPending, markSettled } from "./saveTracker";

const yes = () => Promise.resolve(true);
const no = () => Promise.resolve(false);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  markSettled("slow");
  vi.useRealTimers();
});

it("says when everything is saved", async () => {
  expect(await flushAll([yes, yes, yes])).toBe("saved");
});

it.each([
  ["sections", [no, yes, yes]],
  ["header", [yes, no, yes]],
  ["design", [yes, yes, no]],
])("says the %s couldn't be saved", async (_, flushes) => {
  expect(await flushAll(flushes)).toBe("failed");
});

const later = async (flushes: (() => Promise<boolean>)[]) => {
  const result = flushAll(flushes);
  await vi.advanceTimersByTimeAsync(3000);
  return result;
};

it("doesn't wait forever for what is still saving", async () => {
  markPending("slow");
  expect(await later([yes, () => new Promise<boolean>(() => {})])).toBe("saving");
});

it("says one couldn't be saved though another is still saving", async () => {
  markPending("slow");
  expect(await later([no, () => new Promise<boolean>(() => {})])).toBe("failed");
});
