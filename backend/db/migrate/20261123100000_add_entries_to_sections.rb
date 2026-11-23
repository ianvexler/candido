# Sections hold a list of entries instead of one title, body and date range.
# Each existing section becomes one entry. The old columns stay until a later
# migration so containers running the previous code keep working meanwhile;
# `title` gets a default because new code no longer writes it.
class AddEntriesToSections < ActiveRecord::Migration[8.0]
  def up
    add_column :section_templates, :entries, :jsonb, null: false, default: []
    add_column :curriculum_sections, :entries, :jsonb, null: false, default: []
    change_column_default :section_templates, :title, from: nil, to: ""
    change_column_default :curriculum_sections, :title, from: nil, to: ""
    add_column :cv_tailoring_suggestions, :entry_id, :string

    # A copy's entry shares its library entry's id.
    backfill("section_templates", "'t' || id")
    backfill("curriculum_sections", "CASE WHEN section_template_id IS NULL THEN 's' || id ELSE 't' || section_template_id END")

    execute <<~SQL
      UPDATE cv_tailoring_suggestions
      SET entry_id = curriculum_sections.entries -> 0 ->> 'id'
      FROM curriculum_sections
      WHERE curriculum_sections.id = cv_tailoring_suggestions.curriculum_section_id
    SQL
  end

  def down
    remove_column :cv_tailoring_suggestions, :entry_id
    change_column_default :curriculum_sections, :title, from: "", to: nil
    change_column_default :section_templates, :title, from: "", to: nil
    remove_column :curriculum_sections, :entries
    remove_column :section_templates, :entries
  end

  private

  # A title that only repeats the heading, or the old placeholder, is dropped.
  def backfill(table, id_sql)
    execute <<~SQL
      UPDATE #{table}
      SET entries = jsonb_build_array(jsonb_build_object(
        'id', #{id_sql},
        'title', CASE WHEN lower(trim(title)) IN (lower(trim(section_type)), 'untitled') THEN '' ELSE trim(title) END,
        'role', role,
        'organization', organization,
        'location', location,
        'start_date', to_char(start_date, 'YYYY-MM-DD'),
        'end_date', to_char(end_date, 'YYYY-MM-DD'),
        'current', current,
        'description', description,
        'content', content,
        'hidden', false
      ))
    SQL
  end
end
