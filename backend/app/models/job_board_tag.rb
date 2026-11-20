# == Schema Information
#
# Table name: job_board_tags
#
#  id         :integer          not null, primary key
#  name       :text             not null
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  user_id    :integer          not null
#
# Indexes
#
#  JobBoardTag_name_idx         (name)
#  JobBoardTag_userId_name_key  (user_id,name) UNIQUE
#
# Foreign Keys
#
#  JobBoardTag_userId_fkey  (user_id => users.id) ON DELETE => restrict ON UPDATE => cascade
#
class JobBoardTag < ApplicationRecord
  belongs_to :user
  has_and_belongs_to_many :job_board_entries

  validates :name, presence: true, uniqueness: { scope: :user_id }

  def self.find_or_create_named!(user, names)
    names.map { |name| name.to_s.strip }.compact_blank.map do |name|
      user.job_board_tags.find_or_create_by!(name: name)
    end
  end
end
