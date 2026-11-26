import "@/components/richEditor/styles.scss";
import SimpleMenuBar from "@/components/richEditor/simpleEditor/SimpleMenuBar";
import { cn } from "@/lib/utils";
import { Editor, EditorContent } from "@tiptap/react";

interface DescriptionEditorProps {
  /** Null until the browser has built it. */
  editor: Editor | null;
  className?: string;
  contentClassName?: string;
}

const DescriptionEditor = ({ editor, className, contentClassName }: DescriptionEditorProps) => (
  <div className={cn("simple-editor-wrapper overflow-hidden rounded-lg border border-border bg-background", className)}>
    {editor && <SimpleMenuBar editor={editor} />}
    <EditorContent
      editor={editor}
      // Clicking below the text writes in it too.
      onClick={(event) => event.target === event.currentTarget && editor?.commands.focus("end")}
      className={cn("cursor-text", contentClassName)}
    />
  </div>
);

export default DescriptionEditor;
