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

  # Jobs run in-process, so a restart or deploy can drop one mid-read. Imports
  # that haven't moved for this long are treated as failed and their files
  # discarded, so nothing waits forever or keeps a CV around.
  STALE_AFTER = 10.minutes

  def self.expire_stale!
    where(status: %w[pending processing], updated_at: ...STALE_AFTER.ago)
      .update_all(status: "failed", error_message: CvImportJob::UNEXPECTED, source_data: nil, updated_at: Time.current)
  end

  def self.limit_reached?(user)
    user.cv_imports.where(created_at: 24.hours.ago..).count >= DAILY_LIMIT
  end

  # Adds the chosen draft sections to the user's library, in the CV's order,
  # and optionally fills profile fields that are still empty. Never overwrites
  # what the user has written, and can only be applied once.
  def apply!(section_indexes:, fill_profile:)
    raise ApiError.new("This CV hasn't been read yet.", status: :unprocessable_content) unless status == "succeeded"
    raise ApiError.new("This CV import has already been added.", status: :unprocessable_content) if applied_at

    drafts = result.fetch("sections", [])
    chosen = section_indexes.map(&:to_i).uniq.sort.filter_map { |index| drafts[index] if index >= 0 }

    transaction do
      lock!
      raise ApiError.new("This CV import has already been added.", status: :unprocessable_content) if applied_at

      templates = chosen.map { |attributes| user.section_templates.create!(attributes.slice(*SECTION_ATTRIBUTES)) }
      user.update_resume_profile!(merged_profile) if fill_profile
      update!(applied_at: Time.current)
      { section_templates: templates, profile: user.resume_header_profile }
    end
  end

  private

  SECTION_ATTRIBUTES = %w[
    title section_type description content role organization location start_date end_date current
  ].freeze

  def merged_profile
    current = user.resume_header_profile
    imported = result.fetch("header", {})
    filled = ResumeHeader::TEXT_FIELDS.index_with { |field| current[field].presence || imported[field].to_s }
    known_urls = current["links"].map { |link| link["url"] }
    new_links = Array(imported["links"]).reject { |link| known_urls.include?(link["url"]) }
    filled.merge("links" => (current["links"] + new_links).first(ResumeHeader::MAX_LINKS))
  end
end
