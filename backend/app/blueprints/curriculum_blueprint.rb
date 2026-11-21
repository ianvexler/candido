class CurriculumBlueprint < ApplicationBlueprint
  identifier :id
  fields :user_id, :title, :description, :layout, :styles, :created_at, :updated_at,
    :job_board_entry_id, :source_curriculum_id, :tailored_for

  field :section_count do |curriculum, _options|
    curriculum.curriculum_sections.size
  end

  view :full do
    field :header
    field :resolved_header do |curriculum, _options|
      curriculum.resolved_header
    end
    association :curriculum_sections, blueprint: CurriculumSectionBlueprint, name: :sections
  end
end
