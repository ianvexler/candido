# == Schema Information
#
# Table name: section_templates
#
#  id           :bigint           not null, primary key
#  description  :text
#  section_type :string           default("custom"), not null
#  styles       :jsonb            not null
#  title        :string           not null
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
  belongs_to :user
  has_many :section_template_items, -> { order(:position) }, dependent: :destroy, inverse_of: :section_template
  has_many :curriculum_sections, dependent: :nullify

  validates :title, :section_type, presence: true

  def self.find_owned!(user, id, unauthorized_message:)
    template = find_by(id: id)
    raise ApiError.new("Section template not found", status: :not_found) if template.nil?
    if template.user_id != user.id
      raise ApiError.new(unauthorized_message, status: :forbidden)
    end

    template
  end

  def self.create_for_user!(user, attributes, items: [])
    transaction do
      template = user.section_templates.create!(attributes)
      template.replace_items!(items)
      template
    end
  end

  def self.blank_item_body?(body)
    body.to_s.gsub(/<[^>]+>/, " ").gsub("&nbsp;", " ").squish.blank?
  end

  def replace_items!(items)
    transaction do
      section_template_items.destroy_all
      Array(items).each do |item|
        body = item[:body].to_s
        next if self.class.blank_item_body?(body)

        add_item!(
          kind: item[:kind].presence || "bullet",
          body: body,
          hidden: ActiveModel::Type::Boolean.new.cast(item[:hidden]) || false
        )
      end
    end
  end

  def next_item_position
    (section_template_items.maximum(:position) || -1) + 1
  end

  def add_item!(attributes = {})
    section_template_items.create!(attributes.merge(position: next_item_position))
  end
end
