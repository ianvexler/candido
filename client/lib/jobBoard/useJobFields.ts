import { TextStyleKit } from "@tiptap/extension-text-style";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useState } from "react";
import { JobFieldValues } from "./jobFields";

export type SetJobField = <K extends keyof JobFieldValues>(field: K, value: JobFieldValues[K]) => void;

/**
 * A job form's values and its description editor. `initial` is only read once: what's typed is never
 * replaced by a save's response, so mount it again (key it by the job) for another job.
 */
export const useJobFields = (initial: JobFieldValues) => {
  const [fields, setFields] = useState(initial);

  const setField: SetJobField = useCallback(
    (field, value) => setFields((current) => ({ ...current, [field]: value })),
    []
  );

  const editor = useEditor({
    extensions: [TextStyleKit, StarterKit],
    immediatelyRender: false,
    content: initial.description,
    onUpdate: ({ editor: current }) => setField("description", current.getHTML()),
  });

  const reset = useCallback(
    (values: JobFieldValues) => {
      editor?.commands.setContent(values.description);
      // After the editor, whose update would otherwise restate the description in its own markup.
      setFields(values);
    },
    [editor]
  );

  return { fields, setField, reset, editor };
};
