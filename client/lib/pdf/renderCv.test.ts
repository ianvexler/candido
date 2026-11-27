import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Fake = ReturnType<typeof fakeBrowser>;

const fakePage = (state: { ready: string; status?: string; title: string }, wait: () => Promise<unknown>) => ({
  setCookie: vi.fn(async () => {}),
  goto: vi.fn(async () => null),
  waitForSelector: vi.fn(wait),
  evaluate: vi.fn(async () => [state.ready, state.status, state.title]),
  pdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
});
const fakeBrowser = (page: ReturnType<typeof fakePage>) => {
  const context = { newPage: vi.fn(async () => page), close: vi.fn(async () => {}) };
  return {
    context,
    page,
    browser: {
      connected: true,
      createBrowserContext: vi.fn(async () => context),
      close: vi.fn(async () => {}),
      on: vi.fn(),
    },
  };
};

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("puppeteer-core", () => ({ default: { launch }, TimeoutError: class TimeoutError extends Error {} }));

const load = async () => {
  vi.resetModules();
  return import("./renderCv");
};

let fake: Fake;
const ready = () => Promise.resolve(null);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8001");
  vi.stubEnv("CHROMIUM_PATH", "/usr/bin/chromium-browser");
  fake = fakeBrowser(fakePage({ ready: "true", title: "Ian Vexler - Backend roles" }, ready));
  launch.mockReset().mockResolvedValue(fake.browser);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const COOKIES = [{ name: "_candido_session", value: "abc" }];

describe("renderCv", () => {
  it("opens the print page as the user and makes the PDF with the page's own size, without headers", async () => {
    const { renderCv } = await load();
    const result = await renderCv({ id: "7", origin: "http://localhost:3001", cookies: COOKIES });
    expect(fake.page.setCookie).toHaveBeenCalledWith(
      { name: "_candido_session", value: "abc", url: "http://localhost:3001" },
      { name: "_candido_session", value: "abc", url: "http://localhost:8001" }
    );
    expect(fake.page.goto).toHaveBeenCalledWith("http://localhost:3001/resume/7/print?pdf=1", expect.anything());
    expect(fake.page.pdf).toHaveBeenCalledWith({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    expect(result.name).toBe("Ian Vexler - Backend roles");
    expect(fake.context.close).toHaveBeenCalled();
  });

  it("passes the host rules to Chrome when set", async () => {
    vi.stubEnv("PDF_HOST_RESOLVER_RULES", "MAP localhost host.docker.internal");
    const { renderCv } = await load();
    await renderCv({ id: "7", origin: "http://localhost:3001", cookies: COOKIES });
    expect(launch.mock.calls[0][0].args).toContain("--host-resolver-rules=MAP localhost host.docker.internal");
    expect(launch.mock.calls[0][0].executablePath).toBe("/usr/bin/chromium-browser");
  });

  it.each([
    ["404", 404],
    ["422", 422],
    ["500", 500],
  ])("says %s when the page does", async (status, expected) => {
    fake = fakeBrowser(fakePage({ ready: "error", status, title: "" }, ready));
    launch.mockResolvedValue(fake.browser);
    const { renderCv, PdfError } = await load();
    const made = renderCv({ id: "7", origin: "http://localhost:3001", cookies: COOKIES });
    await expect(made).rejects.toBeInstanceOf(PdfError);
    await expect(made).rejects.toMatchObject({ status: expected });
    expect(fake.page.pdf).not.toHaveBeenCalled();
    expect(fake.context.close).toHaveBeenCalled();
  });

  it("gives up after 20 seconds with 504 and closes the page", async () => {
    vi.useFakeTimers();
    fake = fakeBrowser(fakePage({ ready: "true", title: "" }, () => new Promise(() => {})));
    launch.mockResolvedValue(fake.browser);
    const { renderCv } = await load();
    const made = renderCv({ id: "7", origin: "http://localhost:3001", cookies: COOKIES });
    const caught = made.catch((error) => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await caught).toMatchObject({ status: 504 });
    expect(fake.context.close).toHaveBeenCalled();
  });

  it("makes at most two at once; a third waits", async () => {
    let release: () => void = () => {};
    const held = new Promise<null>((done) => (release = () => done(null)));
    fake = fakeBrowser(fakePage({ ready: "true", title: "" }, () => held));
    launch.mockResolvedValue(fake.browser);
    const { renderCv } = await load();
    const all = [1, 2, 3].map(() => renderCv({ id: "7", origin: "http://localhost:3001", cookies: COOKIES }));
    await new Promise((done) => setTimeout(done, 10));
    expect(fake.browser.createBrowserContext).toHaveBeenCalledTimes(2);
    release();
    await Promise.all(all);
    expect(fake.browser.createBrowserContext).toHaveBeenCalledTimes(3);
  });

  it("starts Chrome again when it has gone", async () => {
    const { renderCv } = await load();
    await renderCv({ id: "7", origin: "http://localhost:3001", cookies: COOKIES });
    fake.browser.connected = false;
    await renderCv({ id: "7", origin: "http://localhost:3001", cookies: COOKIES });
    expect(launch).toHaveBeenCalledTimes(2);
  });
});
