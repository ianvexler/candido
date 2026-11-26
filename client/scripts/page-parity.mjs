#!/usr/bin/env node
/**
 * Checks the CV's Page view against what it exports. Not part of CI: it needs a
 * running stack, a browser and a throwaway account. See "Checking the CV page"
 * in the README.
 *
 * For a sample of designs it makes a CV titled "Parity check" from fixture
 * sections, whose every block starts with a label (K0001...), and compares:
 *  - where each block sits on the Page view, with its break rules off, with the
 *    print page: within 0.5px;
 *  - the page each block is on in the Page view with the PDF's, and the number
 *    of pages (the page starts follow from the first);
 *  - that what is left out is nowhere in either.
 * Then it points at every block and gap of the first sheet and checks that the tools
 * that show move nothing on the page and add nothing to it. It then deletes the CV.
 * With --typing it measures typing in a CV of 40 sections and 400 items instead.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const USAGE = `Usage: node scripts/page-parity.mjs [options]

  --url <origin>     The client (default http://localhost:3000)
  --api <origin>     The API (default http://localhost:8000)
  --state <file>     A Playwright storage state of a signed-in user.
                     Otherwise PARITY_EMAIL and PARITY_PASSWORD sign in.
  --all              Every combination of template, paper, font, size and
                     pages (192) instead of a sample where each pair of
                     values is covered at least once
  --only <text>      Only the cases whose name contains this, such as
                     "classic/a4/lora" or "/3p"
  --typing           Measure typing with 40 sections and 400 items. Fails
                     if the 95th percentile of a key to its paint is over
                     50ms, which is for a development build
  --no-hover         Skip pointing at every block and gap of the first sheet,
                     which checks that the tools that show move nothing on
                     the page and add nothing to it
  --no-pdf-text      Go on without a PDF text reader, comparing only the
                     number of pages with the PDF (else that is an error)
  --allow-remote     Allow a --url or --api that isn't on this machine
  --yes-this-is-a-throwaway-account
                     Run although the account has CVs not titled "Parity ..."
  --help

PLAYWRIGHT_PATH names a Playwright install if "playwright" can't be imported.
PARITY_PDF_TEXT names a command that prints a PDF's text, a form feed after
each page, when pdftotext isn't installed.`;

const FLAGS = new Set(["all", "typing", "help", "no-hover", "no-pdf-text", "allow-remote", "yes-this-is-a-throwaway-account"]);
const OPTIONS = new Set(["url", "api", "state", "only"]);

const args = (() => {
  const given = {};
  const argv = process.argv.slice(2);
  for (let at = 0; at < argv.length; at++) {
    const name = argv[at].replace(/^--/, "");
    if (!argv[at].startsWith("--") || !(FLAGS.has(name) || OPTIONS.has(name))) {
      console.error(`Unknown argument ${argv[at]}\n\n${USAGE}`);
      process.exit(2);
    }
    given[name] = FLAGS.has(name) ? true : argv[++at];
    if (given[name] === undefined) {
      console.error(`--${name} needs a value\n\n${USAGE}`);
      process.exit(2);
    }
  }
  return given;
})();

if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const CLIENT = (args.url ?? "http://localhost:3000").replace(/\/+$/, "");
const API = `${(args.api ?? "http://localhost:8000").replace(/\/+$/, "").replace(/\/api\/v1$/, "")}/api/v1`;
const TOLERANCE = 0.5;

// Makes and deletes CVs, signed in: not for anyone's real site.
const isLocal = (origin) => {
  try {
    const host = new URL(origin).hostname;
    return ["localhost", "127.0.0.1", "[::1]"].includes(host) || host.endsWith(".localhost");
  } catch {
    return false;
  }
};
for (const origin of [CLIENT, API]) {
  if (!isLocal(origin) && !args["allow-remote"]) {
    console.error(`${origin} isn't on this machine. This makes and deletes CVs; pass --allow-remote if you mean it.`);
    process.exit(2);
  }
}
const TYPING_LIMIT = 50;
/** Points the hover pass must point at in a case, at the least: else it hardly checked. */
const HOVER_LEAST = 40;
/** A window as tall as the first sheet and the bar above it, at 100%. */
const HOVER_HEIGHT = 1600;
/** As the page's: how far from the pointer a gap's "+ Section" may be, half its least hover area and some. */
const LEAST_GAP = 16;

const stop = (message) => {
  console.error(message);
  process.exit(2);
};

// --- Browser ----------------------------------------------------------------

const loadPlaywright = async () => {
  const named = (module) => module?.chromium ?? module?.default?.chromium;
  try {
    const found = named(await import("playwright"));
    if (found) return found;
  } catch {
    // Try PLAYWRIGHT_PATH.
  }
  if (process.env.PLAYWRIGHT_PATH) {
    try {
      const found = named(createRequire(import.meta.url)(path.resolve(process.env.PLAYWRIGHT_PATH)));
      if (found) return found;
    } catch {
      // Say how to get it.
    }
  }
  return stop(
    [
      "Playwright is needed and isn't installed. This script adds no dependency; get it with either",
      "  npm install --no-save playwright && npx playwright install chromium      (from client/)",
      "  PLAYWRIGHT_PATH=/path/to/node_modules/playwright node scripts/page-parity.mjs",
      "Google Chrome is used if it is installed, else Playwright's Chromium.",
    ].join("\n")
  );
};

