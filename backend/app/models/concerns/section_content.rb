# Shared by library sections and the copies inside a CV: `content` is the
# editor's HTML. Hidden text is wrapped in <span data-cv-hidden> and stays in
# the stored HTML; preview and export drop it.
module SectionContent
  extend ActiveSupport::Concern

  ALLOWED_TAGS = %w[
    p br strong b em i s u code a ul ol li h1 h2 h3 h4 h5 h6 blockquote hr span
  ].freeze
  ALLOWED_ATTRIBUTES = %w[href target rel style data-cv-hidden].freeze

  included do
    before_validation :normalize_content
  end

  class_methods do
    def sanitize_content(html)
      sanitized = Rails::HTML5::SafeListSanitizer.new.sanitize(
        html.to_s, tags: ALLOWED_TAGS, attributes: ALLOWED_ATTRIBUTES
      )
      blank_content?(sanitized) ? "" : sanitized
    end

    def blank_content?(html)
      html.to_s.gsub(/<[^>]+>/, " ").gsub("&nbsp;", " ").squish.blank?
    end
  end

  private

  def normalize_content
    self.content = self.class.sanitize_content(content)
  end
end
