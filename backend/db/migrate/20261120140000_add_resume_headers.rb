# The name/contact block at the top of a resume. Users keep one profile;
# each resume stores only the fields it overrides.
class AddResumeHeaders < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :resume_profile, :jsonb, null: false, default: {}
    add_column :curriculums, :header, :jsonb, null: false, default: {}
  end
end
