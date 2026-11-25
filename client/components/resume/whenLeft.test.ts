import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { whenLeft } from "./whenLeft";

let onLeft: ReturnType<typeof vi.fn<() => void>>;
let stop: () => void;
const focus = (id: string) => {
  document.querySelector<HTMLElement>(id)!.focus();
  vi.advanceTimersByTime(1);
};

beforeEach(() => {
  vi.useFakeTimers();
  document.hasFocus = () => true;
  document.body.innerHTML =
    '<div id="place"><input id="in"></div><button id="out"></button><div role="dialog"><button id="float"></button></div>';
  onLeft = vi.fn();
  stop = whenLeft((element) => element.closest("#place") !== null, onLeft);
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

it("waits for the place to be entered, and is told once it is left", () => {
  focus("#out");
  focus("#float");
  expect(onLeft).not.toHaveBeenCalled();
  focus("#in");
  focus("#float");
  expect(onLeft).not.toHaveBeenCalled();
  focus("#out");
  focus("#in");
  focus("#out");
  expect(onLeft).toHaveBeenCalledTimes(1);
});

it("lets a press end first, with its click, which may stop it", () => {
  focus("#in");
  document.dispatchEvent(new Event("pointerdown"));
  focus("#out");
  expect(onLeft).not.toHaveBeenCalled();
  document.dispatchEvent(new Event("pointerup"));
  stop();
  vi.advanceTimersByTime(1);
  expect(onLeft).not.toHaveBeenCalled();
});
