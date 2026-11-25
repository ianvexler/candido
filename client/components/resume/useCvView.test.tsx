import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCvView } from "./useCvView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
const Shown = () => {
  const [view, setView] = useCvView();
  return <button onClick={() => setView(view === "cards" ? "page" : "cards")}>{view}</button>;
};
let host: HTMLElement;
const show = () => {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  act(() => root.render(<Shown />));
};
const press = () => act(() => host.querySelector("button")!.click());

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("starts on the page when nothing is stored", () => {
  show();
  expect(host.textContent).toBe("page");
});

it("ignores the first stage's stored choice", () => {
  localStorage.setItem("candido:cv-view", "cards");
  show();
  expect(host.textContent).toBe("page");
});

it("remembers cards once chosen", () => {
  show();
  press();
  expect(host.textContent).toBe("cards");
  expect(localStorage.getItem("candido:cv-view-2")).toBe("cards");
  act(() => root.unmount());
  show();
  expect(host.textContent).toBe("cards");
});

it("takes anything else stored for the page", () => {
  localStorage.setItem("candido:cv-view-2", "other");
  show();
  expect(host.textContent).toBe("page");
});

it("works with storage blocked", () => {
  const blocked = () => {
    throw new Error("blocked");
  };
  vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
  show();
  press();
  expect(host.textContent).toBe("cards");
});
