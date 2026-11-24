import { Node } from "@tiptap/core";

const LANGUAGE = "language-";

/** Code blocks as StarterKit reads and writes them, without ways to make one. */
const ShownCode = Node.create({
  name: "codeBlock",
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,

  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: (element) =>
          [...(element.firstElementChild?.classList ?? [])]
            .find((name) => name.startsWith(LANGUAGE))
            ?.slice(LANGUAGE.length) ?? null,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: "pre", preserveWhitespace: "full" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { language } = node.attrs;
    return ["pre", HTMLAttributes, ["code", { class: language ? LANGUAGE + language : null }, 0]];
  },
});

export default ShownCode;
