class CreateCurriculumSections < ActiveRecord::Migration[8.0]
  def change
    create_table :curriculum_sections do |t|
      t.references :curriculum, null: false, foreign_key: true
      t.references :section_template, null: true, foreign_key: true
      t.string :title, null: false
      t.string :section_type, null: false, default: "custom"
      t.text :description
      t.integer :position, null: false, default: 0
      t.boolean :hidden, null: false, default: false
      t.jsonb :styles, null: false, default: {}

      t.timestamps
    end

    add_index :curriculum_sections, [ :curriculum_id, :position ]
  end
end
