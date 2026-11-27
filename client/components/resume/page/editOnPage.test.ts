import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EditTarget } from "../editChannel";
import { createEditChannel } from "../editChannel";
import { editOnPage } from "./editOnPage";
import { createPageEditors } from "./pageEditors";

let root: HTMLElement;
const target: EditTarget = { sectionId: 1, entryId: "a", what: "bullet" };

beforeEach(() => {
  vi.stubGlobal("CSS", { escape: (text: string) => text });
  vi.useFakeTimers();
  document.body.innerHTML =
    '<div id="root"><div data-section-id="1"><h2 class="rc-heading page-text" tabindex="0"></h2><div data-entry-id="a"><div class="page-entry-body"><div role="textbox" tabindex="0"></div></div></div></div></div><button id="out"></button>';
  Element.prototype.scrollIntoView = () => {};
  root = document.querySelector("#root")!;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const options = () => ({ root, editors: createPageEditors(), openCard: vi.fn(), hasEntry: () => true, onLost: vi.fn() });

it("focuses the text that loads an editor once per ask", () => {
  const channel = createEditChannel();
  channel.handle((asked) => editOnPage(asked, options()));
  const text = root.querySelector<HTMLElement>('[role="textbox"]')!;
  channel.ask(target);
  expect(document.activeElement).toBe(text);
  // What the user, or the app, went on to.
  document.querySelector<HTMLElement>("#out")!.focus();
  vi.advanceTimersByTime(200);
  expect(document.activeElement?.id).toBe("out");
  // The same row's button again.
  channel.ask(target);
  expect(document.activeElement).toBe(text);
  channel.stop();
});

it("goes to a heading, and opens the card of an entry in the CV", () => {
  expect(editOnPage({ sectionId: 1, what: "heading" }, options())).toBe(true);
  expect(document.activeElement?.className).toContain("rc-heading");
  const { openCard, ...rest } = options();
  const details: EditTarget = { sectionId: 1, entryId: "a", what: "details" };
  expect(editOnPage(details, { ...rest, openCard, hasEntry: () => false })).toBe(false);
  expect(editOnPage(details, { ...rest, openCard })).toBe(true);
  expect(openCard).toHaveBeenCalledExactlyOnceWith({ kind: "entry", sectionId: 1, entryId: "a" }, "role");
});
