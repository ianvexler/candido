import { afterEach, describe, expect, it, vi } from "vitest";
import { listItems, mergeVisible, setItemsOff, visibleContent } from "./items";

const attrs = (id: string, off = false) => `data-cv-item="${id}"${off ? ' data-cv-off="true"' : ""}`;
const li = (id: string, off = false, inner = `<p>${id}</p>`) => `<li ${attrs(id, off)}>${inner}</li>`;
const p = (id: string, off = false) => `<p ${attrs(id, off)}>${id}</p>`;
const ul = (...items: string[]) => `<ul>${items.join("")}</ul>`;
const ol = (...items: string[]) => `<ol>${items.join("")}</ol>`;
const ids = (html: string) => listItems(html).map((item) => item.id);

afterEach(() => vi.restoreAllMocks());

describe("listItems", () => {
  it("lists top-level blocks and list items, not blank or nested ones", () => {
    const html =
      p("a") +
      '<p data-cv-item="blank">&nbsp;<br></p><hr>' +
      ul(li("b", false, "<p>B</p><ul><li><p>C</p></li></ul>"), "<li><p></p></li>") +
      `<blockquote ${attrs("q", true)}><p>Q</p><ul><li>R</li></ul></blockquote><h6 ${attrs("h")}>H</h6>` +
      '<li data-cv-item="stray">S</li>';

    expect(listItems(html).map(({ id, text, off }) => ({ id, text, off }))).toEqual([
      { id: "a", text: "a", off: false },
      { id: "b", text: "B C", off: false },
      { id: "q", text: "Q R", off: true },
      { id: "h", text: "H", off: false },
    ]);
  });

  it("takes a false tick attribute as ticked and Unicode spaces as blank, as the server does", () => {
    expect(listItems('<p data-cv-item="a" data-cv-off="false">A</p>')[0].off).toBe(false);
    expect(listItems("<p>\u0085  </p>")).toEqual([]);
    expect(listItems("<p>﻿</p>")).toHaveLength(1);
  });

  // Content and item html as CvItems gives them.
  const stored = [
    '<p data-cv-item="a">A &amp; B&nbsp;C &lt;x&gt; "q" \'s\' é — <br>D<strong>e</strong></p>',
    '<li style="color:red;" data-cv-item="b"><p><a target="_blank" rel="noopener" href="https://x.com/?a=1&amp;b=<c>%22\'&nbsp;d">l</a><span data-cv-hidden="">h</span></p><hr><ol><li>n</li></ol></li>',
  ];

  it("gives an item's html byte for byte as the server does", () => {
    const content =
      stored[0].replace('"a"', '"a" data-cv-off="true"') + ul(stored[1].replace("<li style", '<li data-cv-off="true" style'));
    expect(listItems(content).map((item) => item.html)).toEqual(stored);
  });

  it("undoes the escaping of < and > that newer browsers add to attributes", () => {
    vi.spyOn(Element.prototype, "outerHTML", "get").mockReturnValue('<p title="a&lt;b&gt; &amp;lt;">1 &lt; 2</p>');
    expect(listItems("<p>x</p>")[0].html).toBe('<p title="a<b> &amp;lt;">1 &lt; 2</p>');
  });
});

describe("setItemsOff", () => {
  it("changes the given items only", () => {
    const html = p("a") + ul(li("b", true), li("c", true));
    expect(setItemsOff(html, ["b"], false)).toBe(p("a") + ul(li("b"), li("c", true)));
    expect(setItemsOff(html, ["a"], true)).toBe(p("a", true) + ul(li("b", true), li("c", true)));
  });
});

describe("visibleContent", () => {
  it("drops unticked items and lists left empty, without joining lists", () => {
    expect(visibleContent(ul(li("a")) + p("b", true) + ul(li("c")) + ol(li("d", true)))).toBe(ul(li("a")) + ul(li("c")));
  });

  it("leaves the rest alone", () => {
    const html = "<p>A</p><p></p><ul></ul><ol><li><p></p></li></ol>text<hr>";
    expect(visibleContent(html)).toBe(html);
  });
});

