import ResumePage from "@/app/resume/[id]/page";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { waitForSaves } from "@/lib/resume/saveTracker";
import { emptyEntry } from "@/lib/resume/sectionEntries";
import { act, AnchorHTMLAttributes, Suspense } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { toast, api } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
  api: {
    get: vi.fn<(url: string) => Promise<unknown>>(),
    put: vi.fn<(url: string, body: Record<string, unknown>) => Promise<unknown>>(),
    post: vi.fn<(url: string, body: Record<string, unknown>) => Promise<unknown>>(),
    defaults: {},
  },
}));
// jsdom has none; asked for as modules load.
vi.hoisted(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.assign(globalThis, { ResizeObserver: Observer, IntersectionObserver: Observer });
});
vi.mock("react-hot-toast", () => ({ default: toast }));
vi.mock("@/api/apiClient", () => ({ default: api }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
// next/font only works inside Next's own build.
vi.mock("./templates/fonts", () => ({ FONT_FAMILIES: {} }));
vi.mock("./EditorControls", () => ({ BlockToolbar: () => null, FormatBubble: () => null }));

type Body = Record<string, unknown>;
type Request = { url: string; body: Body; done: () => void; fail: () => void };

const ENTRY = { ...emptyEntry(), id: "a", title: "Northwind", role: "Engineer" };
const section = (changes: Body = {}) => ({
  id: 1,
  curriculum_id: 7,
  section_type: "Experience",
  section_template_id: null,
  placement: null,
  hidden: false,
  styles: {},
  position: 0,
  synced_at: null,
  base_items: {},
  base_fields: {},
  entries: [ENTRY],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...changes,
});
const NEW_SECTION = { id: 2, section_type: "Section", entries: [], position: 1 };
const CURRICULUM = {
  id: 7,
  title: "Backend",
  styles: {},
  header: {},
  job_board_entry_id: null,
  tailored_for: null,
  created_at: "2026-01-01",
  sections: [section()],
};
const GETS: [RegExp, unknown][] = [
  [/^\/curriculums\/7$/, { curriculum: CURRICULUM }],
  [/tailoring$/, { cv_tailoring: null }],
  [/^\/resume_profile$/, { profile: { name: "Sam", headline: "Engineer", email: "s@x.y", phone: "", location: "", links: [] } }],
  [/^\/resume_designs$/, { resume_designs: [] }],
  [/^\/section_templates/, { section_templates: [] }],
];

let root: Root;
let host: HTMLElement;
let wide: boolean;
/** Saves that were sent, in order; `done` answers as the server would. */
let sent: Request[];

const listeners = new Set<() => void>();
const hold = (answer: (url: string, body: Body) => unknown) => (url: string, body: Body) =>
  new Promise((resolve, reject) =>
    sent.push({
      url,
      body,
      done: () => resolve({ data: answer(url, body) }),
      fail: () => reject(new Error("offline")),
    })
  );

const wait = (ms = 30) => act(() => new Promise((done) => setTimeout(done, ms)));
const button = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('button, [role="radio"]')].find(
    (each) => (each.getAttribute("aria-label") ?? each.textContent)!.trim() === name
  );
const press = async (name: string) => {
  const found = button(name);
  if (!found) throw new Error(`No button "${name}"`);
  await act(async () => {
    found.focus();
    found.click();
  });
};
const title = () => document.querySelector<HTMLElement>(".rc-title.page-text");
const cardTitle = () => document.querySelector<HTMLInputElement>('[data-entry-id="a"] input[aria-label="Title"], [data-entry-id="a"] input');
const typeTitle = async (text: string) => {
  const field = title()!;
  await act(async () => {
    field.focus();
    field.firstChild!.nodeValue = text;
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
};
const titleOf = ({ body }: Request) => (body.entries as { title: string }[])[0].title;
const sectionSaves = () => sent.filter(({ url }) => url.includes("/sections/"));
const tab = () => ({ close: vi.fn(), location: { href: "" } });

const mount = async (view: "cards" | "page") => {
  localStorage.setItem("candido:cv-view-2", view);
  const params = Object.assign(Promise.resolve({ id: "7" }), { status: "fulfilled", value: { id: "7" } });
  await act(async () =>
    root.render(
      <TooltipProvider>
        <Suspense>
          <ResumePage params={params} />
        </Suspense>
      </TooltipProvider>
    )
  );
  await wait();
};

beforeEach(() => {
  wide = true;
  sent = [];
  vi.stubGlobal("CSS", { escape: (text: string) => text });
  vi.stubGlobal("CSSStyleSheet", class { disabled = false; replaceSync() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({
    // Only widths are asked for.
    matches: wide && query.includes("min-width"),
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  Object.assign(document, { adoptedStyleSheets: [] });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: Object.assign(new EventTarget(), { status: "loaded", ready: Promise.resolve() }),
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
  Element.prototype.scrollIntoView = () => {};
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  api.get.mockImplementation(async (url) => ({ data: GETS.find(([pattern]) => pattern.test(url))?.[1] }));
  api.put.mockImplementation(
    hold((url, body) => (url.includes("/sections/") ? { section: section(body) } : { curriculum: { ...CURRICULUM, ...body } }))
  );
  api.post.mockImplementation(hold(() => ({ curriculum: { ...CURRICULUM, sections: [section(), section(NEW_SECTION)] } })));
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  // Nothing may stay pending for the next one.
  const settle = async () => {
    for (let settled = false; !settled; settled = await waitForSaves(1)) {
      sent.forEach(({ done }) => done());
      await wait();
    }
  };
  await settle();
  await act(async () => root.unmount());
  await settle();
  document.body.replaceChildren();
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("switching views", () => {
  it("keeps what was typed on the page while a save of it is in flight", async () => {
    await mount("page");
    await typeTitle("Northwind Ltd");
    await wait(700);
    expect(sectionSaves().map(titleOf)).toEqual(["Northwind Ltd"]);

    await typeTitle("Northwind Ltd 2");
    await press("Cards");
    expect(title()).toBeNull();
    expect(cardTitle()!.value).toBe("Northwind Ltd 2");
    // Saves don't overlap.
    await wait(700);
    expect(sectionSaves()).toHaveLength(1);

    await press("Page");
    expect(title()!.textContent).toBe("Northwind Ltd 2");
    // The answer has the older text.
    await act(async () => sectionSaves()[0].done());
    await wait(700);
    expect(title()!.textContent).toBe("Northwind Ltd 2");
    expect(sectionSaves().map(titleOf)).toEqual(["Northwind Ltd", "Northwind Ltd 2"]);
  });

  const halfPick = (month: HTMLInputElement) => {
    let half = true;
    Object.defineProperty(month, "validity", { get: () => ({ badInput: half }) });
    return () => (half = false);
  };
  const openCard = async () => {
    await act(async () => host.querySelector<HTMLElement>(".page-line")!.click());
    const month = document.querySelector<HTMLInputElement>('[role="dialog"] [aria-label="Start month"]')!;
    await act(async () => month.focus());
    return month;
  };

  it("is refused once for a half-picked month in Cards", async () => {
    await mount("cards");
    const entry = host.querySelector('[data-entry-id="a"]')!;
    const month = entry.appendChild(document.createElement("input"));
    month.type = "month";
    halfPick(month);
    await press("Page");
    expect(title()).toBeNull();
    await press("Page");
    expect(title()).not.toBeNull();
  });

  it("is refused once for a half-picked month on the page, whose card stays", async () => {
    await mount("page");
    halfPick(await openCard());
    await press("Cards");
    expect(title()).not.toBeNull();
    expect(document.querySelector('[role="dialog"] [role="alert"]')).not.toBeNull();
    await press("Cards");
    expect(title()).toBeNull();
  });

  it("waits for a half-picked month when the screen gets too small for the page", async () => {
    await mount("page");
    const month = await openCard();
    const finish = halfPick(month);
    wide = false;
    await act(async () => listeners.forEach((listener) => listener()));
    expect(month.isConnected).toBe(true);
    finish();
    await act(async () => void month.dispatchEvent(new Event("input", { bubbles: true })));
    await wait();
    // Its year may be no more than begun.
    expect(month.isConnected).toBe(true);
    await act(async () => month.blur());
    await wait();
    expect(title()).toBeNull();
    expect(cardTitle()).not.toBeNull();
  });
});

describe("export", () => {
  it("saves the text, the header and the design before the tab gets its address", async () => {
    const opened = tab();
    vi.spyOn(window, "open").mockReturnValue(opened as never);
    await mount("page");
    await typeTitle("Northwind Ltd");
    const name = document.querySelector<HTMLElement>(".rc-name.page-text")!;
    await act(async () => {
      name.focus();
      name.firstChild!.nodeValue = "Samuel";
      name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await press("Design");
    await act(async () => [...document.querySelectorAll("button")].find((each) => each.textContent!.startsWith("Sidebar"))!.click());

    await press("Export PDF");
    await wait();
    expect(sent.map(({ url, body }) => [url, Object.keys(body)[0]])).toEqual([
      ["/curriculums/7/sections/1", "section_type"],
      ["/curriculums/7", "header"],
      ["/curriculums/7", "styles"],
    ]);
    for (const request of sent) {
      expect(opened.location.href).toBe("");
      await act(async () => request.done());
    }
    await wait();
    expect(opened.location.href).toBe("/resume/7/print");
    expect(opened.close).not.toHaveBeenCalled();
  });

  it.each(["text", "header"])("doesn't go on with %s that couldn't be saved", async (what) => {
    const opened = tab();
    vi.spyOn(window, "open").mockReturnValue(opened as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount("page");
    const field = what === "text" ? title()! : document.querySelector<HTMLElement>(".rc-name.page-text")!;
    await act(async () => {
      field.focus();
      field.firstChild!.nodeValue = "Changed";
      field.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await press("Export PDF");
    await act(async () => sent[0].fail());
    await wait();
    expect(opened.location.href).toBe("");
    expect(opened.close).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Your latest changes couldn't be saved, so the PDF wasn't made. Try again.");
    log.mockRestore();
  });
});

describe("design", () => {
  it.each([
    ["Cards", true, "cards"],
    ["the page on a small screen", false, "page"],
  ] as const)("is reached from the header in %s", async (_, isWide, view) => {
    wide = isWide;
    await mount(view);
    await press("Design");
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Paper");
    await press("Letter");
    expect(sent.at(-1)!.body.styles).toMatchObject({ paper: "letter" });
    await act(async () => void document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    await wait();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button("Design"));
  });

  it("keeps its dialog when the name of a new one is given up by Escape", async () => {
    await mount("cards");
    await press("Design");
    await press("Save this design");
    const escape = () =>
      act(async () => void document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Design name");
    await escape();
    expect(document.querySelector('[aria-label="Design name"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("is offered once on the page", async () => {
    await mount("page");
    expect([...document.querySelectorAll("button")].filter((each) => each.textContent === "Design")).toHaveLength(1);
    expect(host.querySelector('[aria-label="Page tools"]')!.textContent).toContain("Design");
  });
});

describe("a slow new section", () => {
  const add = async () => {
    await act(async () => [...host.querySelectorAll("button")].find((each) => each.textContent === "Add section")!.click());
  };
  const answer = async () => {
    await act(async () => sent[0].done());
    await wait(100);
  };
  const newHeading = () => document.querySelector('[data-section-id="2"] .rc-heading');

  it("gets the focus", async () => {
    await mount("page");
    await add();
    await answer();
    expect(document.activeElement).toBe(newHeading());
  });

  it("leaves it where the user went on to write", async () => {
    await mount("page");
    await add();
    await act(async () => title()!.focus());
    await answer();
    expect(newHeading()).not.toBeNull();
    expect(document.activeElement).toBe(title());
  });
});

describe("a header that is blank", () => {
  it("gets a name and a headline in the contact card", async () => {
    const answer = api.get.getMockImplementation()!;
    const profile = { name: "", headline: "", email: "", phone: "", location: "", links: [] };
    api.get.mockImplementation(async (url) => (url === "/resume_profile" ? { data: { profile } } : answer(url)));
    await mount("page");
    expect(document.querySelector(".rc-name")).toBeNull();
    await press("Add name and contact details");
    const field = document.querySelector<HTMLInputElement>('[role="dialog"] [data-field="name"]')!;
    expect(document.activeElement).toBe(field);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "Ada");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.querySelector(".rc-name")!.textContent).toBe("Ada");
    expect(document.querySelector('[role="dialog"] [data-field="headline"]')).not.toBeNull();
    await wait(700);
    expect(sent.at(-1)!.body.header).toMatchObject({ name: "Ada" });
  });
});
