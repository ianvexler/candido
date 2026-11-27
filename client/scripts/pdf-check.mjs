#!/usr/bin/env node
/**
 * Checks Export's PDF end to end. Not part of CI: it needs the running stack, a browser
 * and a throwaway account. See "Checking the CV page" in the README.
 *
 * For one CV, in A4 and then Letter, it downloads GET /resume/<id>/pdf as the signed-in
 * user and checks it is a PDF of that paper, with the template's font, the same pages and
 * text as the print page's own PDF, and no browser header or footer (no URL, no title).
 * A CV of someone else's must give 404. The CV's paper is put back afterwards.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const USAGE = `Usage: node scripts/pdf-check.mjs --cv <id> --other <id> [options]

  --cv <id>          A CV of the signed-in throwaway account
  --other <id>       A CV of another account: must give 404
  --url <origin>     The client (default http://localhost:3000)
  --api <origin>     The API (default http://localhost:8000)
  --state <file>     A Playwright storage state of the signed-in user (required)
  --yes-this-is-a-throwaway-account
                     Required: the CV's paper is changed while checking, then put back

PLAYWRIGHT_PATH names a Playwright install if "playwright" can't be imported.
PARITY_PDF_TEXT names a command that prints a PDF's text, a form feed after each page,
when pdftotext isn't installed.`;

const args = {};
for (let at = 2; at < process.argv.length; at++) {
  const name = process.argv[at].replace(/^--/, "");
  if (name === "help") {
    console.log(USAGE);
    process.exit(0);
  }
  args[name] = name === "yes-this-is-a-throwaway-account" ? true : process.argv[++at];
}
if (!args.cv || !args.other || !args.state || !args["yes-this-is-a-throwaway-account"]) {
  console.error(USAGE);
  process.exit(2);
}
const CLIENT = args.url ?? "http://localhost:3000";
const API = `${args.api ?? "http://localhost:8000"}/api/v1`;

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");

const PAPER = { a4: [595, 842], letter: [612, 792] };
const work = mkdtempSync(path.join(tmpdir(), "pdf-check-"));
const failures = [];
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures.push(what);
};

/** Pages of text, as the PDF has them. */
const textOf = (bytes, name) => {
  const file = path.join(work, name);
  writeFileSync(file, bytes);
  const reader = process.env.PARITY_PDF_TEXT;
  const run = reader ? spawnSync(reader, [file]) : spawnSync("pdftotext", ["-layout", file, "-"]);
  if (run.status !== 0) throw new Error(`Couldn't read the PDF's text: ${run.stderr}`);
  return run.stdout.toString().split("\f").map((page) => page.replace(/\s+/g, " ").trim()).filter(Boolean);
};
const raw = (bytes) => Buffer.from(bytes).toString("latin1");
const sizeOf = (bytes) => raw(bytes).match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)?.slice(1).map(Number);
const fontsOf = (bytes) => [...new Set([...raw(bytes).matchAll(/\/(?:BaseFont|FontName)\s*\/(?:[A-Z]{6}\+)?([\w-]+)/g)].map((m) => m[1]))];

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ storageState: args.state, acceptDownloads: true });
const api = context.request;
let original = null;
try {
  const cv = (await (await api.get(`${API}/curriculums/${args.cv}`)).json()).curriculum;
  original = cv.styles ?? {};
  const family = (cv.styles?.font ?? "source_sans").replace(/_(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase());

  for (const paper of ["a4", "letter"]) {
    await api.put(`${API}/curriculums/${args.cv}`, { data: { styles: { ...original, paper } } });
    const page = await context.newPage();
    await page.goto(`${CLIENT}/resume/${args.cv}`);
    await page.getByRole("button", { name: /Export PDF/ }).waitFor({ timeout: 60_000 });
    const started = Date.now();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), page.getByRole("button", { name: /Export PDF/ }).click()]);
    const file = path.join(work, `export-${paper}.pdf`);
    await download.saveAs(file);
    const took = Date.now() - started;
    const bytes = new Uint8Array(await (await import("node:fs")).promises.readFile(file));
    check(raw(bytes).startsWith("%PDF"), `${paper}: Export downloads a PDF`, `${download.suggestedFilename()}, ${took}ms`);
    check(context.pages().length === 1, `${paper}: no new tab`);

    const [width, height] = sizeOf(bytes) ?? [];
    const [expectW, expectH] = PAPER[paper];
    check(Math.abs(width - expectW) < 2 && Math.abs(height - expectH) < 2, `${paper}: page size`, `${width}×${height}`);
    const fonts = fontsOf(bytes);
    check(fonts.some((font) => font.replace(/\d/g, "").startsWith(family.replace(/\d/g, ""))), `${paper}: template font`, fonts.join(", "));

    // The reference: the print page as this machine's Chrome prints it.
    const print = await context.newPage();
    await print.goto(`${CLIENT}/resume/${args.cv}/print?pdf=1`);
    await print.waitForSelector("html[data-pdf-ready=true]", { timeout: 30_000 });
    const title = await print.title();
    const reference = await print.pdf({ preferCSSPageSize: true, printBackground: true });
    const ours = textOf(bytes, `ours-${paper}.pdf`);
    const theirs = textOf(reference, `print-${paper}.pdf`);
    check(ours.length === theirs.length, `${paper}: same pages as the print page`, `${ours.length} and ${theirs.length}`);
    check(ours.join(" ") === theirs.join(" "), `${paper}: same text as the print page`);
    const all = ours.join(" ");
    check(!/https?:\/\/|localhost/.test(all) && !all.includes(title), `${paper}: no browser header or footer`);
    await print.close();
    await page.close();
  }

  const other = await api.get(`${CLIENT}/resume/${args.other}/pdf`);
  check(other.status() === 404, "someone else's CV gives 404", String(other.status()));
} finally {
  if (original) await api.put(`${API}/curriculums/${args.cv}`, { data: { styles: original } });
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}

console.log(failures.length ? `\n${failures.length} failed` : "\nall ok");
process.exit(failures.length ? 1 : 0);
