# == Schema Information
#
# Table name: section_template_items
#
#  id                  :bigint           not null, primary key
#  body                :text             not null
#  hidden              :boolean          default(FALSE), not null
#  kind                :string           default("bullet"), not null
#  position            :integer          default(0), not null
#  created_at          :datetime         not null
#  updated_at          :datetime         not null
#  section_template_id :bigint           not null
#
# Indexes
#
#  idx_on_section_template_id_position_a62369f2ca       (section_template_id,position)
#  index_section_template_items_on_section_template_id  (section_template_id)
#
# Foreign Keys
#
#  fk_rails_...  (section_template_id => section_templates.id)
#
class SectionTemplateItem < ApplicationRecord
  KINDS = %w[bullet ordered paragraph heading].freeze

  belongs_to :section_template, inverse_of: :section_template_items

  validates :body, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  def self.find_owned!(user, id)
    item = includes(:section_template).find_by(id: id)
    raise ApiError.new("Section template item not found", status: :not_found) if item.nil?
    if item.section_template.user_id != user.id
      raise ApiError.new("You are not authorized to access this section template item", status: :forbidden)
    end

    item
  end
end
