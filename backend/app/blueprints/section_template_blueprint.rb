class SectionTemplateBlueprint < ApplicationBlueprint
  identifier :id
  fields :user_id, :title, :section_type, :description, :content, :styles,
    :role, :organization, :location, :start_date, :end_date, :current, :created_at, :updated_at
end
