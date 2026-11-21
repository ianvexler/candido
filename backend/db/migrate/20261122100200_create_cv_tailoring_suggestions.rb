# One suggested change from a tailoring run, tied to a section of the resume.
class CreateCvTailoringSuggestions < ActiveRecord::Migration[8.0]
  def change
    create_table :cv_tailoring_suggestions do |t|
      t.references :cv_tailoring, null: false, foreign_key: { on_delete: :cascade }
      t.references :curriculum_section, null: false, foreign_key: { on_delete: :cascade }
      t.string :kind, null: false
      t.string :field
      t.text :quote, null: false
      t.text :replacement
      t.string :reason, null: false
      t.string :status, null: false, default: "pending"
      t.integer :position
      t.timestamps
    end
  end
end
