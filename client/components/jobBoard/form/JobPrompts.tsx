import ConfirmationModal from "@/components/common/ConfirmationModal";
import { JobAutosave } from "@/lib/jobBoard/useJobAutosave";
import { JobBoardEntry } from "@/lib/types";

interface JobPromptsProps {
  entry: JobBoardEntry;
  form: JobAutosave;
  isDeleteOpen: boolean;
  onDeleteClose: () => void;
  onDelete: () => void;
}

/** What editing a job may need to ask: about edits that can't be saved, and before deleting it. */
const JobPrompts = ({ entry, form, isDeleteOpen, onDeleteClose, onDelete }: JobPromptsProps) => (
  <>
    <ConfirmationModal
      isOpen={form.isLeaveBlocked}
      onClose={form.keepEditing}
      onConfirm={form.discardAndLeave}
      title={form.incomplete ? "Add a title and company to save" : "Couldn't save your changes"}
      description={form.incomplete ? "Discard your changes and continue, or keep editing?" : "Discard them and continue, or keep editing?"}
      confirmLabel="Discard and continue"
      cancelLabel="Keep editing"
      variant="destructive"
    />
    <ConfirmationModal
      isOpen={isDeleteOpen}
      onClose={onDeleteClose}
      onConfirm={onDelete}
      title="Delete job?"
      description={`Are you sure you want to delete "${entry.title}" at ${entry.company}? This cannot be undone.`}
      confirmLabel="Delete"
      variant="destructive"
    />
  </>
);

export default JobPrompts;
