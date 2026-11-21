# One suggested change to a resume section: either a rewrite of a quoted
# passage or a note about it.
# == Schema Information
#
# Table name: cv_tailoring_suggestions
#
#  id                    :bigint           not null, primary key
#  field                 :string
#  kind                  :string           not null
#  position              :integer
#  quote                 :text             not null
#  reason                :string           not null
#  replacement           :text
#  status                :string           default("pending"), not null
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  curriculum_section_id :bigint           not null
#  cv_tailoring_id       :bigint           not null
#
# Indexes
#
#  index_cv_tailoring_suggestions_on_curriculum_section_id  (curriculum_section_id)
#  index_cv_tailoring_suggestions_on_cv_tailoring_id        (cv_tailoring_id)
#
# Foreign Keys
#
#  fk_rails_...  (curriculum_section_id => curriculum_sections.id) ON DELETE => cascade
#  fk_rails_...  (cv_tailoring_id => cv_tailorings.id) ON DELETE => cascade
#
class CvTailoringSuggestion < ApplicationRecord
  KINDS = %w[rewrite note].freeze
  FIELDS = %w[content description].freeze
  # superseded: still pending when a re-run replaced its review; not a decline.
  STATUSES = %w[pending accepted edited rejected superseded].freeze
  RESOLUTIONS = %w[accepted edited rejected].freeze
  MAX_REPLACEMENT_LENGTH = 2000

  belongs_to :cv_tailoring
  belongs_to :curriculum_section

  validates :kind, inclusion: { in: KINDS }
  validates :field, inclusion: { in: FIELDS }, allow_nil: true
  validates :status, inclusion: { in: STATUSES }
  validates :quote, :reason, presence: true
  validates :replacement, length: { maximum: MAX_REPLACEMENT_LENGTH }, allow_nil: true

  def self.find_owned!(user, id)
    suggestion = includes(:cv_tailoring).find_by(id: id)
    raise ApiError.new("Suggestion not found", status: :not_found) if suggestion.nil?
    if suggestion.cv_tailoring.user_id != user.id
      raise ApiError.new("You are not authorized to access this suggestion", status: :forbidden)
    end

    suggestion
  end

  # Records the user's decision. An edit carries the text they wrote instead.
  # Only an open suggestion of the CV's latest review can be decided, so a
  # page showing an older review can't turn a superseded one into a decline.
  def resolve!(status:, replacement: nil)
    raise ApiError.new("This suggestion was already handled.", status: :conflict) unless self.status == "pending"
    if cv_tailoring.curriculum&.latest_tailoring != cv_tailoring
      raise ApiError.new("This review was replaced by a newer one.", status: :conflict)
    end

    unless RESOLUTIONS.include?(status)
      errors.add(:status, "must be accepted, edited or rejected")
      raise ActiveRecord::RecordInvalid, self
    end

    if status == "edited"
      if replacement.to_s.strip.empty?
        errors.add(:replacement, "can't be blank")
        raise ActiveRecord::RecordInvalid, self
      end
      update!(status: status, replacement: replacement)
    else
      update!(status: status)
    end
    self
  end
end
