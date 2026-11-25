import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEditChannel, EditTarget } from "./editChannel";

const target: EditTarget = { sectionId: 1, what: "title", entryId: "a" };
let channel: ReturnType<typeof createEditChannel>;

beforeEach(() => {
  vi.useFakeTimers();
  channel = createEditChannel();
});
afterEach(() => {
  channel.stop();
  vi.useRealTimers();
});

const press = (key: string, repeat = false) => window.dispatchEvent(new KeyboardEvent("keydown", { key, repeat }));

it("goes to what is there at once", () => {
  const handler = vi.fn(() => true);
  channel.handle(handler);
  channel.ask(target);
  expect(handler).toHaveBeenCalledExactlyOnceWith(target);
  vi.advanceTimersByTime(1000);
  expect(handler).toHaveBeenCalledTimes(1);
});

it("waits for what comes a moment later, in whichever view it does", () => {
  channel.handle(() => false);
  channel.ask(target);
  vi.advanceTimersByTime(500);
  const handler = vi.fn(() => true);
  channel.handle(handler);
  vi.advanceTimersByTime(100);
  expect(handler).toHaveBeenCalledTimes(1);
});

it("gives up in the end", () => {
  const handler = vi.fn(() => false);
  channel.handle(handler);
  channel.ask(target);
  vi.advanceTimersByTime(60_000);
  const { calls } = handler.mock;
  const tries = calls.length;
  vi.advanceTimersByTime(60_000);
  expect(calls.length).toBe(tries);
});

it.each([
  ["a press", () => window.dispatchEvent(new Event("pointerdown")), true],
  ["a key", () => press("a"), true],
  ["a held key", () => press("Enter", true), false],
  ["a modifier", () => press("Shift"), false],
])("%s elsewhere ends it or not", (_, act, ends) => {
  let there = false;
  const handler = vi.fn(() => there);
  channel.handle(handler);
  channel.ask(target);
  act();
  there = true;
  handler.mockClear();
  vi.advanceTimersByTime(100);
  expect(handler).toHaveBeenCalledTimes(ends ? 0 : 1);
});

it("only goes to what was asked for last, and not to a view that left", () => {
  const handler = vi.fn<(target: EditTarget) => boolean>(() => false);
  const leave = channel.handle(handler);
  channel.ask(target);
  const other: EditTarget = { sectionId: 2, what: "heading" };
  channel.ask(other);
  handler.mockClear();
  vi.advanceTimersByTime(100);
  expect(handler.mock.calls.every(([asked]) => asked === other)).toBe(true);
  leave();
  handler.mockClear();
  vi.advanceTimersByTime(100);
  expect(handler).not.toHaveBeenCalled();
});
