import { afterEach, beforeEach, expect, it } from "vitest";
import { watchMovedOn } from "./movedOn";

let movedOn: () => boolean;
const key = (init: KeyboardEventInit) => document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));

beforeEach(() => {
  document.body.innerHTML = '<button></button><input type="checkbox"><input class="text"><div contenteditable="true" tabindex="0"></div>';
  movedOn = watchMovedOn();
});
afterEach(() => void movedOn());

it.each<[string, () => void, boolean]>([
  ["nothing", () => {}, false],
  ["a key", () => key({ key: "a" }), true],
  ["the pressed key held down", () => key({ key: "Enter", repeat: true }), false],
  ["a modifier", () => key({ key: "Shift" }), false],
  ["focus in a button", () => document.querySelector("button")!.focus(), false],
  ["focus in a checkbox", () => document.querySelector<HTMLElement>("[type=checkbox]")!.focus(), false],
  ["focus in a field", () => document.querySelector<HTMLElement>(".text")!.focus(), true],
  ["focus in editable text", () => document.querySelector<HTMLElement>("[contenteditable]")!.focus(), true],
])("after %s", (_, act, expected) => {
  act();
  expect(movedOn()).toBe(expected);
});
