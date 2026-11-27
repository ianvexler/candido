import { act, createElement, StrictMode } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePrintOnce } from "./usePrintOnce";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let fontsLoaded: () => void;
const print = vi.fn();

const Printed = ({ id, ready }: { id: string; ready: boolean }) => {
  usePrintOnce(id, ready);
  return null;
};
const show = (id: string, ready: boolean) =>
  act(() => root.render(createElement(StrictMode, null, createElement(Printed, { id, ready }))));
const pass = () => act(() => new Promise((done) => setTimeout(done, 120)));

beforeEach(() => {
  print.mockClear();
  vi.stubGlobal("print", print);
  const ready = new Promise<void>((resolve) => (fontsLoaded = resolve));
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready } });
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

it("prints once ready and with its fonts, only once", async () => {
  show("1", false);
  fontsLoaded();
  await pass();
  expect(print).not.toHaveBeenCalled();
  show("1", true);
  await pass();
  expect(print).toHaveBeenCalledTimes(1);

  // Come back to inside the app.
  act(() => root.unmount());
  root = createRoot(document.createElement("div"));
  show("1", true);
  await pass();
  expect(print).toHaveBeenCalledTimes(1);
});

it("waits for the fonts", async () => {
  show("2", true);
  await pass();
  expect(print).not.toHaveBeenCalled();
  fontsLoaded();
  await pass();
  expect(print).toHaveBeenCalledTimes(1);
});

it("doesn't print after leaving", async () => {
  show("3", true);
  await pass();
  show("3", false);
  fontsLoaded();
  await pass();
  expect(print).not.toHaveBeenCalled();
});
