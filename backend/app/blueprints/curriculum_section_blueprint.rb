class CurriculumSectionBlueprint < ApplicationBlueprint
  identifier :id
  fields :curriculum_id, :section_template_id, :section_type, :entries, :base_items, :base_fields, :styles,
    :position, :hidden, :placement, :synced_at, :created_at, :updated_at

  field :library_updated do |section, _options|
    section.library_updated?
  end
end
