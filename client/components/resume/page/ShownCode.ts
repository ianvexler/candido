import { Mark, Node } from "@tiptap/core";

const LANGUAGE = "language-";

/** Code as StarterKit reads and writes it, without ways to make some. */
export const ShownCode = Mark.create({
  name: "code",
  excludes: "_",
  code: true,
  exitable: true,

  parseHTML() {
    return [{ tag: "code" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["code", HTMLAttributes, 0];
  },
});

/** The same for code blocks. */
export const ShownCodeBlock = Node.create({
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
