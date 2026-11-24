# What a CV's copies were made from in the library, and when library content was added.
class AddBaseToSections < ActiveRecord::Migration[8.0]
  def change
    add_column :curriculum_sections, :base_items, :jsonb, null: false, default: {}
    add_column :curriculum_sections, :base_fields, :jsonb, null: false, default: {}
    add_column :section_templates, :item_added_at, :jsonb, null: false, default: {}
  end
end
