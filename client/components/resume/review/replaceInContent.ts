import { listItems, mergeVisible, setItemsOff, visibleContent } from "@/lib/resume/items";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Editor, type Extensions } from "@tiptap/core";
import StarterKit, { type StarterKitOptions } from "@tiptap/starter-kit";
import CvItem from "../CvItem";
import { normalizeContent } from "../documentContent";
import HiddenMark from "../HiddenMark";
import { replaceQuote, SuggestionHighlight } from "./SuggestionHighlight";

export const contentExtensionsWith = (options: Partial<StarterKitOptions>): Extensions => [
  TextStyleKit,
  // Without the blank line it keeps after a list: Enter twice leaves a list.
  // Pressing a link edits its text.
  StarterKit.configure({ link: { openOnClick: false }, ...options, trailingNode: false }),
  HiddenMark,
  CvItem,
  SuggestionHighlight,
];

/** What an entry's editor reads and writes. */
export const contentExtensions = contentExtensionsWith({});

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
