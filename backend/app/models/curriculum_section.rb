# == Schema Information
#
# Table name: curriculum_sections
#
#  id                  :bigint           not null, primary key
#  content             :text             default(""), not null
#  description         :text
#  hidden              :boolean          default(FALSE), not null
#  position            :integer          default(0), not null
#  section_type        :string           default("custom"), not null
#  styles              :jsonb            not null
#  title               :string           not null
#  created_at          :datetime         not null
#  updated_at          :datetime         not null
#  curriculum_id       :bigint           not null
#  section_template_id :bigint
#
# Indexes
#
#  index_curriculum_sections_on_curriculum_id               (curriculum_id)
#  index_curriculum_sections_on_curriculum_id_and_position  (curriculum_id,position)
#  index_curriculum_sections_on_section_template_id         (section_template_id)
#
# Foreign Keys
#
#  fk_rails_...  (curriculum_id => curriculums.id)
#  fk_rails_...  (section_template_id => section_templates.id)
#
class CurriculumSection < ApplicationRecord
  include SectionContent

  belongs_to :curriculum, inverse_of: :curriculum_sections
  belongs_to :section_template, optional: true

  validates :title, :section_type, presence: true
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
end
