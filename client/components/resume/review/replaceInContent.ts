import { listItems, mergeVisible, setItemsOff, visibleContent } from "@/lib/resume/items";
import Link from "@tiptap/extension-link";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CvItem from "../CvItem";
import { normalizeContent } from "../documentContent";
import HiddenMark from "../HiddenMark";
import { replaceQuote, SuggestionHighlight } from "./SuggestionHighlight";

/** What an entry's editor reads and writes. */
export const contentExtensions = [
  TextStyleKit,
  StarterKit,
  Link.configure({ openOnClick: false }),
  HiddenMark,
  CvItem,
  SuggestionHighlight,
];

const replaceIn = (html: string, quote: string, text: string): string | null => {
  const editor = new Editor({ extensions: contentExtensions, content: html });
  try {
    return replaceQuote(editor, quote, text) ? normalizeContent(editor.getHTML()) : null;
  } finally {
    editor.destroy();
  }
};

/** replaceQuote for content that no editor shows, in ticked items first. Null if the quote isn't in it. */
export const replaceInContent = (html: string, quote: string, text: string): string | null => {
  const visible = replaceIn(visibleContent(html), quote, text);
  if (visible !== null) return mergeVisible(html, visible);

  // The editor drops ticks.
  const off = listItems(html).filter((item) => item.off).map(({ id }) => id);
  const all = replaceIn(html, quote, text);
  return all === null ? null : setItemsOff(all, off, true);
};
