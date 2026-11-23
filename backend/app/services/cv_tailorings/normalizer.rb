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
    # having it. Matched against every section's type, hidden ones included. A title only counts
    # when the type is "custom": elsewhere it's often an employer ("University of Leeds").
    # The client mirrors this (MISSING_SECTION_PATTERNS) to hide an item once it's added.
    MISSING_SECTIONS = {
      "Experience" => /\b(?:experience|employment|work|career|jobs?|internships?|positions?|roles?|background|history)\b/i,
      "Education" => /\b(?:education|qualifications?|academics?|degrees?|stud(?:y|ies)|school|university|training|certificat(?:es?|ions?))\b/i,
      "Skills" => /\b(?:skills?|competenc(?:y|ies|es?)|technolog(?:y|ies)|tools?|stack|expertise|proficienc(?:y|ies)|programming languages?)\b/i
    }.freeze

    module_function

    # `existing_sections` are [type, title] pairs for every section in the CV, hidden ones included.
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

    # Essential sections the CV has none of, at most MAX_MISSING, each with a short reason.
    def missing_sections(value, existing_sections)
      headings = existing_sections.map { |type, title| type.to_s.casecmp?("custom") ? title.to_s : type.to_s }
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

    # One suggestion per piece of text: two on overlapping text would mark it twice, and
    # accepting one would leave the other pointing at text that's gone. A rewrite wins
    # over notes on the same text; otherwise the first (most impactful) is kept.
    def suggestions(value, sections)
      by_id = sections.index_by { |section| section[:id] }
      kept = []
      list(value).each do |raw|
        break if kept.size >= MAX_SUGGESTIONS

        attrs = suggestion(raw, by_id)
        next unless attrs

        clashes = kept.select { |other| overlap?(other, attrs, sections) }
        if clashes.empty?
          kept << attrs
        elsif attrs[:kind] == "rewrite" && clashes.all? { |other| other[:kind] == "note" }
          kept[kept.index(clashes.first)] = attrs
          kept -= clashes
        end
      end
      kept.each_with_index.map { |attrs, position| attrs.merge(position: position) }
    end

    # Overlapping quotes in the same block. A quote is marked at the first block containing it.
    def overlap?(one, other, sections)
      return false unless one.values_at(:curriculum_section_id, :entry_id) == other.values_at(:curriculum_section_id, :entry_id) && one[:field] == other[:field]

      a = squish(one[:quote])
      b = squish(other[:quote])
      return false unless a.include?(b) || b.include?(a)

      section = sections.find { |item| item.values_at(:curriculum_section_id, :entry_id) == one.values_at(:curriculum_section_id, :entry_id) }
      one[:field] == "description" || block_of(section, a) == block_of(section, b)
    end

    def block_of(section, quote)
      section[:blocks].index { |text| squish(text).include?(quote) }
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

      { curriculum_section_id: section[:curriculum_section_id], entry_id: section[:entry_id], kind: kind, field: field, quote: quote,
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
