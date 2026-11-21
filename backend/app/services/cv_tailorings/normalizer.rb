module CvTailorings
  # Validates and trims what the model sent back: enums fall back, text is cut
  # to the concision limits, and suggestions that don't point at real CV text
  # are dropped. Text is kept literal; escaping happens where it is inserted.
  module Normalizer
    FITS = %w[strong partial weak].freeze
    COVERAGES = %w[yes partly no].freeze
    MAX_SUMMARY = 240
    MAX_REQUIREMENTS = 8
    MAX_REQUIREMENT = 60
    MAX_GAPS = 4
    MAX_GAP = 90
    MAX_REASON = 120
    MAX_SUGGESTIONS = 12

    module_function

    def call(output, sections)
      output = {} unless output.is_a?(Hash)
      {
        report: {
          fit: pick(output["fit"], FITS, "partial"),
          summary: cut(squish(output["summary"]), MAX_SUMMARY),
          requirements: requirements(output["requirements"]),
          gaps: list(output["gaps"]).filter_map { |gap| cut(squish(gap), MAX_GAP).presence }.first(MAX_GAPS)
        },
        suggestions: suggestions(output["suggestions"], sections)
      }
    end

    def squish(text)
      text.to_s.gsub("&nbsp;", " ").tr(" ", " ").squish
    end

    def cut(text, limit)
      return text if text.length <= limit

      clipped = text[0, limit]
      clipped = clipped.sub(/\s+\S*\z/, "") if text[limit] != " " && clipped.include?(" ")
      "#{clipped.rstrip}…"
    end

    def pick(value, allowed, fallback)
      allowed.include?(value) ? value : fallback
    end

    def list(value)
      value.is_a?(Array) ? value : []
    end

    def requirements(value)
      list(value).filter_map do |item|
        next unless item.is_a?(Hash)

        text = cut(squish(item["text"]), MAX_REQUIREMENT)
        { text: text, covered: pick(item["covered"], COVERAGES, "partly") } if text.present?
      end.first(MAX_REQUIREMENTS)
    end

    def suggestions(value, sections)
      by_id = sections.index_by { |section| section[:id] }
      kept = []
      list(value).each do |raw|
        break if kept.size >= MAX_SUGGESTIONS

        attrs = suggestion(raw, by_id)
        kept << attrs.merge(position: kept.size) if attrs
      end
      kept
    end

    def suggestion(raw, by_id)
      return unless raw.is_a?(Hash)

      section = by_id[raw["section_id"]]
      kind = raw["kind"]
      field = raw["field"]
      return unless section && CvTailoringSuggestion::KINDS.include?(kind) && CvTailoringSuggestion::FIELDS.include?(field)

      quote = raw["quote"].to_s
      reason = cut(squish(raw["reason"]), MAX_REASON)
      return if squish(quote).empty? || reason.empty? || !quoted?(section, field, quote)

      replacement = kind == "rewrite" ? raw["replacement"].to_s : nil
      return if kind == "rewrite" && !valid_replacement?(replacement, quote)

      { curriculum_section_id: section[:id], kind: kind, field: field, quote: quote,
        replacement: replacement, reason: reason }
    end

    def quoted?(section, field, quote)
      needle = squish(quote)
      haystacks = field == "description" ? [ section[:description] ] : section[:blocks]
      haystacks.any? { |text| squish(text).include?(needle) }
    end

    def valid_replacement?(replacement, quote)
      replacement.strip.present? && replacement.length <= quote.length * 1.3 + 40
    end
  end
end
