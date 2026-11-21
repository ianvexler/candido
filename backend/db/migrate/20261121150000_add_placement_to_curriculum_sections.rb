# Where a section sits in a two-column template. Belongs to the resume's copy,
# so pulling the library version keeps it; nil means placed by its type.
class AddPlacementToCurriculumSections < ActiveRecord::Migration[8.0]
  def change
    add_column :curriculum_sections, :placement, :string
  end
end
