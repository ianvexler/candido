import { AUTH_COOKIE, PdfError, renderCv } from "@/lib/pdf/renderCv";
import { NextRequest } from "next/server";

// Drives Chrome, so Node; and never cached: every export is of the CV as it is now.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, error = "Couldn't make the PDF.") => Response.json({ error }, { status });

/**
 * Where the print page is opened: the address the user has the app at. Never taken from a
 * request's host outside development, or anyone could point the server's Chrome anywhere.
 */
const originOf = (request: NextRequest): string | null => {
  if (process.env.PDF_PUBLIC_ORIGIN) return process.env.PDF_PUBLIC_ORIGIN.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return null;
  // The Host the browser sent: in Docker the server itself listens on another address.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const { protocol } = request.nextUrl;
  try {
    const url = new URL(`${protocol}//${host}`);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" ? url.origin : null;
  } catch {
    return null;
  }
};

/** A name any system takes, and the exact one for those that read filename*. */
const disposition = (name: string) => {
  const exact = `${name || "CV"}.pdf`;
  const plain = exact.replace(/[^\x20-\x7e]|["\\/]/g, "_");
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(exact.replace(/["\\/]/g, "_"))}`;
};

/** The CV as a PDF, made as the signed-in user sees it. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail(404);
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return fail(401, "Sign in to export your CV.");
  const origin = originOf(request);
  if (!origin) {
    console.error("PDF: set PDF_PUBLIC_ORIGIN to the address the app is used at.");
    return fail(500);
  }
  try {
    const { pdf, name } = await renderCv({ id, origin, token, signal: request.signal });
    return new Response(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition(name),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fail(error instanceof PdfError ? error.status : 500);
  }
}
