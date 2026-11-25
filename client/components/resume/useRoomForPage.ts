import { useCallback, useState, useSyncExternalStore } from "react";
import { halfPickedMonths } from "./halfPicked";
import type { CvView } from "./useCvView";

// The page is edited from here on; below it's only shown.
const ROOM_FOR_PAGE = "(min-width: 1024px)";

// What can finish a month, or take its entry away.
const CHANGES = ["input", "focusout", "keyup", "click"];

/** A month may be lost: half picked, or still being written, where its first digit of a year is a whole one. */
const isWritingMonth = () =>
  halfPickedMonths().length > 0 || document.activeElement?.matches('input[type="month"]') === true;

const createRoom = () => {
  let room: boolean | null = null;
  return (held: boolean) => {
    const matches = window.matchMedia(ROOM_FOR_PAGE).matches;
    if (room !== null && room !== matches && held && isWritingMonth()) return room;
    return (room = matches);
  };
};

/**
 * Whether the screen has room to edit the page. For the Page view that decides what
 * shows, so it stays as it was while a month that isn't finished would go with that.
 */
export const useRoomForPage = (view: CvView) => {
  const [read] = useState(createRoom);
  const subscribe = useCallback((onChange: () => void) => {
    const ended = new AbortController();
    const list = window.matchMedia(ROOM_FOR_PAGE);
    list.addEventListener("change", onChange);
    // Once it has been dealt with.
    const later = () => setTimeout(onChange);
    CHANGES.forEach((name) => document.addEventListener(name, later, { capture: true, signal: ended.signal }));
    return () => {
      ended.abort();
      list.removeEventListener("change", onChange);
    };
  }, []);
  return useSyncExternalStore(subscribe, () => read(view === "page"), () => false);
};
