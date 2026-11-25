import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Added, useAdded } from "./useAdded";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let hook: ReturnType<typeof useAdded>;
const Shown = () => {
  Object.assign(globalThis, { shownAdded: useAdded("cards") });
  return null;
};
const render = () => {
  act(() => root.render(<Shown />));
  hook = (globalThis as unknown as { shownAdded: typeof hook }).shownAdded;
};
const added = (putBack: () => void, what: Added["what"] = "entry"): Added => ({ what, sectionId: 1, entryId: "a", known: [], putBack });
const start = (next: Added) => {
  act(() => hook.start(next));
  render();
};
const focus = (id: string) =>
  act(() => {
    document.querySelector<HTMLElement>(id)!.focus();
    vi.advanceTimersByTime(5);
  });

beforeEach(() => {
  vi.stubGlobal("CSS", { escape: (text: string) => text });
  vi.useFakeTimers();
  document.hasFocus = () => true;
  document.body.innerHTML =
    '<div data-section-id="1"><input id="h"><div data-entry-id="a"><input id="in"></div></div><button id="out"></button><div role="dialog"><input id="card"></div>';
  root = createRoot(document.createElement("div"));
  render();
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("puts back once left", () => {
  const putBack = vi.fn();
  start(added(putBack));
  focus("#in");
  focus("#out");
  render();
  expect(putBack).toHaveBeenCalledTimes(1);
  expect(hook.added).toBeNull();
  expect(hook.take()).toBeNull();
});

it("hands over what is being put back, which then isn't", () => {
  const putBack = vi.fn();
  const first = added(putBack);
  start(first);
  expect(hook.take()).toBe(first);
  start(added(vi.fn()));
  focus("#in");
  act(() => {
    document.querySelector<HTMLElement>("#out")!.focus();
    vi.runOnlyPendingTimers();
  });
  const last = hook.take();
  expect(last).not.toBeNull();
  expect(last).not.toBe(first);
  act(() => void vi.advanceTimersByTime(50));
  expect(putBack).not.toHaveBeenCalled();
  expect(last!.putBack).not.toHaveBeenCalled();
});

it("is also left from a card of its details, which floats elsewhere", () => {
  const putBack = vi.fn();
  start(added(putBack, "details"));
  focus("#card");
  focus("#out");
  expect(putBack).toHaveBeenCalledTimes(1);
});

it("has a section's heading in its place, not an entry's", () => {
  const putBack = vi.fn();
  start(added(putBack, "section"));
  focus("#h");
  focus("#in");
  expect(putBack).not.toHaveBeenCalled();
  focus("#out");
  expect(putBack).toHaveBeenCalledTimes(1);
});
