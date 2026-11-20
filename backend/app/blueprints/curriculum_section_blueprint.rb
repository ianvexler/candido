class CurriculumSectionBlueprint < ApplicationBlueprint
  identifier :id
  fields :curriculum_id, :section_template_id, :title, :section_type, :description, :content, :styles,
    :position, :hidden, :synced_at, :created_at, :updated_at

  field :library_updated do |section, _options|
    section.library_updated?
  end
end
