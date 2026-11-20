class CreateSectionTemplates < ActiveRecord::Migration[8.0]
  def change
    create_table :section_templates do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title, null: false
      t.string :section_type, null: false, default: "custom"
      t.text :description
      t.jsonb :styles, null: false, default: {}

      t.timestamps
    end

    add_index :section_templates, [ :user_id, :section_type ]
    add_index :section_templates, [ :user_id, :title ]
  end
end