const fixtures = [
  ul(li("a", true), li("b"), li("c", true), li("d"), li("e", true)),
  p("a") + ul(li("b", true), li("c", true)) + p("d"),
  ul(li("a")) + p("b", true) + ul(li("c")),
  ul(li("a"), li("b", true)) + ol(li("c", true), li("d")),
  ul(li("a", true)) + ol(li("b")),
  ul(li("a")) + ol(li("b", true)) + ul(li("c")),
  ul(li("a", false, `<p>a</p>${ul("<li>x</li>")}`), li("b", true, `<p>b</p>${ol("<li>y</li>")}`), li("c")),
  `<h2 ${attrs("a", true)}>A</h2>` + p("b") + `<blockquote ${attrs("c", true)}><p>C</p><p>D</p></blockquote>` + ul(li("d")),
  ul(li("a", true)) + p("b", true),
  p("a") + "<p></p><hr>" + p("b", true) + "<hr>" + p("c"),
  ul(li("a"), "<li><p></p></li>", li("b", true), li("c")),
  p("a"),
];

describe("mergeVisible", () => {
  it.each(fixtures)("puts unticked items back where they were", (full) =>
    expect(mergeVisible(full, visibleContent(full))).toBe(full));

  it.each(fixtures)("puts them back when the editor adds an empty last paragraph", (full) =>
    expect(mergeVisible(full, `${visibleContent(full)}<p></p>`)).toBe(`${full}<p></p>`));

  it("keeps unticked items when all visible text is deleted", () => {
    const full = ul(li("a"), li("b", true), li("c"));
    expect(ids(mergeVisible(full, "<p></p>"))).toEqual(["b"]);
    expect(ids(mergeVisible(full, ""))).toEqual(["b"]);
  });

  it("keeps an unticked item's place when the one before it is deleted", () =>
    expect(ids(mergeVisible(ul(li("a"), li("b"), li("c", true), li("d")), ul(li("a"), li("d"))))).toEqual(["a", "c", "d"]));

  it("keeps its place after an item whose text was just cleared", () => {
    const visible = ul(li("a"), li("b", false, "<p></p>"), li("d"));
    expect(mergeVisible(ul(li("a"), li("b"), li("c", true), li("d")), visible)).toBe(
      ul(li("a"), li("b", false, "<p></p>"), li("c", true), li("d"))
    );
  });

  it("loses no item and keeps the order between adjacent lists of one kind", () => {
    const full = ul(li("a", true)) + ul(li("b")) + ul(li("c", true)) + ul(li("d", true)) + ul(li("e"));
    expect(ids(mergeVisible(full, visibleContent(full)))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("never reorders unticked items when the visible ones are reordered", () => {
    const full = ul(li("a"), li("x", true), li("b"), li("y", true), li("c"));
    expect(ids(mergeVisible(full, ul(li("c"), li("b"), li("a"))))).toEqual(["c", "b", "a", "x", "y"]);
  });

  it("splits a list when a paragraph lands inside it", () =>
    expect(mergeVisible(ul(li("a")) + p("b", true) + ul(li("c")), ul(li("a"), li("c")))).toBe(
      ul(li("a")) + p("b", true) + ul(li("c"))
    ));

  it("splits a list for an item of the other kind", () =>
    expect(mergeVisible(ul(li("a")) + ol(li("b", true)), ul(li("a"), li("n")))).toBe(
      ul(li("a")) + ol(li("b", true)) + ul(li("n"))
    ));

  it("uses the visible version once of an item that is also unticked", () =>
    expect(mergeVisible(ul(li("a"), li("b", true), li("c", true)), ul(li("a"), li("b", false, "<p>B2</p>")))).toBe(
      ul(li("a"), li("b", false, "<p>B2</p>"), li("c", true))
    ));
});
