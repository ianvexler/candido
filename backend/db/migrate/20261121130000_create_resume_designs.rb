# Designs a user saves to reuse across resumes. Applying one copies its
# settings into the resume; one can be the default for new resumes.
class CreateResumeDesigns < ActiveRecord::Migration[8.0]
  def change
    create_table :resume_designs do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.jsonb :settings, null: false, default: {}
      t.boolean :is_default, null: false, default: false

      t.timestamps
    end

    add_index :resume_designs, :user_id, unique: true, where: "is_default", name: "index_resume_designs_one_default_per_user"
  end
end
