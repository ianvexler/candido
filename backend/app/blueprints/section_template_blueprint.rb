class SectionTemplateBlueprint < ApplicationBlueprint
  identifier :id
  fields :user_id, :title, :section_type, :description, :styles, :created_at, :updated_at

  association :section_template_items, blueprint: SectionTemplateItemBlueprint, name: :items
end
