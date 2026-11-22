# A review of one resume against one job: the model's report and suggested
# changes, which the user accepts, edits or rejects.
# == Schema Information
#
# Table name: cv_tailorings
#
#  id                 :bigint           not null, primary key
#  company            :string           not null
#  error_message      :string
#  job_title          :string           not null
#  report             :jsonb
#  status             :string           default("pending"), not null
#  used_posting       :boolean          default(FALSE), not null
#  created_at         :datetime         not null
#  updated_at         :datetime         not null
#  curriculum_id      :bigint
#  job_board_entry_id :integer
#  user_id            :integer          not null
#
# Indexes
#
#  index_cv_tailorings_on_curriculum_id                 (curriculum_id)
#  index_cv_tailorings_on_curriculum_id_and_created_at  (curriculum_id,created_at)
#  index_cv_tailorings_on_job_board_entry_id            (job_board_entry_id)
#  index_cv_tailorings_on_user_id                       (user_id)
#  index_cv_tailorings_on_user_id_and_created_at        (user_id,created_at)
#
# Foreign Keys
#
#  fk_rails_...  (curriculum_id => curriculums.id) ON DELETE => nullify
#  fk_rails_...  (job_board_entry_id => job_board_entries.id) ON DELETE => nullify
#  fk_rails_...  (user_id => users.id)
#
class CvTailoring < ApplicationRecord
  STATUSES = %w[pending processing succeeded failed].freeze
  # Each run is a paid model call, so cap how many a user can start.
  DAILY_LIMIT = 10
  # Jobs run in-process, so a restart can drop one mid-run. Runs that haven't
  # moved for this long are treated as failed so nothing waits forever.
  STALE_AFTER = 10.minutes
  STALE_MESSAGE = "Something went wrong reviewing this CV. Try again later.".freeze

  belongs_to :user
  # Nil once the reviewed CV is deleted; the run still counts toward the limit.
  belongs_to :curriculum, optional: true
  belongs_to :job_board_entry, optional: true
  has_many :suggestions, -> { order(:position) }, class_name: "CvTailoringSuggestion", dependent: :destroy

  validates :status, inclusion: { in: STATUSES }
  validates :job_title, :company, presence: true

  def self.find_owned!(user, id)
    tailoring = find_by(id: id)
    raise ApiError.new("CV tailoring not found", status: :not_found) if tailoring.nil?
    if tailoring.user_id != user.id
      raise ApiError.new("You are not authorized to access this CV tailoring", status: :forbidden)
    end

    tailoring
  end

  def self.stale
    where(status: %w[pending processing], updated_at: ...STALE_AFTER.ago)
  end

  def self.expire_stale!
    stale.update_all(expired_attributes)
  end

  def self.expired_attributes
    { status: "failed", error_message: STALE_MESSAGE, updated_at: Time.current }
  end

  def self.limit_reached?(user)
    user.cv_tailorings.where(created_at: 24.hours.ago..).count >= DAILY_LIMIT
  end

  # Expires just this run if it's stale, then reloads it.
  def expire_if_stale!
    reload if self.class.stale.where(id: id).update_all(self.class.expired_attributes).positive?
    self
  end

  def active?
    %w[pending processing].include?(status)
  end
end
