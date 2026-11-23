# Shared by library sections and the copies inside a CV. A section is a heading
# (`section_type`) and a list of entries: a job, a degree, a project, or one
# untitled entry for plain sections such as skills.
#
# An entry's `content` is the editor's HTML. Hidden text is wrapped in
# <span data-cv-hidden> and stays in the stored HTML; preview and export drop
# it. Each block is an item that can be left out of a CV; see CvItems. An entry
# may also carry a role, organization, location and month range.
# The same entry has the same id in the library and in every copy.
module SectionContent
  extend ActiveSupport::Concern

  ALLOWED_TAGS = %w[
    p br strong b em i s u code a ul ol li h1 h2 h3 h4 h5 h6 blockquote hr span
  ].freeze
  ALLOWED_ATTRIBUTES = %w[href target rel style data-cv-hidden data-cv-item data-cv-off].freeze
  # The editor keeps an empty paragraph after a trailing list; it is not content.
  TRAILING_EMPTY_PARAGRAPHS = %r{(?:<p(?: data-cv-(?:item|off)="[^"]*")*>(?:\s|&nbsp;|<br\s*/?>)*</p>)+\z}

  MAX_ENTRIES = 60
  MAX_LINE = 200
  LINE_FIELDS = %w[role organization location].freeze
  ENTRY_FIELDS = %i[
    id title role organization location start_date end_date current description content hidden
  ].freeze
  ENTRY_ID = /\A[\w-]{1,64}\z/
  # From when a section was a single entry; a later migration drops them.
  OLD_COLUMNS = %w[title description content role organization location start_date end_date current].freeze

  included do
    self.ignored_columns += OLD_COLUMNS

    # Also fills a new record's entries, so a section always has one to write in.
    before_validation :normalize_entries
    validates :section_type, presence: true
    validate :entries_are_valid
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

  def visible_entries
    entries.reject { |entry| entry["hidden"] }
  end

  private

  def normalize_entries
    list = Array(entries).grep(Hash)
    list = [ {} ] if list.empty?
    contents = Array(entries_was).grep(Hash).to_h { |entry| entry.values_at("id", "content") }
    seen = Set.new
    self.entries = list.map do |raw|
      raw = raw.stringify_keys
      entry = normalize_entry(raw, contents.delete(raw["id"].to_s))
      entry["id"] = SecureRandom.uuid unless entry["id"].match?(ENTRY_ID) && seen.exclude?(entry["id"])
      seen << entry["id"]
      entry
    end
  end

  def normalize_entry(raw, previous_content)
    current = boolean(raw["current"])
    {
      "id" => raw["id"].to_s,
      "title" => raw["title"].to_s.squish,
      **LINE_FIELDS.index_with { |field| raw[field].to_s.squish.presence },
      "start_date" => month(raw["start_date"]),
      "end_date" => current ? nil : month(raw["end_date"]),
      "current" => current,
      "description" => raw["description"].to_s.strip.presence,
      "content" => normalize_content(raw["content"], previous_content),
      "hidden" => boolean(raw["hidden"])
    }
  end

  def normalize_content(html, previous)
    CvItems.assign(self.class.sanitize_content(html), previous: previous)
  end

  def boolean(value)
    ActiveModel::Type::Boolean.new.cast(value) || false
  end

  # "2022-03-17" is stored as "2022-03-01"; anything that isn't a date as nil.
  def month(value)
    ActiveModel::Type::Date.new.cast(value)&.beginning_of_month&.iso8601
  end

  def entries_are_valid
    errors.add(:base, "A section can have at most #{MAX_ENTRIES} entries") if entries.size > MAX_ENTRIES

    entries.each do |entry|
      LINE_FIELDS.each do |field|
        errors.add(:base, "#{field.humanize} is too long (maximum is #{MAX_LINE} characters)") if entry[field].to_s.length > MAX_LINE
      end
      first, last = entry.values_at("start_date", "end_date")
      errors.add(:base, "End date can't be before the start date") if first && last && last < first
    end
  end
end
