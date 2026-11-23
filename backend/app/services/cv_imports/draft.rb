module CvImports
  # Turns the model's structured reply into a draft the app can trust:
  # section attributes with HTML built here from escaped text, and header
  # fields cleaned the same way as a user's profile. The model never supplies
  # HTML, and nothing is saved until the user applies the draft.
  module Draft
    MAX_SECTIONS = 40
    MAX_ENTRIES = SectionContent::MAX_ENTRIES
    MAX_BLOCKS = 60
    MAX_TEXT = 200
    MAX_BLOCK_TEXT = 2000
    MONTH = /\A(\d{4})-(0[1-9]|1[0-2])\z/
    BLOCK_TAGS = { "paragraph" => "p", "heading" => "h3" }.freeze

    module_function

    # Returns { "header" => {...}, "sections" => [{ "section_type", "entries" }] }.
    def from_model_output(output)
      output = output.to_h.deep_stringify_keys
      {
        "header" => header(output["header"].to_h),
        "sections" => sections(Array(output["sections"]).first(MAX_SECTIONS))
      }
    end

    def empty?(draft)
      draft["sections"].empty? && ResumeHeader::TEXT_FIELDS.all? { |field| draft["header"][field].blank? } &&
        draft["header"]["links"].empty?
    end

    # Sections under the same heading become one, in case the model split them.
    def sections(raw_sections)
      raw_sections
        .map(&:to_h)
        .group_by { |raw| (text(raw["section_type"]).presence || "Section").downcase }
        .map do |_key, group|
          heading = text(group.first["section_type"]).presence || "Section"
          raw_entries = group.flat_map { |raw| Array(raw["entries"]) }.first(MAX_ENTRIES)
          { "section_type" => heading, "entries" => raw_entries.map { |raw| entry(raw.to_h, heading) } }
        end
        .reject { |section| section["entries"].empty? }
    end

    def entry(raw, heading)
      title = text(raw["title"])
      start_date = month(raw["start_month"])
      current = raw["current"] == true
      end_date = current ? nil : month(raw["end_month"])
      end_date = nil if start_date && end_date && end_date < start_date

      {
        "id" => SecureRandom.uuid,
        # A plain section's title often just repeats its heading.
        "title" => title.casecmp?(heading) ? "" : title,
        "description" => text(raw["summary"], MAX_BLOCK_TEXT).presence,
        "role" => text(raw["role"]).presence,
        "organization" => text(raw["organization"]).presence,
        "location" => text(raw["location"]).presence,
        "start_date" => start_date,
        "end_date" => end_date,
        "current" => current,
        "content" => content(Array(raw["blocks"]).first(MAX_BLOCKS)),
        "hidden" => false
      }
    end

    # Consecutive bullets share one list, matching what the editor produces.
    def content(blocks)
      blocks.map(&:to_h)
        .map { |block| [ block["kind"].to_s, text(block["text"], MAX_BLOCK_TEXT) ] }
        .reject { |_kind, body| body.blank? }
        .chunk_while { |a, b| a.first == "bullet" && b.first == "bullet" }
        .map do |group|
          if group.first.first == "bullet"
            "<ul>#{group.map { |_kind, body| "<li><p>#{escape(body)}</p></li>" }.join}</ul>"
          else
            tag = BLOCK_TAGS.fetch(group.first.first, "p")
            "<#{tag}>#{escape(group.first.last)}</#{tag}>"
          end
        end
        .join
    end

    def header(raw)
      fields = ResumeHeader::TEXT_FIELDS.index_with { |field| text(raw[field]) }
      links = Array(raw["links"]).filter_map { |link| clean_link(link.to_h) }.first(ResumeHeader::MAX_LINKS)
      fields.merge("links" => links)
    end

    def clean_link(link)
      url = text(link["url"])
      return if url.blank?

      { "label" => text(link["label"]), "url" => ResumeHeader.clean_url(url) }
    rescue ApiError
      nil
    end

    def month(value)
      match = MONTH.match(value.to_s.strip)
      match && Date.new(match[1].to_i, match[2].to_i, 1)
    end

    def text(value, limit = MAX_TEXT)
      value.to_s.squish.first(limit)
    end

    def escape(value)
      ERB::Util.html_escape(value)
    end
  end
end
