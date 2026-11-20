# Shared by library sections and the copies inside a CV: `content` is the
# editor's HTML. Hidden text is wrapped in <span data-cv-hidden> and stays in
# the stored HTML; preview and export drop it.
#
# Sections may also carry optional details (role, organization, location and
# a month range) for experience- and education-style entries.
module SectionContent
  extend ActiveSupport::Concern

  ALLOWED_TAGS = %w[
    p br strong b em i s u code a ul ol li h1 h2 h3 h4 h5 h6 blockquote hr span
  ].freeze
  ALLOWED_ATTRIBUTES = %w[href target rel style data-cv-hidden].freeze
  # The editor keeps an empty paragraph after a trailing list; it is not content.
  TRAILING_EMPTY_PARAGRAPHS = %r{(?:<p>(?:\s|&nbsp;|<br\s*/?>)*</p>)+\z}

  DETAIL_FIELDS = %i[role organization location start_date end_date current].freeze
  DETAIL_TEXT_FIELDS = %i[role organization location].freeze

  included do
    before_validation :normalize_content
    before_validation :normalize_details

    validates(*DETAIL_TEXT_FIELDS, length: { maximum: 200 })
    validate :end_date_not_before_start_date
  end

  class_methods do
    def sanitize_content(html)
      sanitized = Rails::HTML5::SafeListSanitizer.new.sanitize(
        html.to_s, tags: ALLOWED_TAGS, attributes: ALLOWED_ATTRIBUTES
      )
      blank_content?(sanitized) ? "" : sanitized.sub(TRAILING_EMPTY_PARAGRAPHS, "")
    end

    def blank_content?(html)
      html.to_s.gsub(/<[^>]+>/, " ").gsub("&nbsp;", " ").squish.blank?
    end
  end

  private

  def normalize_content
    self.content = self.class.sanitize_content(content)
  end

  def normalize_details
    DETAIL_TEXT_FIELDS.each { |field| self[field] = self[field].to_s.squish.presence }
    self.start_date = start_date&.beginning_of_month
    self.end_date = current? ? nil : end_date&.beginning_of_month
  end

  def end_date_not_before_start_date
    return if start_date.nil? || end_date.nil? || end_date >= start_date

    errors.add(:end_date, "can't be before the start date")
  end
end
