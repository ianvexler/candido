import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type State = { ready?: string; status?: string; title: string; path?: string };

const fakePage = (state: State, wait: () => Promise<unknown>) => ({
  setCookie: vi.fn(async () => {}),
  goto: vi.fn(async () => null),
  waitForFunction: vi.fn(wait),
  evaluate: vi.fn(async () => [state.ready, state.status, state.title, state.path ?? "/resume/7/print"]),
  pdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
});
const fakeBrowser = (page: ReturnType<typeof fakePage>) => {
  const context = { newPage: vi.fn(async () => page), close: vi.fn(async () => {}) };
  const kill = vi.fn();
  return {
    context,
    page,
    kill,
    browser: {
      connected: true,
      createBrowserContext: vi.fn(async () => context),
      close: vi.fn(async () => {}),
      process: () => ({ kill }),
      on: vi.fn(),
    },
  };
};
type Fake = ReturnType<typeof fakeBrowser>;

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("puppeteer-core", () => ({ default: { launch } }));

const load = async () => {
  vi.resetModules();
  return import("./renderCv");
};

let fake: Fake;
const ready = () => Promise.resolve(null);
const never = () => new Promise(() => {});
const use = (made: Fake) => {
  fake = made;
  launch.mockResolvedValue(made.browser);
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8001");
  vi.stubEnv("CHROMIUM_PATH", "/usr/bin/chromium-browser");
  launch.mockReset();
  use(fakeBrowser(fakePage({ ready: "true", title: "Ian Vexler - Backend roles" }, ready)));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const TOKEN = { name: "auth_token", value: "abc" };
const options = (signal?: AbortSignal) => ({ id: "7", origin: "http://localhost:3001", token: "abc", signal });

describe("renderCv", () => {
  it("opens the print page with the user's sign-in and makes the PDF with the page's own size, without headers", async () => {
    const { renderCv } = await load();
    const result = await renderCv(options());
    expect(fake.page.setCookie).toHaveBeenCalledWith(
      { ...TOKEN, url: "http://localhost:3001" },
      { ...TOKEN, url: "http://localhost:8001" }
    );
    expect(fake.page.goto).toHaveBeenCalledWith("http://localhost:3001/resume/7/print?pdf=1", expect.anything());
    expect(fake.page.pdf).toHaveBeenCalledWith({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    expect(result.name).toBe("Ian Vexler - Backend roles");
    expect(fake.context.close).toHaveBeenCalled();
  });

  it("starts Chrome with a protocol timeout, and with the settings' flags", async () => {
    vi.stubEnv("PDF_HOST_RESOLVER_RULES", "MAP localhost host.docker.internal");
    vi.stubEnv("PDF_IGNORE_CERT_SPKI", "abc=");
    const { renderCv } = await load();
    await renderCv(options());
    const [{ args, executablePath, protocolTimeout }] = launch.mock.calls[0];
    expect(args).toContain("--host-resolver-rules=MAP localhost host.docker.internal");
    expect(args).toContain("--ignore-certificate-errors-spki-list=abc=");
    expect(executablePath).toBe("/usr/bin/chromium-browser");
    expect(protocolTimeout).toBe(25_000);
  });

  it.each([
    ["404", 404],
    ["422", 422],
    ["401", 401],
    ["500", 500],
  ])("says %s when the page does", async (status, expected) => {
    use(fakeBrowser(fakePage({ ready: "error", status, title: "" }, ready)));
    const { renderCv, PdfError } = await load();
    const made = renderCv(options());
    await expect(made).rejects.toBeInstanceOf(PdfError);
    await expect(made).rejects.toMatchObject({ status: expected });
    expect(fake.page.pdf).not.toHaveBeenCalled();
    expect(fake.context.close).toHaveBeenCalled();
  });

  it("says 401 at once when the page sends them to sign in", async () => {
    use(fakeBrowser(fakePage({ title: "", path: "/login" }, ready)));
    const { renderCv } = await load();
    await expect(renderCv(options())).rejects.toMatchObject({ status: 401 });
  });

  it("gives up after 20 seconds with 504, and starts a new Chrome for the next", async () => {
    vi.useFakeTimers();
    use(fakeBrowser(fakePage({ ready: "true", title: "" }, never)));
    const { renderCv } = await load();
    const caught = renderCv(options()).catch((error) => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await caught).toMatchObject({ status: 504 });
    // A Chrome that didn't answer in time may be stuck: it goes.
    expect(fake.kill).toHaveBeenCalled();
    use(fakeBrowser(fakePage({ ready: "true", title: "" }, ready)));
    await renderCv(options());
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("counts the wait for a turn within the 20 seconds", async () => {
    vi.useFakeTimers();
    use(fakeBrowser(fakePage({ ready: "true", title: "" }, never)));
    const { renderCv } = await load();
    const held = [renderCv(options()).catch(() => {}), renderCv(options()).catch(() => {})];
    await vi.advanceTimersByTimeAsync(10_000);
    const late = renderCv(options()).catch((error) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(held);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await late).toMatchObject({ status: 504 });
  });

  it("makes at most two at once, lets eight wait, and turns the rest away with 503", async () => {
    let release: () => void = () => {};
    const held = new Promise<null>((done) => (release = () => done(null)));
    use(fakeBrowser(fakePage({ ready: "true", title: "" }, () => held)));
    const { renderCv } = await load();
    const queued = Array.from({ length: 10 }, () => renderCv(options()));
    await expect(renderCv(options())).rejects.toMatchObject({ status: 503 });
    expect(fake.browser.createBrowserContext).toHaveBeenCalledTimes(2);
    release();
    await Promise.all(queued);
    expect(fake.browser.createBrowserContext).toHaveBeenCalledTimes(10);
  });

  it("drops a wait when the user has gone", async () => {
    let release: () => void = () => {};
    const held = new Promise<null>((done) => (release = () => done(null)));
    use(fakeBrowser(fakePage({ ready: "true", title: "" }, () => held)));
    const { renderCv } = await load();
    const busy = [renderCv(options()), renderCv(options())];
    const gone = new AbortController();
    const waiting = renderCv(options(gone.signal)).catch((error) => error);
    gone.abort();
    expect(await waiting).toMatchObject({ status: 503 });
    release();
    await Promise.all(busy);
    expect(fake.browser.createBrowserContext).toHaveBeenCalledTimes(2);
  });

  it("starts one Chrome when it has gone, however many are asking", async () => {
    const { renderCv } = await load();
    await renderCv(options());
    fake.browser.connected = false;
    use(fakeBrowser(fakePage({ ready: "true", title: "" }, ready)));
    await Promise.all([renderCv(options()), renderCv(options())]);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("tries again after Chrome failed to start", async () => {
    launch.mockRejectedValueOnce(new Error("no chrome"));
    const { renderCv } = await load();
    await expect(renderCv(options())).rejects.toMatchObject({ status: 500 });
    await renderCv(options());
    expect(launch).toHaveBeenCalledTimes(2);
  });
});
