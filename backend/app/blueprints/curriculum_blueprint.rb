class CurriculumBlueprint < ApplicationBlueprint
  identifier :id
  fields :user_id, :title, :description, :layout, :styles, :created_at, :updated_at

  field :section_count do |curriculum, _options|
    curriculum.curriculum_sections.size
  end

  view :full do
    association :curriculum_sections, blueprint: CurriculumSectionBlueprint, name: :sections
  end
end
