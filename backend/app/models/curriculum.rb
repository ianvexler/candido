# == Schema Information
#
# Table name: curriculums
#
#  id          :bigint           not null, primary key
#  description :text
#  layout      :string           default("single_column"), not null
#  styles      :jsonb            not null
#  title       :string           not null
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#  user_id     :bigint           not null
#
# Indexes
#
#  index_curriculums_on_user_id            (user_id)
#  index_curriculums_on_user_id_and_title  (user_id,title)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class Curriculum < ApplicationRecord
  LAYOUTS = %w[single_column two_column].freeze

  belongs_to :user
  has_many :curriculum_sections, -> { order(:position) }, dependent: :destroy, inverse_of: :curriculum

  validates :title, presence: true
  validates :layout, inclusion: { in: LAYOUTS }

  def self.find_owned!(user, id)
    curriculum = find_by(id: id)
    raise ApiError.new("Curriculum not found", status: :not_found) if curriculum.nil?
    if curriculum.user_id != user.id
      raise ApiError.new("You are not authorized to access this curriculum", status: :forbidden)
    end

    curriculum
  end

  def next_section_position
    (curriculum_sections.maximum(:position) || -1) + 1
  end

  def import_section_templates!(templates)
    templates = Array(templates)
    raise ArgumentError, "templates required" if templates.empty?

    transaction do
      templates.map do |template|
        raise ArgumentError, "template must belong to curriculum owner" if template.user_id != user_id

        curriculum_sections.create!(
          section_template: template,
          title: template.title,
          section_type: template.section_type,
          description: template.description,
          content: template.content,
          styles: template.styles.deep_dup,
          position: next_section_position,
          hidden: false,
          synced_at: Time.current
        )
      end
    end
  end

  # Sets section order to match `section_ids`, which must list every section once.
  def reorder_sections!(section_ids)
    ids = Array(section_ids).map(&:to_i)
    current_ids = curriculum_sections.pluck(:id)
    unless ids.size == current_ids.size && ids.sort == current_ids.sort
      raise ArgumentError, "section_ids must list every section in this curriculum exactly once"
    end

    transaction do
      ids.each_with_index do |id, position|
        curriculum_sections.where(id: id).update_all(position: position, updated_at: Time.current)
      end
      touch
    end
    curriculum_sections.reset
  end

  def visible_sections
    curriculum_sections.reject(&:hidden?)
  end
end
