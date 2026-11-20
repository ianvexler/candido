# == Schema Information
#
# Table name: sessions
#
#  id         :integer          not null, primary key
#  expires_at :datetime         not null
#  token      :text             not null
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  user_id    :integer          not null
#
# Indexes
#
#  Session_token_idx   (token)
#  Session_token_key   (token) UNIQUE
#  Session_userId_idx  (user_id)
#
# Foreign Keys
#
#  Session_userId_fkey  (user_id => users.id) ON DELETE => restrict ON UPDATE => cascade
#
class Session < ApplicationRecord
  belongs_to :user

  validates :token, presence: true, uniqueness: true
  validates :expires_at, presence: true

  scope :active, -> { where(arel_table[:expires_at].gt(Time.current)) }

  def self.issue_for!(user)
    create!(
      user: user,
      token: SecureRandom.hex(32),
      expires_at: 30.days.from_now
    ).tap { user.update!(last_login_at: Time.current) }
  end
end
