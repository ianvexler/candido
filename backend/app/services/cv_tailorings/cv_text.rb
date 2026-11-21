module CvTailorings
  # Turns a curriculum into plain, labelled text for the tailoring prompt.
  # Hidden sections and hidden inline text never reach the model.
  module CvText
    BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote".freeze

    module_function

    def call(curriculum)
      curriculum.visible_sections.map do |section|
        {
          id: section.id,
          heading: "#{section.section_type} · #{section.title}",
          description: Normalizer.squish(section.description),
          blocks: blocks_for(section.content)
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
      fragment = Nokogiri::HTML5.fragment(html.to_s)
      fragment.css("[data-cv-hidden]").each(&:remove)
      fragment.css(BLOCK_SELECTOR).filter_map do |node|
        # A list item holding a nested list would repeat its children.
        next if node.css(BLOCK_SELECTOR).any?

        Normalizer.squish(node.text).presence
      end
    end
  end
end