const launch = async (chromium) => {
  try {
    return { browser: await chromium.launch({ channel: "chrome" }), name: "Chrome" };
  } catch {
    return { browser: await chromium.launch(), name: "Chromium" };
  }
};

const signIn = async (browser) => {
  const state = args.state;
  const { PARITY_EMAIL: email, PARITY_PASSWORD: password } = process.env;
  if (!state && !(email && password)) {
    stop(`Say who signs in: --state <file>, or PARITY_EMAIL and PARITY_PASSWORD.\n\n${USAGE}`);
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(state ? { storageState: state } : {}) });
  // The page the CV is edited on, and no printing dialogs.
  await context.addInitScript(() => {
    window.print = () => {};
    try {
      localStorage.setItem("candido:cv-view-2", "page");
    } catch {
      // No storage, no choice.
    }
  });
  if (!state) {
    const page = await context.newPage();
    await page.goto(`${CLIENT}/login`, { timeout: 120000 });
    await page.fill("input[type=email]", email, { timeout: 120000 });
    await page.fill("input[type=password]", password);
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60000 });
    await page.close();
  }
  return context;
};

const apiOf = (context) => async (method, route, data) => {
  const response = await context.request.fetch(API + route, { method, data, timeout: 60000, headers: { Accept: "application/json" } });
  const body = await response.text();
  if (!response.ok()) throw new Error(`${method} ${route}: ${response.status()} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : {};
};

// --- PDF --------------------------------------------------------------------

/** The PDF's text by page, or null with nothing to read it with. */
const pdfTexts = (buffer) => {
  const folder = mkdtempSync(path.join(tmpdir(), "parity-"));
  try {
    const file = path.join(folder, "cv.pdf");
    writeFileSync(file, buffer);
    const custom = process.env.PARITY_PDF_TEXT?.split(" ").filter(Boolean);
    const [command, ...before] = custom ?? ["pdftotext", "-layout"];
    const run = spawnSync(command, [...before, file, ...(custom ? [] : ["-"])], { encoding: "utf8", maxBuffer: 1 << 28 });
    if (run.error || run.status !== 0) return null;
    const pages = run.stdout.split("\f");
    if (pages.at(-1).trim() === "") pages.pop();
    return pages;
  } finally {
    rmSync(folder, { recursive: true });
  }
};

/** From the file itself, as Chrome writes it: the page tree's count. */
const pdfPageCount = (buffer) => {
  const text = buffer.toString("latin1");
  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((each) =>
    Number(each[1] ?? each[2])
  );
  return counts.length > 0 ? Math.max(...counts) : [...text.matchAll(/\/Type\s*\/Page\b(?!s)/g)].length;
};

// --- The fixture ------------------------------------------------------------

const WORDS =
  "led built shipped cut grew mentored designed migrated tested wrote reviewed planned owned scaled tuned moved ran drove shaped taught team service platform queue pipeline release customers billing search latency costs reliability onboarding incidents tooling reports data users partners roadmap".split(
    " "
  );

/** Words that are the same on every run. */
const words = (count, seed) => Array.from({ length: count }, (_, at) => WORDS[(seed * 7 + at * 3) % WORDS.length]).join(" ");

const LABEL = /K\d{4}/g;

const SECTION_NAMES = ["Summary", "Experience", "Projects", "Education", "Skills", "Languages"];

const emptyEntry = { role: null, organization: null, location: null, start_date: null, end_date: null, current: false, description: null, description_off: false, hidden: false };

/**
 * What the fixture holds, built for a number of entries. Each block starts with a
 * label that is found again in the page and in the PDF; blocks left out of the CV
 * carry one too, to check that they aren't there.
 */
const buildFixture = (units) => {
  let labels = 0;
  let ids = 0;
  const present = new Set();
  const absent = new Set();
  const label = (shown = true) => {
    const next = `K${String(++labels).padStart(4, "0")}`;
    (shown ? present : absent).add(next);
    return next;
  };
  const id = () => `i${++ids}`;
  const text = (long, seed) => `${label()} ${words(long ? 34 : 4, seed)}`;
  const hidden = (inner) => `<span data-cv-hidden="true">${inner}</span>`;

  const item = (inner, { off = false, raw = false } = {}) =>
    `<li data-cv-item="${id()}"${off ? ' data-cv-off="true"' : ""}>${raw ? inner : `<p>${inner}</p>`}</li>`;
  const short = (seed) => item(text(false, seed));
  const long = (seed) => item(text(true, seed));
  const rich = (seed) =>
    item(`${label()} ${words(5, seed)} <strong>${words(3, seed + 1)}</strong> and <a href="https://example.com/x">${words(2, seed + 2)}</a> ${words(12, seed + 3)}`);
  const partlyHidden = (seed) => item(`${label()} ${words(8, seed)} ${hidden(`${label(false)} ${words(14, seed + 1)}`)}`);
  const goneHidden = (seed) => item(hidden(words(10, seed)));
  const unticked = (seed) => item(`${label(false)} ${words(10, seed)}`, { off: true });
  const nested = (seed) => item(`<p>${label()} ${words(6, seed)}</p><ul>${short(seed + 1)}${short(seed + 2)}</ul>`, { raw: true });
  const paragraph = (seed, long = true) => `<p data-cv-item="${id()}">${text(long, seed)}</p>`;
  const heading = (seed) => `<h3 data-cv-item="${id()}">${label()} ${words(3, seed)}</h3>`;
  const quote = (seed) => `<blockquote data-cv-item="${id()}"><p>${text(true, seed)}</p></blockquote>`;

  const entryOf = (at, kind) => {
    const base = {
      ...emptyEntry,
      id: `e${at}`,
      title: `${label()} ${words(2, at)}`,
      role: words(2, at + 1),
      organization: `${words(1, at + 2)} co`,
      location: "Leeds",
      start_date: `${2010 + (at % 10)}-0${1 + (at % 9)}-01`,
      end_date: at % 3 === 0 ? null : `${2012 + (at % 10)}-0${1 + ((at + 3) % 9)}-01`,
      current: at % 3 === 0,
    };
    if (kind === 0) {
      // A summary, long and short bullets, a link and bold, hidden text, an unticked bullet.
      const summary = text(true, at);
      return {
        ...base,
        description: summary,
        content: `<ul>${[long(at), short(at + 1), rich(at + 2), unticked(at + 3), partlyHidden(at + 4), long(at + 5), short(at + 6)].join("")}</ul>`,
      };
    }
    if (kind === 1) {
      // Subheadings, a bulleted list and an ordered one.
      return {
        ...base,
        content: `${heading(at)}<ul>${[short(at), short(at + 1), long(at + 2)].join("")}</ul>${heading(at + 3)}<ol>${[long(at + 4), short(at + 5), short(at + 6)].join("")}</ol>`,
      };
    }
    if (kind === 2) {
      // Paragraphs and a quote; a bullet that is all hidden text takes no room.
      return {
        ...base,
        content: `${paragraph(at)}${quote(at + 1)}${paragraph(at + 2, false)}<ul>${[goneHidden(at + 3), long(at + 4), partlyHidden(at + 5)].join("")}</ul>`,
      };
    }
    // An unticked summary and a nested list.
    return {
      ...base,
      description: `${label(false)} ${words(12, at)}`,
      description_off: true,
      content: `<ul>${[short(at), nested(at + 1), long(at + 4)].join("")}</ul>`,
    };
  };

  const untitled = (entryId, content) => ({ ...emptyEntry, id: entryId, title: "", content });

  const header = {
    name: `${label()} Robin Parity`,
    headline: `${label()} Backend engineer`,
    email: "robin@example.com",
    phone: "+44 7700 900123",
    location: "Leeds",
    links: [
      { label: `${label()} Portfolio`, url: "https://example.com/robin" },
      { label: "GitHub", url: "https://github.com/example" },
    ],
  };

  const sections = new Map(SECTION_NAMES.map((name) => [name, []]));
  sections.get("Summary").push(untitled("s0", `${paragraph(1)}${paragraph(2, false)}`));
  const placement = ["Experience", "Projects", "Experience", "Education"];
  for (let at = 0; at < units; at++) sections.get(placement[at % 4]).push(entryOf(at, at % 4));
  sections.get("Skills").push(untitled("k0", `<ul>${Array.from({ length: 8 }, (_, at) => short(at)).join("")}</ul>`));
  sections.get("Languages").push(untitled("l0", `<ul>${short(20)}${short(21)}${short(22)}</ul>`));

  // Headings carry labels too, where the section is shown.
  const shown = [...sections].filter(([, entries]) => entries.length > 0).map(([name, entries]) => ({ name, label: label(), entries }));
  return { header, sections: shown, present, absent };
};

// --- What is measured in the browser ----------------------------------------

/**
 * Runs in the page: where each label is, and the sheets of the Page view. With the
 * page's break rules off, which is all in one go: the page puts them back when it measures.
 */
const scanPage = ({ selector, rulesOff = false }) => {
  const scan = (rootSelector) => {
    const host = document.querySelector(rootSelector);
    const root = host?.matches(".resume-classic") ? host : host?.querySelector(".resume-classic");
    if (!root) return null;
    const origin = root.getBoundingClientRect();
    const labels = {};
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const found of node.data.matchAll(/K\d{4}/g)) {
        const range = document.createRange();
        range.setStart(node, found.index);
        range.setEnd(node, found.index + found[0].length);
        const box = range.getClientRects()[0];
        if (!box || box.width === 0) continue;
        const before = labels[found[0]];
        labels[found[0]] = {
          top: box.top - origin.top,
          left: box.left - origin.left,
          height: box.height,
          y: box.top + box.height / 2,
          count: (before?.count ?? 0) + 1,
        };
      }
    }
    const container = document.querySelector(".paged-cv [aria-hidden]");
    const sheets = container
      ? [...container.children].map((sheet) => {
          const box = sheet.getBoundingClientRect();
          return { top: box.top, height: box.height, scale: box.width / sheet.offsetWidth };
        })
      : null;
    return { labels, sheets, fonts: document.fonts.status === "loaded" };
  };
  const rules = rulesOff
    ? document.adoptedStyleSheets.filter((sheet) => [...sheet.cssRules].some((rule) => rule.cssText.includes("data-cv-page")))
    : [];
  rules.forEach((sheet) => (sheet.disabled = true));
  try {
    return scan(selector);
  } finally {
    rules.forEach((sheet) => (sheet.disabled = false));
  }
};

/** Once its fonts are in and nothing moves. */
const settled = async (page, selector) => {
  let before = "";
  for (let tries = 0; tries < 40; tries++) {
    const now = await page.evaluate(scanPage, { selector });
    const json = JSON.stringify(now);
    if (now?.fonts && json === before && Object.keys(now.labels).length > 0) return now;
    before = json;
    await page.waitForTimeout(300);
  }
  throw new Error("The page didn't settle");
};

const openPage = async (page, id) => {
  await page.goto(`${CLIENT}/resume/${id}`, { timeout: 120000 });
  await page.waitForSelector('[aria-label="CV page"] .resume-classic', { timeout: 120000 });
  // Whatever the window's width, as it prints.
  await page.getByRole("button", { name: "100%" }).first().click({ timeout: 5000 }).catch(() => {});
};

// --- Hover ------------------------------------------------------------------

/**
 * Runs in the page: what to point at on the first sheet, kept in the page to be pointed at one by
 * one: each block, and each section, for the gap above it.
 */
const findHoverTargets = () => {
  const root = document.querySelector("[data-cv-page]");
  // All of the first sheet in the window: the pointer can't go past it, and scrolling would mount editors.
  root?.scrollIntoView({ block: "start", behavior: "instant" });
  const sheet = document.querySelector(".paged-cv [aria-hidden]")?.children[0]?.getBoundingClientRect();
  if (!root || !sheet) return { blocks: [], gaps: 0 };
  const onFirst = (element) => {
    const box = element.getBoundingClientRect();
    return box.height > 0 && box.top >= sheet.top && box.bottom <= Math.min(sheet.bottom, innerHeight);
  };
  const selector = '.rc-heading, [data-block="heading"], [data-block="head"] > *:not(.rc-heading), .rc-summary, [data-cv-item]';
  // An item that holds others is pointed at through them.
  const blocks = [...root.querySelectorAll(selector)].filter((each) => onFirst(each) && !each.querySelector("[data-cv-item]"));
  const gaps = [...root.querySelectorAll("[data-section-id]")].filter(onFirst);
  window.__hover = { blocks, gaps };
  return { blocks: blocks.map((each) => each.textContent.trim().slice(0, 40)), gaps: gaps.length };
};

/**
 * Runs in the page: where to point at a target, in client px. A block's middle and the margin
 * beside its first line, halfway from its column's text to the sheet's edge; or the gap above a
 * section, halfway from the block above it in its column.
 */
const hoverPoint = ({ kind, at }) => {
  const root = document.querySelector("[data-cv-page]");
  const element = window.__hover[kind][at];
  const columns = [...root.querySelectorAll(".rs-side, .rs-main")];
  const column = columns.find((each) => each.contains(element)) ?? root.querySelector(".resume-classic");
  const edges = column.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  if (kind === "blocks") {
    const sheet = document.querySelector(".paged-cv [aria-hidden]").children[0].getBoundingClientRect();
    const right = column.matches(".rs-main");
    return {
      top: box.top,
      bottom: box.bottom,
      middle: { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 },
      margin: { x: right ? (edges.right + sheet.right) / 2 : (sheet.left + edges.left) / 2, y: Math.min(box.top + 8, box.bottom - 1) },
    };
  }
  const above = [...column.querySelectorAll("[data-section-id], [data-block]")]
    .map((each) => each.getBoundingClientRect())
    .filter((each) => each.height > 0 && each.bottom <= box.top + 0.5)
    .reduce((lowest, each) => Math.max(lowest, each.bottom), -Infinity);
  const y = Number.isFinite(above) && box.top - above >= 4 ? (above + box.top) / 2 : box.top - 2;
  return { x: (edges.left + edges.right) / 2, y };
};

/** Runs in the page: records what changes in the page's root from now on. */
const watchRoot = () => {
  const root = document.querySelector("[data-cv-page]");
  window.__rootChanges = [];
  window.__rootWatch?.disconnect();
  window.__rootWatch = new MutationObserver((records) => {
    for (const record of records) {
      const where = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const name = `${where?.tagName?.toLowerCase() ?? "?"}${where?.className ? `.${String(where.className).split(" ")[0]}` : ""}`;
      if (record.type === "childList") {
        record.addedNodes.forEach((node) => window.__rootChanges.push(`added ${node.nodeName.toLowerCase()} in ${name}`));
        record.removedNodes.forEach((node) => window.__rootChanges.push(`removed ${node.nodeName.toLowerCase()} from ${name}`));
      } else window.__rootChanges.push(`${record.type === "attributes" ? `attribute ${record.attributeName}` : "text"} of ${name}`);
    }
  });
  window.__rootWatch.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
};

/** After the frame the pointer is followed in, and React's render of it. */
const nextPaint = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

/**
 * Points at every block of the first sheet, its margin and its gutter's "+", and every gap above a
 * section, and checks that no block moved (0px), the pages are as many, and nothing changed in
 * the page's root. Counts the tools seen, so a pass that shows none is caught too.
 */
const checkHover = async (page, name, before) => {
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport.width, height: HOVER_HEIGHT });
  try {
    return await hoverAll(page, name, before);
  } finally {
    await page.setViewportSize(viewport);
  }
};

const hoverAll = async (page, name, before) => {
  await page.evaluate(findHoverTargets);
  // Editors that mount for what is now in view.
  await settled(page, '[aria-label="CV page"]');
  const { blocks, gaps } = await page.evaluate(findHoverTargets);
  await page.evaluate(watchRoot);
  const counts = { points: 0, gutters: 0, sections: 0 };
  const moved = new Set();
  const check = async (where) => {
    counts.points++;
    const now = await page.evaluate(scanPage, { selector: '[aria-label="CV page"]' });
    if (now.sheets.length !== before.sheets.length) fail(name, "pages change on hover", `${where}: ${before.sheets.length} then ${now.sheets.length}`);
    for (const [label, was] of Object.entries(before.labels)) {
      const is = now.labels[label];
      if (moved.has(label)) continue;
      if (!is || is.top !== was.top || is.left !== was.left || is.height !== was.height) {
        moved.add(label);
        fail(name, "a block moves on hover", `${label} ${where}: top ${was.top.toFixed(2)} then ${is ? is.top.toFixed(2) : "gone"}`);
      }
    }
  };
  const pointAt = async ({ x, y }) => {
    await page.mouse.move(x, y);
    await nextPaint(page);
  };

  const bare = [];
  for (const [at, text] of blocks.entries()) {
    const { top, bottom, middle, margin } = await page.evaluate(hoverPoint, { kind: "blocks", at });
    await pointAt(middle);
    await check(`over block ${at + 1}`);
    await pointAt(margin);
    await check(`beside block ${at + 1}`);
    // This block's, not one lingering from the block before: level with it, or just below a mark there.
    const add = await page.locator('[data-page-gutter] button[aria-label="Add below"]').boundingBox();
    if (add && add.y + add.height >= top && add.y <= bottom + 2 * add.height) {
      counts.gutters++;
      await pointAt({ x: add.x + add.width / 2, y: add.y + add.height / 2 });
      await check(`on block ${at + 1}'s +`);
    } else bare.push(text);
  }
  const noSection = [];
  for (let at = 0; at < gaps; at++) {
    const point = await page.evaluate(hoverPoint, { kind: "gaps", at });
    await pointAt(point);
    // This gap's, not one lingering from the gap before.
    const pill = await page.locator("[data-page-section]").boundingBox();
    if (pill && Math.abs(pill.y + pill.height / 2 - point.y) <= LEAST_GAP) counts.sections++;
    else noSection.push(at + 1);
    await check(`in gap ${at + 1}`);
  }
  await page.mouse.move(0, 0);

  const changes = await page.evaluate(() => {
    window.__rootWatch.disconnect();
    return [...new Set(window.__rootChanges)];
  });
  changes.slice(0, 5).forEach((change) => fail(name, "changed in the page on hover", change));
  if (counts.points < HOVER_LEAST) fail(name, "hover", `only ${counts.points} points pointed at, not ${HOVER_LEAST}`);
  bare.forEach((text) => fail(name, "no gutter by a block", text));
  if (noSection.length > 0) fail(name, 'no "+ Section" in a gap', `above sections ${noSection.join(", ")} of ${gaps}`);
  return counts;
};

