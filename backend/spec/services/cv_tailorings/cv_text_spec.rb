require "rails_helper"

RSpec.describe CvTailorings::CvText do
  let(:curriculum) { create(:curriculum) }

  def add_section(hidden: false, **entry)
    curriculum.curriculum_sections.create!(section_type: "experience", hidden: hidden, entries: [ { title: "Acme", **entry } ])
  end

  it "one block per bullet and paragraph, without hidden text" do
    add_section(content: "<p>Led <span data-cv-hidden>secret</span>team</p><ul><li>Built APIs</li><li> </li></ul>")

    sections = described_class.call(curriculum.reload)

    expect(sections.first[:blocks]).to eq([ "Led", "team", "Built APIs" ])
  end

  it "splits a block at hidden text so no quote can span it" do
    add_section(content: "<p>Led <span data-cv-hidden>a team of 5 and</span> shipped X</p>")

    sections = described_class.call(curriculum.reload)

    expect(sections.first[:blocks]).to eq([ "Led", "shipped X" ])
    rewrite = { "section_id" => sections.first[:id], "field" => "content", "kind" => "rewrite",
                "quote" => "Led shipped X", "replacement" => "Led and shipped X", "reason" => "Clearer" }
    expect(CvTailorings::Normalizer.call({ "suggestions" => [ rewrite ] }, sections)[:suggestions]).to be_empty
  end

  it "reads a hard break as a space" do
    add_section(content: "<p>Built APIs<br>Led a team</p>")

    sections = described_class.call(curriculum.reload)

    expect(sections.first[:blocks]).to eq([ "Built APIs Led a team" ])
  end

  it "skips hidden sections" do
    add_section(title: "Visible", content: "<p>Hello</p>")
    add_section(title: "Secret", content: "<p>Nope</p>", hidden: true)

    sections = described_class.call(curriculum.reload)

    expect(sections.map { |s| s[:heading] }).to eq([ "experience · Visible" ])
  end

  it "numbers each visible entry and remembers where it came from" do
    section = curriculum.curriculum_sections.create!(section_type: "Projects", entries: [
      { title: "One", content: "<p>A</p>" }, { title: "Left out", hidden: true }, { title: "Two", content: "<p>B</p>" }
    ])
    curriculum.curriculum_sections.create!(section_type: "Skills", position: 1, entries: [ { content: "<p>Ruby</p>" } ])

    units = described_class.call(curriculum.reload)

    expect(units.map { |unit| unit.slice(:id, :heading) }).to eq([
      { id: 1, heading: "Projects · One" }, { id: 2, heading: "Projects · Two" }, { id: 3, heading: "Skills" }
    ])
    expect(units[1]).to include(curriculum_section_id: section.id, entry_id: section.entries[2]["id"])
  end

  it "render labels entries by number" do
    add_section(description: "Backend", content: "<p>Hello</p>")

    text = described_class.render(described_class.call(curriculum.reload))

    expect(text).to include("[section 1] experience · Acme")
    expect(text).to include("Summary: Backend")
    expect(text).to include("- Hello")
  end
end
