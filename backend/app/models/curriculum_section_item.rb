# == Schema Information
#
# Table name: curriculum_section_items
#
#  id                    :bigint           not null, primary key
#  body                  :text             not null
#  hidden                :boolean          default(FALSE), not null
#  kind                  :string           default("bullet"), not null
#  position              :integer          default(0), not null
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  curriculum_section_id :bigint           not null
#
# Indexes
#
#  idx_on_curriculum_section_id_position_f30cbb70b8         (curriculum_section_id,position)
#  index_curriculum_section_items_on_curriculum_section_id  (curriculum_section_id)
#
# Foreign Keys
#
#  fk_rails_...  (curriculum_section_id => curriculum_sections.id)
#
class CurriculumSectionItem < ApplicationRecord
  KINDS = SectionTemplateItem::KINDS

  belongs_to :curriculum_section, inverse_of: :curriculum_section_items

  validates :body, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
end
