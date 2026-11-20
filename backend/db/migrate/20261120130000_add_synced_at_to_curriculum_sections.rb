# When a CV section was last copied from its library section. A library edit
# after this time means the CV can offer to pull the changes.
class AddSyncedAtToCurriculumSections < ActiveRecord::Migration[8.0]
  def up
    add_column :curriculum_sections, :synced_at, :datetime
    execute "UPDATE curriculum_sections SET synced_at = created_at"
  end

  def down
    remove_column :curriculum_sections, :synced_at
  end
end
