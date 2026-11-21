require "rails_helper"

RSpec.describe CvImports::DocxText do
  def docx(xml)
    buffer = Zip::OutputStream.write_buffer do |zip|
      zip.put_next_entry("word/document.xml")
      zip.write(xml)
    end
    buffer.string
  end

  it "returns each paragraph's text on its own line" do
    xml = <<~XML
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:r><w:t>Alex </w:t></w:r><w:r><w:t>Rivera</w:t></w:r></w:p>
        <w:p><w:r><w:t>Backend engineer</w:t></w:r></w:p>
      </w:body></w:document>
    XML

    expect(described_class.call(docx(xml))).to eq("Alex Rivera\nBackend engineer")
  end

  it "refuses a document that expands too far" do
    stub_const("CvImports::DocxText::MAX_XML_BYTES", 100)

    expect { described_class.call(docx("<w:document>#{'x' * 500}</w:document>")) }
      .to raise_error(CvImports::ExtractionError, "This CV is too long to read in one go.")
  end

  it "refuses text that is too long to send" do
    stub_const("CvImports::DocxText::MAX_TEXT_CHARS", 10)
    xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Much more than ten characters</w:t></w:r></w:p></w:body></w:document>'

    expect { described_class.call(docx(xml)) }
      .to raise_error(CvImports::ExtractionError, "This CV is too long to read in one go.")
  end

  it "explains a file that isn't a Word document" do
    expect { described_class.call("not a zip") }
      .to raise_error(CvImports::ExtractionError, "This Word file couldn't be opened.")
  end
end
