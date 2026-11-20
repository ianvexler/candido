class CreateCvs < ActiveRecord::Migration[8.0]
  def change
    create_table :curriculums do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title, null: false
      t.text :description
      t.string :layout, null: false, default: "single_column"
      t.jsonb :styles, null: false, default: {}

      t.timestamps
    end

    add_index :curriculums, [ :user_id, :title ]
  end
end
