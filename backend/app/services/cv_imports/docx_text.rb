module CvImports
  # Pulls the paragraph text out of a .docx so it can be sent as plain text.
  module DocxText
    WORD_NAMESPACE = { "w" => "http://schemas.openxmlformats.org/wordprocessingml/2006/main" }.freeze

    module_function

    def call(bytes)
      xml = nil
      # open_buffer returns the buffer, not the block's value, so read inside the block.
      Zip::File.open_buffer(StringIO.new(bytes)) { |zip| xml = zip.find_entry("word/document.xml")&.get_input_stream&.read }
      raise ExtractionError, "This Word file couldn't be opened." if xml.nil?

      Nokogiri::XML(xml).xpath("//w:p", WORD_NAMESPACE)
        .map { |paragraph| paragraph.xpath(".//w:t", WORD_NAMESPACE).map(&:text).join.strip }
        .reject(&:empty?)
        .join("\n")
    rescue Zip::Error
      raise ExtractionError, "This Word file couldn't be opened."
    end
  end
end
