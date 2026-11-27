import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { renderCv, PdfError } = vi.hoisted(() => {
  class PdfError extends Error {
    constructor(readonly status: number) {
      super("Couldn't make the PDF.");
    }
  }
  return { renderCv: vi.fn(), PdfError };
});
vi.mock("@/lib/pdf/renderCv", () => ({ renderCv, PdfError }));

import { GET } from "./route";

const call = (url: string, cookie = "_candido_session=abc", id = "7", host?: string) =>
  GET(new NextRequest(url, { headers: { ...(cookie ? { cookie } : {}), ...(host ? { host } : {}) } }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  renderCv.mockReset().mockResolvedValue({ pdf: new Uint8Array([37, 80, 68, 70]), name: "Ian Vexler - Backend roles" });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /resume/[id]/pdf", () => {
  it("answers with the PDF, as a download named after the CV", async () => {
    const response = await call("http://localhost:3001/resume/7/pdf");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="Ian Vexler - Backend roles.pdf"; filename*=UTF-8''Ian%20Vexler%20-%20Backend%20roles.pdf`
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(renderCv).toHaveBeenCalledWith({
      id: "7",
      origin: "http://localhost:3001",
      cookies: [{ name: "_candido_session", value: "abc" }],
    });
  });

  it("keeps the file name to what a file may be called", async () => {
    renderCv.mockResolvedValue({ pdf: new Uint8Array([1]), name: 'Zoë / "CV"' });
    const response = await call("http://localhost:3001/resume/7/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="Zo_ _ _CV_.pdf"; filename*=UTF-8''Zo%C3%AB%20_%20_CV_.pdf`
    );
  });

  it("makes it where PDF_PUBLIC_ORIGIN says, whatever the request's host", async () => {
    vi.stubEnv("PDF_PUBLIC_ORIGIN", "https://candidohq.com");
    await call("http://internal:3000/resume/7/pdf");
    expect(renderCv).toHaveBeenCalledWith(expect.objectContaining({ origin: "https://candidohq.com" }));
  });

  it("takes the address the browser used, not the one the server listens on", async () => {
    await call("http://0.0.0.0:3000/resume/7/pdf", undefined, "7", "localhost:3001");
    expect(renderCv).toHaveBeenCalledWith(expect.objectContaining({ origin: "http://localhost:3001" }));
  });

  it("won't follow a request's host anywhere but localhost without PDF_PUBLIC_ORIGIN", async () => {
    const response = await call("http://evil.example/resume/7/pdf");
    expect(response.status).toBe(500);
    expect(renderCv).not.toHaveBeenCalled();
  });

  it("needs someone signed in", async () => {
    const response = await call("http://localhost:3001/resume/7/pdf", "");
    expect(response.status).toBe(401);
    expect(renderCv).not.toHaveBeenCalled();
  });

  it("has no PDF for an id that isn't one", async () => {
    const response = await call("http://localhost:3001/resume/x/pdf", undefined, "../../etc");
    expect(response.status).toBe(404);
    expect(renderCv).not.toHaveBeenCalled();
  });

  it.each([404, 422, 500, 504])("answers %i as the render says, with what went wrong", async (status) => {
    renderCv.mockRejectedValue(new PdfError(status));
    const response = await call("http://localhost:3001/resume/7/pdf");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Couldn't make the PDF." });
  });
});