// --- Cases ------------------------------------------------------------------

const TEMPLATES = ["classic", "sidebar"];
const PAPERS = ["a4", "letter"];
const FONTS = ["source_sans", "plex_sans", "source_serif", "lora"];
const SIZES = ["medium", "small", "large"];
const PAGES = [1, 2, 3, 4];
const FACTORS = [TEMPLATES, PAPERS, FONTS, SIZES, PAGES];

const everyCase = () => FACTORS.reduce((all, values) => all.flatMap((chosen) => values.map((value) => [...chosen, value])), [[]]);

/** Few enough cases that each pair of values is in at least one: a greedy cover. */
const sampledCases = () => {
  const pairsOf = (chosen) => chosen.flatMap((x, a) => chosen.slice(a + 1).map((y, offset) => `${a}:${x}|${a + 1 + offset}:${y}`));
  const all = everyCase();
  const left = new Set(all.flatMap(pairsOf));
  const picked = [];
  while (left.size > 0) {
    let best = all[0];
    let gain = -1;
    for (const candidate of all) {
      const now = pairsOf(candidate).filter((each) => left.has(each)).length;
      if (now > gain) [best, gain] = [candidate, now];
    }
    pairsOf(best).forEach((each) => left.delete(each));
    picked.push(best);
  }
  return picked;
};

