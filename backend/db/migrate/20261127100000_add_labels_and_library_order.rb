# Purposes the library's entries and bullets are labelled with, and the order the library is shown in.
class AddLabelsAndLibraryOrder < ActiveRecord::Migration[8.0]
  def up
    create_table :cv_labels do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.timestamps
    end
    add_index :cv_labels, "user_id, lower(name)", unique: true, name: "index_cv_labels_on_user_id_and_lower_name"

    add_column :section_templates, :item_labels, :jsonb, null: false, default: {}
    add_column :section_templates, :position, :integer
    execute <<~SQL.squish
      UPDATE section_templates SET position = ranked.position
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) - 1 AS position
        FROM section_templates
      ) ranked
      WHERE section_templates.id = ranked.id
    SQL
    change_column_null :section_templates, :position, false

    add_reference :curriculums, :cv_label, foreign_key: { to_table: :cv_labels, on_delete: :nullify }
  end

  def down
    remove_reference :curriculums, :cv_label, foreign_key: { to_table: :cv_labels }
    remove_column :section_templates, :position
    remove_column :section_templates, :item_labels
    drop_table :cv_labels
  end
end
