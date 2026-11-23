# == Schema Information
#
# Table name: section_templates
#
#  id           :bigint           not null, primary key
#  entries      :jsonb            not null
#  section_type :string           default("custom"), not null
#  styles       :jsonb            not null
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  user_id      :bigint           not null
#
# Indexes
#
#  index_section_templates_on_user_id                   (user_id)
#  index_section_templates_on_user_id_and_section_type  (user_id,section_type)
#  index_section_templates_on_user_id_and_title         (user_id,title)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class SectionTemplate < ApplicationRecord
  include SectionContent

  belongs_to :user
  has_many :curriculum_sections, dependent: :nullify

  def self.find_owned!(user, id, unauthorized_message:)
    template = find_by(id: id)
    raise ApiError.new("Section template not found", status: :not_found) if template.nil?
    if template.user_id != user.id
      raise ApiError.new(unauthorized_message, status: :forbidden)
    end

    template
  end
end
