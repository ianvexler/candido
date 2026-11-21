# Orders style saves from one open page: a save numbered lower than the last
# one applied from the same page arrived late and is ignored.
class AddStylesOrderingToCurriculums < ActiveRecord::Migration[8.0]
  def change
    add_column :curriculums, :styles_writer, :string
    add_column :curriculums, :styles_seq, :integer, null: false, default: 0
  end
end
