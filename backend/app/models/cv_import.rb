# An uploaded CV being read into a draft of profile details and library
# sections. The user reviews the draft and applies the parts they want.
# == Schema Information
#
# Table name: cv_imports
#
#  id            :bigint           not null, primary key
#  applied_at    :datetime
#  error_message :string
#  filename      :string           not null
#  media_type    :string           not null
#  result        :jsonb
#  source_data   :text
#  status        :string           default("pending"), not null
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#  user_id       :bigint           not null
#
# Indexes
#
#  index_cv_imports_on_user_id                 (user_id)
#  index_cv_imports_on_user_id_and_created_at  (user_id,created_at)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class CvImport < ApplicationRecord
  STATUSES = %w[pending processing succeeded failed].freeze
  # Each import is a paid model call, so cap how many a user can start.
  DAILY_LIMIT = 10

  belongs_to :user

  validates :status, inclusion: { in: STATUSES }
  validates :filename, :media_type, presence: true

  def self.find_owned!(user, id)
    cv_import = find_by(id: id)
    raise ApiError.new("CV import not found", status: :not_found) if cv_import.nil?
    if cv_import.user_id != user.id
      raise ApiError.new("You are not authorized to access this CV import", status: :forbidden)
    end

    cv_import
  end

  def self.limit_reached?(user)
    user.cv_imports.where(created_at: 24.hours.ago..).count >= DAILY_LIMIT
  end
end