const nameOf = ([template, paper, font, size, pages]) => `${template}/${paper}/${font}/${size}/${pages}p`;

// --- The run ----------------------------------------------------------------

const failures = [];
const fail = (name, kind, detail) => failures.push({ name, kind, detail });

const addSections = async (api, id) => {
  let curriculum;
  for (const name of SECTION_NAMES) ({ curriculum } = await api("POST", `/curriculums/${id}/sections`, { section_type: name }));
  return curriculum.sections.map((section) => section.id);
};

const writeCv = async (api, id, sectionIds, fixture) => {
  await api("PUT", `/curriculums/${id}`, { header: fixture.header });
  for (const [at, name] of SECTION_NAMES.entries()) {
    const section = fixture.sections.find((each) => each.name === name);
    await api(
      "PUT",
      `/curriculums/${id}/sections/${sectionIds[at]}`,
      section ? { section_type: `${section.label} ${name}`, hidden: false, entries: section.entries } : { hidden: true }
    );
  }
};

/** Makes the CV as long as the case says, by the pages the PDF has. */
const fit = async (page, api, id, sectionIds, [template, paper, font, size, pages], hint) => {
  await api("PUT", `/curriculums/${id}`, { styles: { paper, template, font, size } });
  let units = hint;
  let low = 0;
  let high = Infinity;
  for (let tries = 0; tries < 12; tries++) {
    const fixture = buildFixture(units);
    await writeCv(api, id, sectionIds, fixture);
    await page.goto(`${CLIENT}/resume/${id}/print`, { timeout: 120000 });
    await page.waitForSelector(".resume-classic", { timeout: 120000 });
    const print = await settled(page, ".resume-classic");
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const got = pdfPageCount(pdf);
    if (got === pages) return { fixture, print, pdf, units };
    if (got < pages) low = Math.max(low, units);
    else high = Math.min(high, units);
    const guess = Math.round((units * (pages - 0.3)) / Math.max(got - 0.3, 0.3));
    const next = Math.min(Math.max(guess, low + 1), Number.isFinite(high) ? high - 1 : 99);
    if (next <= low || next === units) break;
    units = next;
  }
  throw new Error(`No fixture makes ${pages} page(s) here`);
};

