# A saved resume look. Applying it copies the settings into a resume, so
# editing it later doesn't change resumes that already use it.
# == Schema Information
#
# Table name: resume_designs
#
#  id         :bigint           not null, primary key
#  is_default :boolean          default(FALSE), not null
#  name       :string           not null
#  settings   :jsonb            not null
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  user_id    :bigint           not null
#
# Indexes
#
#  index_resume_designs_on_user_id            (user_id)
#  index_resume_designs_one_default_per_user  (user_id) UNIQUE WHERE is_default
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class ResumeDesign < ApplicationRecord
  MAX_PER_USER = 20

  belongs_to :user

  validates :name, presence: true, length: { maximum: 60 }
  validate :within_limit, on: :create

  before_validation { self.name = name.to_s.squish }
  before_validation { self.settings = ResumeDesignSettings.normalize!(settings) }
  # Validation runs inside the save transaction, so the lock is held until
  # commit: concurrent saves for one user take turns on the limit and default.
  before_validation :lock_user, if: -> { new_record? || will_save_change_to_is_default? }
  before_save :clear_other_defaults, if: -> { is_default? && will_save_change_to_is_default? }

  def self.find_owned!(user, id)
    design = find_by(id: id)
    raise ApiError.new("Design not found", status: :not_found) if design.nil?
    raise ApiError.new("You are not authorized to access this design", status: :forbidden) if design.user_id != user.id

    design
  end

  private

  def within_limit
    return if user.nil? || user.resume_designs.count < MAX_PER_USER

    errors.add(:base, "You can save up to #{MAX_PER_USER} designs. Delete one to save another.")
  end

  def lock_user
    user&.lock!
  end

  def clear_other_defaults
    user.resume_designs.where(is_default: true).where.not(id: id).update_all(is_default: false)
  end
end
