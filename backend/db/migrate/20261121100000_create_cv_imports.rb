# One upload of a user's existing CV, read into a draft they review before
# anything is added to their library.
class CreateCvImports < ActiveRecord::Migration[8.0]
  def change
    create_table :cv_imports do |t|
      t.references :user, null: false, foreign_key: true
      t.string :status, null: false, default: "pending"
      t.string :filename, null: false
      t.string :media_type, null: false
      # The uploaded file, Base64-encoded, kept only until it has been read.
      t.text :source_data
      t.jsonb :result
      t.string :error_message
      t.datetime :applied_at

      t.timestamps
    end

    add_index :cv_imports, [ :user_id, :created_at ]
  end
end