const runCase = async (page, api, id, sectionIds, chosen, hint) => {
  const name = nameOf(chosen);
  const { fixture, print, pdf, units } = await fit(page, api, id, sectionIds, chosen, hint);
  const pdfPages = pdfPageCount(pdf);
  const texts = pdfTexts(pdf);

  await openPage(page, id);
  const shown = await settled(page, '[aria-label="CV page"]');
  const flowing = await page.evaluate(scanPage, { selector: '[aria-label="CV page"]', rulesOff: true });

  const expected = [...fixture.present];
  for (const label of expected) {
    if (!print.labels[label]) fail(name, "not in the print page", label);
    if (!shown.labels[label]) fail(name, "not in the Page view", label);
  }
  for (const label of fixture.absent) {
    if (print.labels[label]) fail(name, "left out, but in the print page", label);
    if (shown.labels[label]) fail(name, "left out, but in the Page view", label);
  }
  for (const [label, found] of Object.entries(shown.labels)) {
    if (found.count > 1) fail(name, "twice in the Page view", label);
    if (!print.labels[label]) fail(name, "only in the Page view", label);
  }

  // Where each block is, as the page flows, against as the print page does.
  let worst = 0;
  for (const [label, was] of Object.entries(print.labels)) {
    const now = flowing.labels[label];
    if (!now) {
      fail(name, "not in the Page view without breaks", label);
      continue;
    }
    const off = Math.max(Math.abs(now.top - was.top), Math.abs(now.left - was.left), Math.abs(now.height - was.height));
    worst = Math.max(worst, off);
    if (off > TOLERANCE) fail(name, `place without breaks differs by ${off.toFixed(2)}px`, `${label}: top ${was.top.toFixed(1)} on the print page, ${now.top.toFixed(1)} here`);
  }

  // The sheet each block is on, against the PDF's.
  const { sheets } = shown;
  if (sheets.some((sheet) => Math.abs(sheet.scale - 1) > 0.001)) fail(name, "the page isn't at 100%", `scale ${sheets[0].scale}`);
  if (sheets.length !== pdfPages) fail(name, "page count", `Page view ${sheets.length}, PDF ${pdfPages}`);
  const pageOf = (found) => sheets.findLastIndex((sheet) => sheet.top <= found.y);
  for (const [label, found] of Object.entries(shown.labels)) {
    const sheet = sheets[pageOf(found)];
    if (!sheet || found.y > sheet.top + sheet.height) fail(name, "outside its sheet", label);
  }
  let onPdf = 0;
  if (texts) {
    if (texts.length !== pdfPages) fail(name, "PDF text pages", `${texts.length} read, ${pdfPages} in the file`);
    const inPdf = {};
    texts.forEach((text, at) => {
      for (const found of text.replace(/\s+/g, "").matchAll(LABEL)) inPdf[found[0]] ??= at;
    });
    onPdf = Object.keys(inPdf).length;
    for (const label of expected) {
      if (!(label in inPdf)) fail(name, "not in the PDF", label);
      else if (shown.labels[label] && pageOf(shown.labels[label]) !== inPdf[label]) {
        fail(name, "on another page", `${label}: Page view ${pageOf(shown.labels[label]) + 1}, PDF ${inPdf[label] + 1}`);
      }
    }
    for (const label of fixture.absent) if (label in inPdf) fail(name, "left out, but in the PDF", label);
  }
  // Last: it moves the pointer.
  const hover = args["no-hover"] ? null : await checkHover(page, name, shown);
  return { name, units, blocks: expected.length, onPdf, pages: `${sheets.length}/${pdfPages}`, worst, read: texts !== null, hover };
};

