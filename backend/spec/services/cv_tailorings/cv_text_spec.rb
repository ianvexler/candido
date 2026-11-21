require "rails_helper"

RSpec.describe CvTailorings::CvText do
  let(:curriculum) { create(:curriculum) }

  def add_section(attrs = {})
    curriculum.curriculum_sections.create!({ title: "Acme", section_type: "experience", content: "" }.merge(attrs))
  end

  it "one block per bullet and paragraph, without hidden text" do
    add_section(content: "<p>Led <span data-cv-hidden>secret</span>team</p><ul><li>Built APIs</li><li> </li></ul>")

    sections = described_class.call(curriculum.reload)

    expect(sections.first[:blocks]).to eq([ "Led team", "Built APIs" ])
  end

  it "skips hidden sections" do
    add_section(title: "Visible", content: "<p>Hello</p>")
    add_section(title: "Secret", content: "<p>Nope</p>", hidden: true)

    sections = described_class.call(curriculum.reload)

    expect(sections.map { |s| s[:heading] }).to eq([ "experience · Visible" ])
  end

  it "render labels sections by id" do
    section = add_section(description: "Backend", content: "<p>Hello</p>")

    text = described_class.render(described_class.call(curriculum.reload))

    expect(text).to include("[section #{section.id}] experience · Acme")
    expect(text).to include("Summary: Backend")
    expect(text).to include("- Hello")
  end
end
