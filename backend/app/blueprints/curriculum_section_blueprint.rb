class CurriculumSectionBlueprint < ApplicationBlueprint
  identifier :id
  fields :curriculum_id, :section_template_id, :title, :section_type, :description, :content, :styles,
    :role, :organization, :location, :start_date, :end_date, :current,
    :position, :hidden, :synced_at, :created_at, :updated_at

  field :library_updated do |section, _options|
    section.library_updated?
  end
end
