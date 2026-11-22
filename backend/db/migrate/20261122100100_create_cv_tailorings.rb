# One review of a resume against a job: the model's report and its status.
class CreateCvTailorings < ActiveRecord::Migration[8.0]
  def change
    create_table :cv_tailorings do |t|
      t.references :user, null: false, type: :integer, foreign_key: true
      t.references :curriculum, null: false, foreign_key: { on_delete: :cascade }
      t.references :job_board_entry, type: :integer, foreign_key: { on_delete: :nullify }
      t.string :job_title, null: false
      t.string :company, null: false
      t.string :status, null: false, default: "pending"
      t.jsonb :report
      t.string :error_message
      t.boolean :used_posting, null: false, default: false
      t.timestamps
    end
    add_index :cv_tailorings, %i[curriculum_id created_at]
    add_index :cv_tailorings, %i[user_id created_at]
  end
end
