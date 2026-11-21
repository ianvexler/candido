# Runs count toward the daily limit, so they outlive the CV they reviewed:
# deleting a tailored copy clears the link instead of the run.
class KeepCvTailoringsWhenCurriculumDeleted < ActiveRecord::Migration[8.0]
  def up
    remove_foreign_key :cv_tailorings, :curriculums
    change_column_null :cv_tailorings, :curriculum_id, true
    add_foreign_key :cv_tailorings, :curriculums, on_delete: :nullify
  end

  def down
    execute "DELETE FROM cv_tailorings WHERE curriculum_id IS NULL"
    remove_foreign_key :cv_tailorings, :curriculums
    change_column_null :cv_tailorings, :curriculum_id, false
    add_foreign_key :cv_tailorings, :curriculums, on_delete: :cascade
  end
end
