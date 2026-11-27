import { act, AnchorHTMLAttributes, Suspense } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrintResumePage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { getCurriculum, getResumeProfile } = vi.hoisted(() => ({
  getCurriculum: vi.fn(),
  getResumeProfile: vi.fn(),
}));
vi.mock("@/api/resources/curriculums/getCurriculum", () => ({ getCurriculum }));
vi.mock("@/api/resources/resumeProfile/getResumeProfile", () => ({ getResumeProfile }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
// next/font only works inside Next's own build.
vi.mock("@/components/resume/templates/fonts", () => ({ FONT_FAMILIES: {} }));

const SECTION = {
  id: 1,
  section_type: "Experience",
  hidden: false,
  placement: null,
  styles: {},
  entries: [{ id: "a", title: "Northwind", role: "Engineer", organization: null, location: null, start_date: null, end_date: null, current: false, description: null, content: "<p>Built things</p>", hidden: false }],
};
const curriculum = (sections: unknown[] = [SECTION]) => ({ curriculum: { id: 7, title: "Backend roles", styles: {}, header: {}, sections } });

let root: Root;
let fontsLoaded: () => void;
const print = vi.fn();
const html = document.documentElement;

const show = async (search: string) => {
  window.history.replaceState(null, "", `/resume/7/print${search}`);
  await act(async () =>
    root.render(
      <Suspense>
        <PrintResumePage params={Promise.resolve({ id: "7" })} />
      </Suspense>
    )
  );
};
const settle = () => act(() => new Promise((done) => setTimeout(done, 120)));

beforeEach(() => {
  print.mockClear();
  vi.stubGlobal("print", print);
  const ready = new Promise<void>((resolve) => (fontsLoaded = resolve));
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready } });
  getResumeProfile.mockResolvedValue({ profile: { name: "Ian Vexler", headline: "", email: "ian@example.com", phone: "", location: "", links: [] } });
  getCurriculum.mockResolvedValue(curriculum());
  html.removeAttribute("data-pdf-ready");
  html.removeAttribute("data-pdf-status");
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("made into a PDF (?pdf=1)", () => {
  it("never prints, shows no toolbar, and says it is ready once laid out with its fonts", async () => {
    await show("?pdf=1");
    await settle();
    expect(document.body.textContent).toContain("Northwind");
    expect(html.dataset.pdfReady).toBeUndefined();
    fontsLoaded();
    await settle();
    expect(html.dataset.pdfReady).toBe("true");
    expect(print).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Print again");
  });

  it.each([404, 403])("says 404 when the CV can't be found or isn't theirs (the API's %i)", async (status) => {
    getCurriculum.mockRejectedValue(Object.assign(new Error("No"), { response: { status } }));
    await show("?pdf=1");
    await settle();
    expect(html.dataset.pdfReady).toBe("error");
    expect(html.dataset.pdfStatus).toBe("404");
  });

  it("says 500 for any other failure", async () => {
    getCurriculum.mockRejectedValue(new Error("Network Error"));
    await show("?pdf=1");
    await settle();
    expect(html.dataset.pdfReady).toBe("error");
    expect(html.dataset.pdfStatus).toBe("500");
  });

  it("says 422 when there is nothing to put in it", async () => {
    getCurriculum.mockResolvedValue(curriculum([]));
    await show("?pdf=1");
    fontsLoaded();
    await settle();
    expect(html.dataset.pdfReady).toBe("error");
    expect(html.dataset.pdfStatus).toBe("422");
  });
});

it("still prints itself once, with its toolbar, when opened as before", async () => {
  await show("");
  fontsLoaded();
  await settle();
  expect(print).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain("Print again");
  expect(html.dataset.pdfReady).toBeUndefined();
});
