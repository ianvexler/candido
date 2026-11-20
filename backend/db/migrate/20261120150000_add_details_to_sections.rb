# Optional structured details for experience/education-style sections.
# Dates are month precision, stored as the first of the month.
class AddDetailsToSections < ActiveRecord::Migration[8.0]
  def change
    %i[section_templates curriculum_sections].each do |table|
      change_table table, bulk: true do |t|
        t.string :role
        t.string :organization
        t.string :location
        t.date :start_date
        t.date :end_date
        t.boolean :current, null: false, default: false
      end
    end
  end
end
