require "rails_helper"

RSpec.describe CvImports::Draft do
  def section(overrides = {})
    {
      "section_type" => "Experience", "title" => "Acme", "role" => "Engineer", "organization" => "Acme",
      "location" => "Lisbon", "start_month" => "2022-03", "end_month" => "2024-01", "current" => false,
      "summary" => "", "blocks" => []
    }.merge(overrides)
  end

  def draft(sections: [], header: {})
    described_class.from_model_output("header" => header, "sections" => sections)
  end

  describe "section content" do
    it "groups consecutive bullets into one list and keeps order" do
      blocks = [
        { "kind" => "paragraph", "text" => "Intro" },
        { "kind" => "bullet", "text" => "One" },
        { "kind" => "bullet", "text" => "Two" },
        { "kind" => "heading", "text" => "Later" }
      ]

      content = draft(sections: [ section("blocks" => blocks) ])["sections"].first["content"]

      expect(content).to eq("<p>Intro</p><ul><li><p>One</p></li><li><p>Two</p></li></ul><h3>Later</h3>")
    end

    it "escapes anything that looks like HTML" do
      blocks = [ { "kind" => "bullet", "text" => "<script>alert(1)</script> & <b>bold</b>" } ]

      content = draft(sections: [ section("blocks" => blocks) ])["sections"].first["content"]

      expect(content).not_to include("<script", "<b>")
      expect(content).to include("&lt;script&gt;", "&amp;")
    end

    it "cuts very long block text" do
      blocks = [ { "kind" => "paragraph", "text" => "a" * 3000 } ]

      content = draft(sections: [ section("blocks" => blocks) ])["sections"].first["content"]

      expect(content).to eq("<p>#{'a' * 2000}</p>")
    end
  end

  describe "section fields" do
    it "maps fields to section template attributes" do
      result = draft(sections: [ section("summary" => " Led platform work ") ])["sections"].first

      expect(result).to include(
        "section_type" => "Experience", "title" => "Acme", "role" => "Engineer", "organization" => "Acme",
        "location" => "Lisbon", "description" => "Led platform work", "current" => false,
        "start_date" => Date.new(2022, 3, 1), "end_date" => Date.new(2024, 1, 1)
      )
    end

    it "drops dates that aren't YYYY-MM" do
      result = draft(sections: [ section("start_month" => "March 2022", "end_month" => "") ])["sections"].first

      expect(result).to include("start_date" => nil, "end_date" => nil)
    end

    it "drops an end date before the start date" do
      result = draft(sections: [ section("start_month" => "2024-01", "end_month" => "2022-01") ])["sections"].first

      expect(result).to include("start_date" => Date.new(2024, 1, 1), "end_date" => nil)
    end

    it "drops the end date of a current entry" do
      result = draft(sections: [ section("current" => true) ])["sections"].first

      expect(result).to include("current" => true, "end_date" => nil)
    end

    it "falls back for a blank title and type" do
      untitled, typed = draft(sections: [
        section("title" => " ", "section_type" => " "),
        section("title" => "", "section_type" => "Skills")
      ])["sections"]

      expect(untitled).to include("title" => "Untitled", "section_type" => "Section")
      expect(typed).to include("title" => "Skills", "section_type" => "Skills")
    end

    it "keeps at most 40 sections" do
      result = draft(sections: Array.new(45) { |i| section("title" => "S#{i}") })["sections"]

      expect(result.size).to eq(40)
      expect(result.last["title"]).to eq("S39")
    end
  end

  describe "header" do
    it "trims text, fixes bare domains and drops unsafe links" do
      header = draft(header: {
        "name" => "  Alex Rivera ", "headline" => "Engineer", "email" => "alex@example.com",
        "phone" => "", "location" => "Lisbon",
        "links" => [
          { "label" => "Site", "url" => "alex.example.com" },
          { "label" => "Bad", "url" => "javascript:alert(1)" },
          { "label" => "Empty", "url" => " " }
        ]
      })["header"]

      expect(header).to include("name" => "Alex Rivera", "location" => "Lisbon", "phone" => "")
      expect(header["links"]).to eq([ { "label" => "Site", "url" => "https://alex.example.com" } ])
    end

    it "keeps at most 10 links" do
      links = Array.new(12) { |i| { "label" => "L#{i}", "url" => "https://example.com/#{i}" } }

      expect(draft(header: { "links" => links })["header"]["links"].size).to eq(10)
    end
  end

  it "copes with missing keys" do
    result = described_class.from_model_output({})

    expect(result["sections"]).to eq([])
    expect(result["header"]).to include("name" => "", "links" => [])
  end

  describe ".empty?" do
    it "is true without sections or header details" do
      expect(described_class.empty?(draft)).to be(true)
    end

    it "is false with a section" do
      expect(described_class.empty?(draft(sections: [ section ]))).to be(false)
    end
  end
end
