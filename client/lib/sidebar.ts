"use client";

import { useCallback, useSyncExternalStore } from "react";
import { SIDEBAR_STORAGE_KEY as STORAGE_KEY } from "./sidebarInit";

/**
 * Whether the desktop sidebar is collapsed to its icon rail.
 *
 * The state lives on `<html data-sidebar="collapsed">` so CSS (the `sidebar-collapsed:` variant)
 * can lay the page out before React hydrates; `sidebarInitScript` sets it from localStorage on load.
 */
const CHANGE_EVENT = "candido:sidebar-change";

const isCollapsed = () => document.documentElement.dataset.sidebar === "collapsed";

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
};

const setCollapsed = (collapsed: boolean) => {
  if (collapsed) {
    document.documentElement.dataset.sidebar = "collapsed";
  } else {
    delete document.documentElement.dataset.sidebar;
  }
  try {
    if (collapsed) localStorage.setItem(STORAGE_KEY, "collapsed");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private windows can refuse storage; the toggle still works for this visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const useSidebarCollapsed = () => {
  const collapsed = useSyncExternalStore(subscribe, isCollapsed, () => false);
  const toggle = useCallback(() => setCollapsed(!isCollapsed()), []);
  return { collapsed, toggle };
};

export default useSidebarCollapsed;
