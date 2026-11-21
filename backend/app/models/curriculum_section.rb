# == Schema Information
#
# Table name: curriculum_sections
#
#  id                  :bigint           not null, primary key
#  content             :text             default(""), not null
#  current             :boolean          default(FALSE), not null
#  description         :text
#  end_date            :date
#  hidden              :boolean          default(FALSE), not null
#  location            :string
#  organization        :string
#  placement           :string
#  position            :integer          default(0), not null
#  role                :string
#  section_type        :string           default("custom"), not null
#  start_date          :date
#  styles              :jsonb            not null
#  synced_at           :datetime
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

  belongs_to :curriculum, inverse_of: :curriculum_sections, touch: true
  belongs_to :section_template, optional: true

  validates :title, :section_type, presence: true
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  # Column in a two-column template; nil lets the client place it by type.
  PLACEMENTS = %w[main sidebar].freeze
  validates :placement, inclusion: { in: PLACEMENTS, message: "must be main or sidebar" }, allow_nil: true

  before_validation { self.placement = placement.presence }

  SYNCED_FIELDS = (%i[title section_type description content styles] + SectionContent::DETAIL_FIELDS).freeze

  # True when the library section was edited after this copy was last synced.
  def library_updated?
    return false if section_template.nil? || synced_at.nil?

    section_template.updated_at > synced_at
  end

  # Overwrites this copy with the library section's current fields.
  def sync_from_template!
    raise ArgumentError, "section has no library section" if section_template.nil?

    update!(
      **SYNCED_FIELDS.index_with { |field| section_template.public_send(field) }.merge(styles: section_template.styles.deep_dup),
      synced_at: Time.current
    )
  end
end
