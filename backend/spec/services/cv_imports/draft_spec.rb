require "rails_helper"

RSpec.describe CvImports::Draft do
  def section(fields = {}, type: "Experience", **rest)
    { "section_type" => type, "entries" => [ entry(fields.merge(rest)) ] }
  end

  def entry(overrides = {})
    {
      "title" => "Acme", "role" => "Engineer", "organization" => "Acme",
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

      content = draft(sections: [ section("blocks" => blocks) ])["sections"].first["entries"].first["content"]

      expect(content).to eq("<p>Intro</p><ul><li><p>One</p></li><li><p>Two</p></li></ul><h3>Later</h3>")
    end

    it "escapes anything that looks like HTML" do
      blocks = [ { "kind" => "bullet", "text" => "<script>alert(1)</script> & <b>bold</b>" } ]

      content = draft(sections: [ section("blocks" => blocks) ])["sections"].first["entries"].first["content"]

      expect(content).not_to include("<script", "<b>")
      expect(content).to include("&lt;script&gt;", "&amp;")
    end

    it "cuts very long block text" do
      blocks = [ { "kind" => "paragraph", "text" => "a" * 3000 } ]

      content = draft(sections: [ section("blocks" => blocks) ])["sections"].first["entries"].first["content"]

      expect(content).to eq("<p>#{'a' * 2000}</p>")
    end
  end

  describe "section fields" do
    it "maps fields to section template attributes" do
      result = draft(sections: [ section("summary" => " Led platform work ") ])["sections"].first["entries"].first

      expect(result).to include(
        "title" => "Acme", "role" => "Engineer", "organization" => "Acme",
        "location" => "Lisbon", "description" => "Led platform work", "current" => false,
        "start_date" => Date.new(2022, 3, 1), "end_date" => Date.new(2024, 1, 1)
      )
    end

    it "drops dates that aren't YYYY-MM" do
      result = draft(sections: [ section("start_month" => "March 2022", "end_month" => "") ])["sections"].first["entries"].first

      expect(result).to include("start_date" => nil, "end_date" => nil)
    end

    it "drops an end date before the start date" do
      result = draft(sections: [ section("start_month" => "2024-01", "end_month" => "2022-01") ])["sections"].first["entries"].first

      expect(result).to include("start_date" => Date.new(2024, 1, 1), "end_date" => nil)
    end

    it "drops the end date of a current entry" do
      result = draft(sections: [ section("current" => true) ])["sections"].first["entries"].first

      expect(result).to include("current" => true, "end_date" => nil)
    end

    it "falls back for a blank heading" do
      result = draft(sections: [ section(type: " ") ])["sections"].first

      expect(result["section_type"]).to eq("Section")
    end

    it "drops a title that only repeats the heading" do
      result = draft(sections: [ section({ "title" => "Technical skills" }, type: "Technical Skills") ])["sections"].first

      expect(result["entries"].first["title"]).to eq("")
    end

    it "keeps at most 40 sections" do
      result = draft(sections: Array.new(45) { |i| section(type: "S#{i}") })["sections"]

      expect(result.size).to eq(40)
      expect(result.last["section_type"]).to eq("S39")
    end
  end

  describe "entries" do
    it "keeps several entries under one heading, each with its own id" do
      raw = { "section_type" => "Projects", "entries" => [ entry("title" => "One"), entry("title" => "Two") ] }

      result = draft(sections: [ raw ])["sections"]

      expect(result.size).to eq(1)
      expect(result.first["entries"].pluck("title")).to eq([ "One", "Two" ])
      expect(result.first["entries"].pluck("id").uniq.size).to eq(2)
    end

    it "merges sections the model repeated, whatever the heading's case" do
      result = draft(sections: [
        section({ "title" => "One" }, type: "Key Projects"), section({ "title" => "Uni" }, type: "Education"),
        section({ "title" => "Two" }, type: "KEY PROJECTS")
      ])["sections"]

      expect(result.pluck("section_type")).to eq([ "Key Projects", "Education" ])
      expect(result.first["entries"].pluck("title")).to eq([ "One", "Two" ])
    end

    it "drops a section without entries" do
      expect(draft(sections: [ { "section_type" => "Skills", "entries" => [] } ])["sections"]).to eq([])
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
