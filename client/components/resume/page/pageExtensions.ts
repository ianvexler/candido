import { type AnyExtension, Extension, InputRule, Mark, Node } from "@tiptap/core";
import { contentExtensionsWith } from "../review/replaceInContent";
import HiddenGuard, { hiddenBetween } from "./HiddenGuard";
import PrintedBlocks from "./PrintedBlocks";
import PrivateCopy from "./PrivateCopy";
import { ShownCode, ShownCodeBlock } from "./ShownCode";

/** Shorthand such as ** isn't taken from, or around, text that can't be seen: it stays as typed. */
const outsideHidden = (rule: InputRule) =>
  new InputRule({
    find: rule.find,
    undoable: rule.undoable,
    handler: (props) => {
      const { from, to } = props.range;
      return from < to && hiddenBetween(props.state.doc, from, to) ? null : rule.handler(props);
    },
  });

const withSafeRules = (extension: AnyExtension): AnyExtension => {
  const config = {
    addInputRules(this: { parent?: (() => InputRule[]) | null }) {
      return (this.parent?.() ?? []).map(outsideHidden);
    },
  };
  if (extension instanceof Node) return extension.extend(config);
  if (extension instanceof Mark) return extension.extend(config);
  if (extension.name !== "starterKit") return extension;
  return (extension as Extension).extend({
    addExtensions() {
      return (this.parent?.() ?? []).map(withSafeRules);
    },
  });
};

/** What an entry's editor on the page reads and writes. */
export const pageExtensions = [
  // New code isn't offered: making it would show hidden text.
  ...contentExtensionsWith({ code: false, codeBlock: false }).map(withSafeRules),
  ShownCode,
  ShownCodeBlock,
  HiddenGuard,
  PrivateCopy,
  PrintedBlocks,
];
