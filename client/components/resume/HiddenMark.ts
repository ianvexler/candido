import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    hidden: {
      setHidden: () => ReturnType;
      unsetHidden: () => ReturnType;
      toggleHidden: () => ReturnType;
    };
  }
}

const HiddenMark = Mark.create({
  name: "hidden",
  inclusive: false,
  parseHTML() {
    return [{ tag: "span[data-cv-hidden]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-cv-hidden": "true" }), 0];
  },
  addCommands() {
    return {
      setHidden:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      unsetHidden:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
      toggleHidden:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});

export default HiddenMark;
