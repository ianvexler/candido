import type { ResumeHeader } from "@/lib/types";
import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderValues } from "./headerDraft";
import { HeaderDraft, useHeaderDraft } from "./useHeaderDraft";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROFILE: ResumeHeader = {
  name: "Sam Okafor",
  headline: "Engineer",
  email: "sam@example.com",
  phone: "",
  location: "Leeds",
  links: [{ label: "Site", url: "https://sam.test" }],
};

let root: Root;
let header: HeaderDraft;
const save = vi.fn<(values: HeaderValues) => Promise<void>>(() => Promise.resolve());

const Owner = ({ value, fallback }: { value: HeaderValues; fallback?: ResumeHeader }) => {
  const draft = useHeaderDraft({ value, fallback, save });
  // Read by the tests, after each render.
  Object.assign(globalThis, { ownedHeader: draft });
  return null;
};
const show = (value: HeaderValues, fallback?: ResumeHeader) => {
  act(() => root.render(createElement(Owner, { value, fallback })));
  take();
};
const take = () => (header = (globalThis as unknown as { ownedHeader: HeaderDraft }).ownedHeader);
const edit = (change: () => void) => {
  act(change);
  take();
};

beforeEach(() => {
  vi.useFakeTimers();
  save.mockClear();
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("useHeaderDraft", () => {
  it("shows the profile where there is no override, or a blank one", () => {
    show({ name: "Sammy", headline: "  " }, PROFILE);
    expect(header.resolved).toEqual({ ...PROFILE, name: "Sammy" });
    expect(header.isOverridden("name")).toBe(true);
    expect(header.isOverridden("headline")).toBe(false);
    expect(header.isOverridden("links")).toBe(false);
    edit(() => header.setText("name", ""));
    expect(header.resolved.name).toBe("Sam Okafor");
    expect(header.isOverridden("name")).toBe(false);
  });

  it("copies the profile's links to edit one, and goes back to them", () => {
    show({}, PROFILE);
    edit(() => header.editLink(0, { label: "Home" }));
    expect(header.resolved.links).toEqual([{ label: "Home", url: "https://sam.test" }]);
    expect(header.isOverridden("links")).toBe(true);
    edit(() => header.setLinks(undefined));
    expect(header.draft).not.toHaveProperty("links");
    expect(header.resolved.links).toEqual(PROFILE.links);
  });

  it("overrides nothing in the profile itself", () => {
    show(PROFILE);
    expect(header.isOverridden("name")).toBe(false);
    expect(header.resolved).toEqual(PROFILE);
  });

  it("keeps changes made before a render apart", () => {
    show({}, PROFILE);
    edit(() => {
      header.setText("name", "A");
      header.setText("phone", "1");
    });
    expect(header.draft).toEqual({ name: "A", phone: "1" });
  });

  it("stays the same until something changes", () => {
    show({}, PROFILE);
    const before = header;
    show({}, PROFILE);
    expect(header).toBe(before);
  });

  it("sends what is unsaved when it is left", () => {
    show({}, PROFILE);
    edit(() => header.setText("name", "A"));
    expect(save).not.toHaveBeenCalled();
    act(() => root.render(null));
    expect(save.mock.calls).toEqual([[{ name: "A" }]]);
  });

  it("sends what is unsaved when the page is hidden", () => {
    show({}, PROFILE);
    edit(() => header.setText("name", "A"));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    visibility.mockRestore();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
