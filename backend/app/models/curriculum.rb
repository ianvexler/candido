# == Schema Information
#
# Table name: curriculums
#
#  id          :bigint           not null, primary key
#  description :text
#  header      :jsonb            not null
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
  # Paper the resume is printed on; stored as styles["paper"], nil means A4.
  PAPER_SIZES = %w[a4 letter].freeze

  belongs_to :user
  has_many :curriculum_sections, -> { order(:position) }, dependent: :destroy, inverse_of: :curriculum

  validates :title, presence: true
  validates :layout, inclusion: { in: LAYOUTS }
  validate :paper_size_is_known

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
          **template.slice(*SectionContent::DETAIL_FIELDS).symbolize_keys,
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

  # The header this resume shows: the owner's profile with this resume's overrides on top.
  def resolved_header
    ResumeHeader.resolve(user.resume_header_profile, header)
  end

  def update_header!(raw)
    update!(header: ResumeHeader.normalize_overrides(raw))
  end

  # Merges into the stored styles in one statement, so two requests changing
  # different keys (paper and design, say) can't overwrite each other.
  def merge_styles!(changes)
    changes = changes.to_h.stringify_keys
    if changes.key?("paper") && !PAPER_SIZES.include?(changes["paper"])
      raise ApiError.new("Paper size must be A4 or Letter", status: :unprocessable_content)
    end

    self.class.where(id: id).update_all([ "styles = styles || ?::jsonb, updated_at = ?", changes.to_json, Time.current ])
    self.styles = self.class.where(id: id).pick(:styles)
    clear_attribute_changes([ :styles ])
    self
  end

  def visible_sections
    curriculum_sections.reject(&:hidden?)
  end

  private

  def paper_size_is_known
    paper = styles&.dig("paper")
    return if paper.nil? || PAPER_SIZES.include?(paper)

    errors.add(:base, "Paper size must be A4 or Letter")
  end
end
