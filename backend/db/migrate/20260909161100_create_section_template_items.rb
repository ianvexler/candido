class CreateSectionTemplateItems < ActiveRecord::Migration[8.0]
  def change
    create_table :section_template_items do |t|
      t.references :section_template, null: false, foreign_key: true
      t.string :kind, null: false, default: "bullet"
      t.text :body, null: false
      t.integer :position, null: false, default: 0
      t.boolean :hidden, null: false, default: false

      t.timestamps
    end

    add_index :section_template_items, [ :section_template_id, :position ]
  end
end
