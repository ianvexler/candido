"use client";

import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  BoldIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  Heading3Icon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  StrikethroughIcon,
  Undo2Icon,
  Unlink2Icon,
} from "lucide-react";
import { FormEvent, useState } from "react";
import IconAction from "./IconAction";

const useFormatState = (editor: Editor) =>
  useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      link: e.isActive("link"),
      hidden: e.isActive("hidden"),
      heading: e.isActive("heading", { level: 3 }),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />;

// Keeps the editor's selection when a toolbar button is pressed.
const keepSelection = (event: { preventDefault: () => void }) => event.preventDefault();

/** Appears over selected text: inline formatting, links, and hide/show. */
export const FormatBubble = ({ editor }: { editor: Editor }) => {
  const state = useFormatState(editor);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);

  const applyLink = (event: FormEvent) => {
    event.preventDefault();
    const url = linkDraft?.trim();
    if (url) {
      const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkDraft(null);
  };

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ from, to }) => from !== to}
      options={{ placement: "top" }}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-1 shadow-lg"
    >
      {linkDraft !== null ? (
        <form onSubmit={applyLink} className="flex items-center gap-1">
          <input
            autoFocus
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setLinkDraft(null);
            }}
            placeholder="Paste a link"
            aria-label="Link address"
            className="h-8 w-56 rounded-md bg-muted/60 px-2 text-sm outline-none"
          />
          <IconAction label="Apply link" type="submit">
            <CheckIcon />
          </IconAction>
        </form>
      ) : (
        <>
          <IconAction label="Bold" active={state.bold} onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleBold().run()}>
            <BoldIcon />
          </IconAction>
          <IconAction label="Italic" active={state.italic} onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <ItalicIcon />
          </IconAction>
          <IconAction label="Strikethrough" active={state.strike} onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <StrikethroughIcon />
          </IconAction>
          {state.link ? (
            <IconAction label="Remove link" active onMouseDown={keepSelection} onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
              <Unlink2Icon />
            </IconAction>
          ) : (
            <IconAction label="Add link" onMouseDown={keepSelection} onClick={() => setLinkDraft("")}>
              <Link2Icon />
            </IconAction>
          )}
          <Divider />
          {state.hidden ? (
            <BubbleTextButton
              label="Show"
              hint="Put this text back in the resume"
              onClick={() => editor.chain().focus().unsetHidden().run()}
            >
              <EyeIcon />
            </BubbleTextButton>
          ) : (
            <BubbleTextButton
              label="Hide"
              hint="Keep this text here but leave it out of the resume"
              onClick={() => editor.chain().focus().setHidden().run()}
            >
              <EyeOffIcon />
            </BubbleTextButton>
          )}
        </>
      )}
    </BubbleMenu>
  );
};

const BubbleTextButton = ({
  label,
  hint,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onMouseDown={keepSelection}
        onClick={onClick}
        className="h-8 gap-1.5 px-2.5 text-sm"
      >
        {children}
        {label}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{hint}</TooltipContent>
  </Tooltip>
);

/** Block formatting, shown only while the section is being edited. */
export const BlockToolbar = ({ editor, className }: { editor: Editor; className?: string }) => {
  const state = useFormatState(editor);

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={cn("flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-sm", className)}
    >
      <IconAction label="Subheading" active={state.heading} onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3Icon />
      </IconAction>
      <IconAction label="Bulleted list (type - and a space)" active={state.bulletList} onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <ListIcon />
      </IconAction>
      <IconAction label="Numbered list (type 1. and a space)" active={state.orderedList} onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrderedIcon />
      </IconAction>
      <IconAction label="Quote" active={state.blockquote} onMouseDown={keepSelection} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <QuoteIcon />
      </IconAction>
      <Divider />
      <IconAction label="Undo" disabled={!state.canUndo} onMouseDown={keepSelection} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2Icon />
      </IconAction>
      <IconAction label="Redo" disabled={!state.canRedo} onMouseDown={keepSelection} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2Icon />
      </IconAction>
    </div>
  );
};
