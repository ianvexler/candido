# == Schema Information
#
# Table name: feedback_entries
#
#  id         :integer          not null, primary key
#  content    :text             not null
#  status     :enum             default("PENDING"), not null
#  title      :text             not null
#  type       :enum             default("OTHER"), not null
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  user_id    :integer          not null
#
# Foreign Keys
#
#  FeedbackEntry_userId_fkey  (user_id => users.id) ON DELETE => restrict ON UPDATE => cascade
#
class FeedbackEntry < ApplicationRecord
  TYPES = %w[BUG SUGGESTION OTHER].freeze
  STATUSES = %w[PENDING REVIEWED IMPLEMENTED CLOSED].freeze

  self.inheritance_column = nil

  belongs_to :user

  enum :type, TYPES.index_by(&:itself), default: "OTHER", validate: true
  enum :status, STATUSES.index_by(&:itself), default: "PENDING", validate: true

  validates :title, :content, presence: true
end
