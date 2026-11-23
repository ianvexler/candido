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
    # The prompt asks for 120; the slack keeps a slightly long reason whole instead of cutting it mid-sentence.
    MAX_REASON = 160
    MAX_SUGGESTIONS = 12
    MAX_MISSING = 2
    # The only sections the review may say are missing, each with the headings that count as
    # having it. Matched against every section's type and title, hidden ones included, so a CV
    # that has the section in any form is never told to add it. The client mirrors these
    # patterns (MISSING_SECTION_PATTERNS) to hide an item once the section is added.
    MISSING_SECTIONS = {
      "Experience" => /experience|employment|work|career|job|intern|position/i,
      "Education" => /education|qualification|academic|degree|stud(?:y|ies)|school|university|training|certific/i,
      "Skills" => /skill|competenc|technolog|tool|stack|expertise/i
    }.freeze

    module_function

    # `existing_sections` are the type and title of every section in the CV, hidden ones included.
    def call(output, sections, existing_sections: [])
      output = {} unless output.is_a?(Hash)
      {
        report: {
          fit: pick(output["fit"], FITS, "partial"),
          summary: cut(squish(output["summary"]), MAX_SUMMARY),
          requirements: requirements(output["requirements"]),
          gaps: list(output["gaps"]).filter_map { |gap| cut(squish(gap), MAX_GAP).presence }.first(MAX_GAPS),
          missing_sections: missing_sections(output["missing_sections"], existing_sections)
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

    # One suggestion per piece of text: two on overlapping text would mark it twice, and
    # accepting one would leave the other pointing at text that's gone. A rewrite wins
    # over a note on the same text; otherwise the first (most impactful) is kept.
    # Essential sections the CV has none of, at most MAX_MISSING, each with a short reason.
    def missing_sections(value, existing_sections)
      headings = existing_sections.compact.map(&:to_s)
      kept = []
      list(value).each do |item|
        next unless item.is_a?(Hash)

        section = item["section"]
        pattern = MISSING_SECTIONS[section]
        reason = cut(squish(item["reason"]), MAX_GAP)
        next if pattern.nil? || reason.empty? || kept.any? { |other| other[:section] == section }
        next if headings.any? { |heading| heading.match?(pattern) }

        kept << { section: section, reason: reason }
      end
      kept.first(MAX_MISSING)
    end

    def suggestions(value, sections)
      by_id = sections.index_by { |section| section[:id] }
      kept = []
      list(value).each do |raw|
        break if kept.size >= MAX_SUGGESTIONS

        attrs = suggestion(raw, by_id)
        next unless attrs

        clash = kept.index { |other| overlap?(other, attrs) }
        if clash.nil?
          kept << attrs
        elsif kept[clash][:kind] == "note" && attrs[:kind] == "rewrite"
          kept[clash] = attrs
        end
      end
      kept.each_with_index.map { |attrs, position| attrs.merge(position: position) }
    end

    def overlap?(one, other)
      return false unless one[:curriculum_section_id] == other[:curriculum_section_id] && one[:field] == other[:field]

      a = squish(one[:quote])
      b = squish(other[:quote])
      a.include?(b) || b.include?(a)
    end

    def suggestion(raw, by_id)
      return unless raw.is_a?(Hash)

      section = by_id[raw["section_id"]]
      kind = raw["kind"]
      field = raw["field"]
      return unless section && CvTailoringSuggestion::KINDS.include?(kind) && CvTailoringSuggestion::FIELDS.include?(field)

      quote = unlabel(raw["quote"].to_s)
      reason = cut(squish(raw["reason"]), MAX_REASON)
      return if squish(quote).empty? || reason.empty? || !quoted?(section, field, quote)

      replacement = kind == "rewrite" ? raw["replacement"].to_s : nil
      return if kind == "rewrite" && !valid_replacement?(replacement, quote)

      { curriculum_section_id: section[:id], kind: kind, field: field, quote: quote,
        replacement: replacement, reason: reason }
    end

    # CvText.render prefixes blocks with "- " and the description with
    # "Summary: "; the model sometimes copies the label into the quote.
    def unlabel(quote)
      quote.sub(/\A\s*(?:- |Summary: )/, "")
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
