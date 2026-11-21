module CvImports
  # Pulls the paragraph text out of a .docx so it can be sent as plain text.
  module DocxText
    WORD_NAMESPACE = { "w" => "http://schemas.openxmlformats.org/wordprocessingml/2006/main" }.freeze
    # A small .docx can expand enormously; refuse before inflating it.
    MAX_XML_BYTES = 20.megabytes
    MAX_TEXT_CHARS = 200_000
    TOO_LONG = "This CV is too long to read in one go.".freeze

    module_function

    def call(bytes)
      xml = nil
      # open_buffer returns the buffer, not the block's value, so read inside the block.
      Zip::File.open_buffer(StringIO.new(bytes)) do |zip|
        entry = zip.find_entry("word/document.xml")
        raise ExtractionError, TOO_LONG if entry && entry.size > MAX_XML_BYTES

        xml = entry&.get_input_stream&.read
      end
      raise ExtractionError, "This Word file couldn't be opened." if xml.nil?

      text = Nokogiri::XML(xml).xpath("//w:p", WORD_NAMESPACE)
        .map { |paragraph| paragraph.xpath(".//w:t", WORD_NAMESPACE).map(&:text).join.strip }
        .reject(&:empty?)
        .join("\n")
      raise ExtractionError, TOO_LONG if text.length > MAX_TEXT_CHARS

      text
    rescue Zip::Error
      raise ExtractionError, "This Word file couldn't be opened."
    end
  end
end
