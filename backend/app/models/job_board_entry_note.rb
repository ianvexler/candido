# == Schema Information
#
# Table name: job_board_entry_notes
#
#  id                 :integer          not null, primary key
#  content            :text             not null
#  created_at         :datetime         not null
#  updated_at         :datetime         not null
#  job_board_entry_id :integer          not null
#  user_id            :integer          not null
#
# Indexes
#
#  JobBoardEntryNotes_userId_jobBoardEntryId_idx  (user_id,job_board_entry_id)
#
# Foreign Keys
#
#  JobBoardEntryNotes_jobBoardEntryId_fkey  (job_board_entry_id => job_board_entries.id) ON DELETE => restrict ON UPDATE => cascade
#  JobBoardEntryNotes_userId_fkey           (user_id => users.id) ON DELETE => restrict ON UPDATE => cascade
#
class JobBoardEntryNote < ApplicationRecord
  belongs_to :user
  belongs_to :job_board_entry

  validates :content, presence: true

  def self.find_owned!(user, id)
    note = find_by(id: id)
    raise ApiError.new("Note not found", status: :not_found) if note.nil?
    if note.user_id != user.id
      raise ApiError.new("You are not authorized to access this note", status: :forbidden)
    end

    note
  end
end
