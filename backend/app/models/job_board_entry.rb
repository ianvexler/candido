# == Schema Information
#
# Table name: job_board_entries
#
#  id                    :integer          not null, primary key
#  closing_date          :datetime
#  company               :text             not null
#  cover_letter_filename :text
#  cover_letter_key      :text
#  cover_letter_text     :text
#  cv_filename           :text
#  cv_key                :text
#  cv_text               :text
#  description           :text
#  location              :text
#  number                :integer          not null
#  salary                :text
#  status                :enum             default("PENDING"), not null
#  title                 :text             not null
#  url                   :text
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  cv_curriculum_id      :bigint
#  user_id               :integer          not null
#
# Indexes
#
#  JobBoardEntry_title_idx                      (title)
#  JobBoardEntry_userId_status_number_key       (user_id,status,number) UNIQUE
#  index_job_board_entries_on_cv_curriculum_id  (cv_curriculum_id)
#
# Foreign Keys
#
#  JobBoardEntry_userId_fkey  (user_id => users.id) ON DELETE => restrict ON UPDATE => cascade
#  fk_rails_...               (cv_curriculum_id => curriculums.id) ON DELETE => nullify
#
class JobBoardEntry < ApplicationRecord
  STATUSES = %w[PENDING APPLIED ASSESSMENT INTERVIEW OFFERED REJECTED ACCEPTED ARCHIVED].freeze

  belongs_to :user
  has_many :job_board_entry_notes, dependent: :destroy
  has_many :tailored_curriculums, class_name: "Curriculum", dependent: :nullify
  # The copy of a resume that serves as this job's CV; empty if it is deleted.
  belongs_to :cv_curriculum, class_name: "Curriculum", optional: true, inverse_of: :cv_for_job
  has_and_belongs_to_many :job_board_tags

  enum :status, STATUSES.index_by(&:itself), default: "PENDING", validate: true

  validates :title, :company, :number, presence: true
  validates :number, uniqueness: { scope: [ :user_id, :status ] }

  RESPONDED_STATUSES = (STATUSES - %w[PENDING APPLIED ARCHIVED]).freeze

  # Archived jobs are left out, since they may have been archived before or after applying.
  SENT_STATUSES = (RESPONDED_STATUSES + %w[APPLIED]).freeze

  STATS_WEEKS = 12
  CLOSING_SOON_WINDOW = 14.days
  CLOSING_SOON_LIMIT = 5

  def self.next_number_for(user, status)
    (where(user: user, status: status).maximum(:number) || 0) + 1
  end

  def self.find_owned!(user, id, unauthorized_message:)
    entry = find_by(id: id)
    raise ApiError.new("Job board entry not found", status: :not_found) if entry.nil?
    if entry.user_id != user.id
      raise ApiError.new(unauthorized_message, status: :forbidden)
    end

    entry
  end

  def self.create_for_user!(user, attributes, tag_names: nil)
    transaction do
      status = attributes[:status].presence || "PENDING"
      entry = user.job_board_entries.create!(attributes.merge(
        status: status,
        number: next_number_for(user, status)
      ))
      entry.assign_tag_names(tag_names)
      entry
    end
  end

  def self.bulk_import_for_user!(user, entries)
    transaction do
      max_by_status = {}
      entries.map do |attributes|
        status = attributes[:status].presence || "PENDING"
        number = max_by_status[status] || next_number_for(user, status)
        max_by_status[status] = number + 1
        user.job_board_entries.create!(
          title: attributes[:title],
          company: attributes[:company],
          location: attributes[:location].presence || "",
          salary: attributes[:salary].presence || "",
          url: attributes[:url].presence || "",
          description: attributes[:description].presence || "",
          status: status,
          number: number
        )
      end
    end
  end

  def self.stats_for(user)
    grouped = where(user: user).group(:status).count
    now = Time.current
    all_count = grouped.values.sum
    responded = grouped.values_at(*RESPONDED_STATUSES).compact.sum
    sent = grouped.values_at(*SENT_STATUSES).compact.sum
    weekly_counts = weekly_counts_for(user, now)
    closing_soon = closing_soon_for(user, now)

    {
      counts: {
        total: all_count,
        pending: grouped["PENDING"] || 0,
        applied: grouped["APPLIED"] || 0,
        assessment: grouped["ASSESSMENT"] || 0,
        interview: grouped["INTERVIEW"] || 0,
        offered: grouped["OFFERED"] || 0,
        rejected: grouped["REJECTED"] || 0,
        accepted: grouped["ACCEPTED"] || 0
      },
      this_week: weekly_counts[-1][:count],
      last_week: weekly_counts[-2][:count],
      response_rate: sent.zero? ? 0 : ((responded * 100.0) / sent).round,
      responded_count: responded,
      sent_count: sent,
      weekly_counts: weekly_counts,
      closing_soon: closing_soon.order(:closing_date, :id).limit(CLOSING_SOON_LIMIT)
        .pluck(:id, :title, :company, :closing_date)
        .map { |id, title, company, closing_date| { id:, title:, company:, closing_date: } },
      closing_soon_count: closing_soon.count,
      top_tags: top_tags_for(user)
    }
  end

  def self.weekly_counts_for(user, now)
    current_week = now.beginning_of_week(:monday)
    starts = (0...STATS_WEEKS).map { |i| current_week - (STATS_WEEKS - 1 - i).weeks }
    counts = where(user: user, created_at: starts.first..now).pluck(:created_at)
      .group_by { |created_at| created_at.beginning_of_week(:monday) }
      .transform_values(&:size)

    starts.map { |start| { week_start: start.to_date, count: counts[start] || 0 } }
  end

  # Closing dates are stored as midnight in the user's own time zone, so one that is
  # "today" for them is at most 24 hours old, wherever they are.
  def self.closing_soon_for(user, now)
    where(user: user, status: "PENDING")
      .where(closing_date: (now - 1.day)..(now + CLOSING_SOON_WINDOW))
  end

  def self.top_tags_for(user)
    JobBoardTag.where(user: user)
      .left_joins(:job_board_entries)
      .group("job_board_tags.id")
      .order(Arel.sql("COUNT(job_board_entries.id) DESC"))
      .limit(5)
      .pluck("job_board_tags.name", Arel.sql("COUNT(job_board_entries.id)"))
      .map { |name, count| { name: name, count: count } }
  end

  def assign_tag_names(names)
    return if names.nil?

    self.job_board_tags = JobBoardTag.find_or_create_named!(user, names)
  end

  def update_for_user!(attributes, tag_names: nil)
    transaction do
      next_status = attributes.key?(:status) ? attributes[:status] : status
      next_number = attributes.key?(:number) ? attributes[:number].to_i : number
      make_room_for!(next_status, next_number) if next_status != status || next_number != number

      assign_attributes(attributes)
      save!
      assign_tag_names(tag_names)
      self
    end
  end

  def destroy_and_renumber!
    transaction do
      column_status = status
      deleted_number = number
      owner_id = user_id
      destroy!

      self.class.where(user_id: owner_id, status: column_status)
        .where(self.class.arel_table[:number].gt(deleted_number))
        .order(:number)
        .each_with_index { |entry, index| entry.update!(number: deleted_number + index) }
    end
  end

  # Uploading, pasting or removing the CV deletes a copy made for this job, since it only existed
  # for this job; the user is asked first. Past reviews stay and still count toward the daily limit.
  def upload_cv!(text: nil, file: nil)
    # Locked so a concurrent change can't leave the copy it linked behind.
    with_lock do
      replaced = cv_curriculum
      apply_upload!(
        text: text,
        file: file,
        text_attr: :cv_text,
        key_attr: :cv_key,
        filename_attr: :cv_filename,
        extra: { cv_curriculum_id: nil }
      )
      discard_own_copy!(replaced)
    end
  end

  # Makes a copy of a resume this job's CV, replacing any uploaded file or text, or
  # deleting the copy it replaces. The stored file goes only after the surrounding
  # transaction commits, so a rollback never loses it.
  def use_cv_copy!(curriculum)
    old_key = nil
    with_lock do
      old_key = cv_key
      replaced = cv_curriculum unless cv_curriculum_id == curriculum.id
      update!(cv_curriculum: curriculum, cv_text: nil, cv_key: nil, cv_filename: nil)
      discard_own_copy!(replaced)
    end
    ActiveRecord.after_all_transactions_commit { PdfUploader.delete_key(old_key) } if old_key
  end

  def upload_cover_letter!(text: nil, file: nil)
    apply_upload!(
      text: text,
      file: file,
      text_attr: :cover_letter_text,
      key_attr: :cover_letter_key,
      filename_attr: :cover_letter_filename
    )
  end

  private

  # Deletes a CV that was copied for this job. Anything else (a CV made for another job,
  # or one of the user's own CVs) is only unlinked.
  def discard_own_copy!(curriculum)
    curriculum.destroy! if curriculum && curriculum.job_board_entry_id == id
  end

  def apply_upload!(text:, file:, text_attr:, key_attr:, filename_attr:, extra: {})
    if text.present?
      PdfUploader.delete_key(self[key_attr])
      update!(text_attr => text, key_attr => nil, filename_attr => nil, **extra)
    elsif file.present?
      uploaded = PdfUploader.store!(file)
      PdfUploader.delete_key(self[key_attr])
      update!(text_attr => nil, key_attr => uploaded.id, filename_attr => file.original_filename, **extra)
    else
      PdfUploader.delete_key(self[key_attr])
      update!(text_attr => nil, key_attr => nil, filename_attr => nil, **extra)
    end
  end

  def make_room_for!(next_status, next_number)
    update_column(:number, -1) if next_status == status && next_number != number

    self.class.where(user_id: user_id, status: next_status)
      .where(self.class.arel_table[:number].gteq(next_number))
      .where.not(id: id)
      .order(number: :desc)
      .each { |entry| entry.update_column(:number, entry.number + 1) }
  end
end