// --- Typing -----------------------------------------------------------------

const measureTyping = async (page, api, id) => {
  const item = (section, at) => `<li data-cv-item="t${section}-${at}"><p>K${section}${at} ${words(18, section + at)}</p></li>`;
  for (let at = 0; at < 40; at++) {
    const { curriculum } = await api("POST", `/curriculums/${id}/sections`, { section_type: `Typing ${at}` });
    const entries = [0, 1].map((entry) => ({
      ...emptyEntry,
      id: `t${at}-${entry}`,
      title: `Role ${at} ${entry}`,
      content: `<ul>${Array.from({ length: 5 }, (_, each) => item(at * 2 + entry, each)).join("")}</ul>`,
    }));
    await api("PUT", `/curriculums/${id}/sections/${curriculum.sections.at(-1).id}`, { entries });
  }
  await openPage(page, id);
  await page.waitForTimeout(4000);
  const sizes = await page.evaluate(() => ({
    sections: document.querySelectorAll("[data-section-id]").length,
    items: document.querySelectorAll(".paged-cv li").length,
    editors: document.querySelectorAll(".ProseMirror").length,
  }));
  await page.evaluate(() => {
    window.__keys = [];
    addEventListener(
      "keydown",
      (event) => {
        // From when the key was pressed, not when this ran.
        const start = event.timeStamp;
        // After the paint that follows the key.
        requestAnimationFrame(() => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => window.__keys.push(performance.now() - start);
          channel.port2.postMessage(0);
        });
      },
      true
    );
  });
  const results = [];
  const problems = [];
  if (sizes.items < 400) problems.push(`only ${sizes.items} items on the page, not 400`);
  for (const [where, at] of [["first item", 2], ["middle item", 200], ["last item", 395]]) {
    const target = page.locator(".paged-cv .rc-body li").nth(at);
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await page.waitForTimeout(800);
    const typed = "the quick brown fox jumps over lazy dogs";
    const focused = await page.evaluate(() => Boolean(document.activeElement?.closest(".ProseMirror")));
    await page.evaluate(() => (window.__keys.length = 0));
    await page.keyboard.type(typed, { delay: 60 });
    await page.waitForTimeout(500);
    const landed = await page.evaluate((typed) => getSelection()?.anchorNode?.parentElement?.closest("li")?.textContent.includes(typed) ?? false, typed);
    if (!focused) problems.push(`${where}: the click didn't focus an editor`);
    if (!landed) problems.push(`${where}: the typed text isn't in the item`);
    const keys = await page.evaluate(() => window.__keys.slice().sort((a, b) => a - b));
    const share = (part) => keys[Math.min(keys.length - 1, Math.floor(keys.length * part))];
    if (keys.length === 0 || keys.length !== typed.length) problems.push(`${where}: ${keys.length} keys timed, ${typed.length} sent`);
    results.push({ where, keys: keys.length, median: share(0.5), p95: share(0.95), max: keys.at(-1) });
  }
  return { sizes, results, problems };
};

