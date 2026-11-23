module CvTailorings
  # Turns a curriculum into plain, labelled text for the tailoring prompt.
  # Each entry is its own numbered block. Hidden sections, hidden entries,
  # unticked items and hidden inline text never reach the model.
  module CvText
    BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote".freeze

    module_function

    def call(curriculum)
      pairs = curriculum.visible_sections.flat_map { |section| section.visible_entries.map { |entry| [ section, entry ] } }
      pairs.each.with_index(1).map do |(section, entry), number|
        {
          id: number,
          curriculum_section_id: section.id,
          entry_id: entry["id"],
          heading: [ section.section_type, entry["title"].presence ].compact.join(" · "),
          description: Normalizer.squish(entry["description"]),
          blocks: blocks_for(entry["content"])
        }
      end
    end

    def render(sections)
      sections.map do |section|
        lines = [ "[section #{section[:id]}] #{section[:heading]}" ]
        lines << "Summary: #{section[:description]}" if section[:description].present?
        section[:blocks].each { |block| lines << "- #{block}" }
        lines.join("\n")
      end.join("\n\n")
    end

    def blocks_for(html)
      fragment = Nokogiri::HTML5.fragment(CvItems.visible(html))
      fragment.css(BLOCK_SELECTOR).flat_map do |node|
        # A list item holding a nested list would repeat its children.
        next [] if node.css(BLOCK_SELECTOR).any?

        visible_runs(node).filter_map { |run| Normalizer.squish(run).presence }
      end
    end

    # The block's visible text, split wherever hidden text was, so a quote can
    # never join the text on either side of a hidden run. Hard breaks read as
    # spaces.
    def visible_runs(node, runs = [ +"" ])
      node.children.each do |child|
        if child.text?
          runs.last << child.content
        elsif child.name == "br"
          runs.last << " "
        elsif child.element? && child.key?("data-cv-hidden")
          runs << +""
        elsif child.element?
          visible_runs(child, runs)
        end
      end
      runs
    end
  end
end
