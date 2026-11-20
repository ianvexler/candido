class CreateCurriculumSectionItems < ActiveRecord::Migration[8.0]
  def change
    create_table :curriculum_section_items do |t|
      t.references :curriculum_section, null: false, foreign_key: true
      t.string :kind, null: false, default: "bullet"
      t.text :body, null: false
      t.integer :position, null: false, default: 0
      t.boolean :hidden, null: false, default: false

      t.timestamps
    end

    add_index :curriculum_section_items, [ :curriculum_section_id, :position ]
  end
end