// --- Main -------------------------------------------------------------------

const main = async () => {
  const chromium = await loadPlaywright();
  const { browser, name: browserName } = await launch(chromium);
  const context = await signIn(browser);
  const api = apiOf(context);
  const made = [];
  const cleanup = async () => {
    while (made.length > 0) await api("DELETE", `/curriculums/${made.pop()}`).catch((error) => console.error(`Couldn't delete a CV: ${error.message}`));
  };
  let interrupted = false;
  process.on("SIGINT", () => {
    interrupted = true;
    fail("run", "interrupted", "SIGINT");
    void cleanup().finally(() => process.exit(130));
  });

  try {
    const { curriculums } = await api("GET", "/curriculums");
    const others = curriculums.filter((cv) => !cv.title.startsWith("Parity"));
    if (others.length > 0 && !args["yes-this-is-a-throwaway-account"]) {
      await browser.close();
      stop(
        `This account has ${others.length} CV(s) not titled "Parity ...", so it may not be a throwaway one. ` +
          "Sign in to one that is, or pass --yes-this-is-a-throwaway-account."
      );
    }
    // Left by a run that was killed.
    for (const cv of curriculums.filter((each) => ["Parity check", "Parity typing"].includes(each.title))) {
      await api("DELETE", `/curriculums/${cv.id}`);
    }

    const page = await context.newPage();
    page.on("pageerror", (error) => console.error(`Page error: ${error.message.slice(0, 200)}`));

    if (args.typing) {
      const { curriculum } = await api("POST", "/curriculums", { title: "Parity typing" });
      made.push(curriculum.id);
      const { sizes, results, problems } = await measureTyping(page, api, curriculum.id);
      console.log(`Typing in ${browserName}: ${sizes.sections} sections, ${sizes.items} items, ${sizes.editors} editors on the page`);
      console.table(
        results.map((each) => ({ where: each.where, keys: each.keys, "median ms": +each.median.toFixed(1), "p95 ms": +each.p95.toFixed(1), "max ms": +each.max.toFixed(1) }))
      );
      const slow = results.filter((each) => each.p95 > TYPING_LIMIT);
      console.log(slow.length > 0 ? `FAIL: p95 over ${TYPING_LIMIT}ms at ${slow.map((each) => each.where).join(", ")}` : `ok: p95 within ${TYPING_LIMIT}ms`);
      problems.forEach((problem) => console.log(`FAIL: ${problem}`));
      process.exitCode = slow.length > 0 || problems.length > 0 ? 1 : 0;
      return;
    }

    const cases = (args.all ? everyCase() : sampledCases()).filter((chosen) => nameOf(chosen).includes(args.only ?? ""));
    if (cases.length === 0) {
      console.error(`No case has "${args.only}" in its name, such as classic/a4/lora/medium/2p`);
      process.exitCode = 2;
      return;
    }
    if (!args["no-pdf-text"] && pdfTexts(await page.pdf()) === null) {
      console.error("No PDF text reader: install pdftotext (poppler) or set PARITY_PDF_TEXT, or pass --no-pdf-text to compare only the number of pages.");
      process.exitCode = 2;
      return;
    }
    const { curriculum } = await api("POST", "/curriculums", { title: "Parity check" });
    made.push(curriculum.id);
    const sectionIds = await addSections(api, curriculum.id);
    console.log(`${cases.length} cases in ${browserName}${args.all ? "" : " (a sample: each pair of values at least once; --all for every one)"}`);

    const rows = [];
    let perPage = 3;
    for (const chosen of cases) {
      if (interrupted) break;
      const before = failures.length;
      const started = Date.now();
      let row;
      try {
        row = await runCase(page, api, curriculum.id, sectionIds, chosen, Math.max(1, Math.round(perPage * chosen[4])));
        perPage = Math.max(0.5, row.units / chosen[4]);
      } catch (error) {
        fail(nameOf(chosen), "couldn't run", error.message);
        row = { name: nameOf(chosen) };
      }
      row.result = failures.length === before ? "ok" : "FAIL";
      row.seconds = Math.round((Date.now() - started) / 1000);
      rows.push(row);
      console.log(`${row.result.padEnd(4)} ${row.name} ${row.pages ? `pages ${row.pages}, ${row.blocks} blocks (${row.onPdf} placed by the PDF), worst ${row.worst.toFixed(2)}px, ` : ""}${row.hover ? `hovered ${row.hover.points} points (${row.hover.gutters} gutters, ${row.hover.sections} "+ Section"), ` : ""}${row.seconds}s`);
    }

    console.log("");
    if (failures.length > 0) {
      console.log("Failures");
      const shown = failures.slice(0, 60);
      console.table(shown.map(({ name, kind, detail }) => ({ case: name, difference: kind, where: detail })));
      if (failures.length > shown.length) console.log(`... and ${failures.length - shown.length} more`);
    }
    const bad = new Set(failures.map((each) => each.name)).size;
    const blocks = rows.reduce((sum, row) => sum + (row.blocks ?? 0), 0);
    const onPdf = rows.reduce((sum, row) => sum + (row.onPdf ?? 0), 0);
    const read = rows.every((row) => row.read !== false);
    const hovered = rows.reduce((sum, row) => sum + (row.hover?.points ?? 0), 0);
    console.log(
      `${rows.length} cases, ${rows.length - bad} ok, ${bad} failed; ${blocks} blocks compared with the print page, ${onPdf} with the page they are on in the PDF` +
        (args["no-hover"] ? "." : `; ${hovered} points hovered.`)
    );
    if (!read) {
      console.log("No PDF text reader (pdftotext, or PARITY_PDF_TEXT): only the number of pages was compared with the PDF, not which page each block is on.");
    }
    process.exitCode = bad > 0 || rows.length === 0 ? 1 : 0;
  } finally {
    await cleanup();
    await browser.close().catch(() => {});
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
