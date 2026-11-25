import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RowMenu from "./RowMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
const onSelect = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  onSelect.mockReset();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root.render(<RowMenu label="Row" actions={[{ label: "Add title", icon: null, onSelect }]} />));
  act(() => {
    document.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const choose = () => document.querySelector<HTMLElement>('[role="menuitem"]')!.click();

it("does what was chosen once, after the menu closed", () => {
  act(choose);
  act(() => void vi.runAllTimers());
  expect(onSelect).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  act(() => void vi.runAllTimers());
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it("does it if the row goes with the menu", () => {
  act(() => {
    choose();
    root.render(null);
  });
  act(() => void vi.runAllTimers());
  expect(onSelect).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});
