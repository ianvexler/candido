import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CvView } from "./useCvView";
import { useRoomForPage } from "./useRoomForPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let wide: boolean;
let listeners: Set<() => void>;
let root: Root;
let host: HTMLElement;
let month: HTMLInputElement;
let half: boolean;

const Shown = ({ view }: { view: CvView }) => <p>{useRoomForPage(view) ? "room" : "none"}</p>;
const show = (view: CvView) => act(async () => root.render(<Shown view={view} />));
const widen = (to: boolean) =>
  act(async () => {
    wide = to;
    listeners.forEach((listener) => listener());
  });
const pick = (is: boolean) =>
  act(async () => {
    half = is;
    month.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((done) => setTimeout(done, 5));
  });

beforeEach(() => {
  wide = true;
  half = false;
  listeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return wide;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  host = document.body.appendChild(document.createElement("div"));
  month = document.body.appendChild(document.createElement("input"));
  month.type = "month";
  Object.defineProperty(month, "validity", { get: () => ({ badInput: half }) });
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it("follows the screen", async () => {
  await show("page");
  expect(host.textContent).toBe("room");
  await widen(false);
  expect(host.textContent).toBe("none");
  await widen(true);
  expect(host.textContent).toBe("room");
});

it("keeps the page while a month is half picked, until it is finished", async () => {
  await show("page");
  await pick(true);
  await widen(false);
  expect(host.textContent).toBe("room");
  await pick(false);
  expect(host.textContent).toBe("none");
});

it("keeps the cards shown instead of the page too", async () => {
  wide = false;
  await show("page");
  await pick(true);
  await widen(true);
  expect(host.textContent).toBe("none");
  await pick(false);
  expect(host.textContent).toBe("room");
});

it("doesn't hold where cards are the view on any screen", async () => {
  await show("cards");
  await pick(true);
  await widen(false);
  expect(host.textContent).toBe("none");
});
