# A resume can be a copy made for one job. The links are kept loosely: deleting
# the job or the source resume leaves the copy as an ordinary resume.
class AddTailoringToCurriculums < ActiveRecord::Migration[8.0]
  def change
    add_reference :curriculums, :job_board_entry, type: :integer, foreign_key: { on_delete: :nullify }
    add_reference :curriculums, :source_curriculum, foreign_key: { to_table: :curriculums, on_delete: :nullify }
    add_column :curriculums, :tailored_for, :string
  end
end
