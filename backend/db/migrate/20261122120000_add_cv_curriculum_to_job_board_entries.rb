# A job's CV is one slot: an uploaded file, pasted text, or a copy of a resume
# made for that job. Deleting the copy empties the slot.
class AddCvCurriculumToJobBoardEntries < ActiveRecord::Migration[8.0]
  def up
    add_reference :job_board_entries, :cv_curriculum, type: :bigint, index: true,
      foreign_key: { to_table: :curriculums, on_delete: :nullify }

    # Jobs with no uploaded CV adopt their newest tailored copy.
    execute <<~SQL.squish
      UPDATE job_board_entries
      SET cv_curriculum_id = (
        SELECT curriculums.id FROM curriculums
        WHERE curriculums.job_board_entry_id = job_board_entries.id
        ORDER BY curriculums.created_at DESC, curriculums.id DESC
        LIMIT 1
      )
      WHERE cv_key IS NULL AND cv_text IS NULL
    SQL
  end

  def down
    remove_reference :job_board_entries, :cv_curriculum, index: true, foreign_key: { to_table: :curriculums }
  end
end
