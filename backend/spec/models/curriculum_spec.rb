require "rails_helper"

RSpec.describe Curriculum do
  let(:user) { create(:user) }
  let(:curriculum) { described_class.create!(user: user, title: "Backend roles") }

  describe "#import_section_templates!" do
    it "copies templates, content included, as independent sections" do
      first = create(:section_template, user: user, title: "Acme", content: "<p>Led <span data-cv-hidden=\"true\">quietly</span></p>")
      second = create(:section_template, user: user, title: "Skills", content: "<ul><li><p>Ruby</p></li></ul>")

      sections = curriculum.import_section_templates!([ first, second ])

      expect(sections.map(&:position)).to eq([ 0, 1 ])
      expect(sections.first).to have_attributes(
        title: "Acme", section_template_id: first.id, content: first.content, hidden: false
      )

      first.update!(content: "<p>Changed in library</p>")
      expect(sections.first.reload.content).to include("quietly")
    end

    it "copies section details" do
      template = create(:section_template, user: user, role: "Engineer", organization: "Acme",
        location: "London", start_date: Date.new(2022, 3, 1), current: true)

      section = curriculum.import_section_templates!(template).first

      expect(section).to have_attributes(role: "Engineer", organization: "Acme", location: "London",
        start_date: Date.new(2022, 3, 1), end_date: nil, current: true)
    end

    it "rejects another user's template" do
      foreign = create(:section_template)

      expect { curriculum.import_section_templates!(foreign) }
        .to raise_error(ArgumentError, /belong to curriculum owner/)
      expect(curriculum.curriculum_sections).to be_empty
    end
  end
end

RSpec.describe Curriculum, "#merge_styles!" do
  it "keeps changes made by another request in the meantime" do
    curriculum = create(:curriculum, styles: { "paper" => "a4" })
    first = Curriculum.find(curriculum.id)
    second = Curriculum.find(curriculum.id)

    first.merge_styles!("paper" => "letter")
    second.merge_styles!("font" => "lora")

    expect(curriculum.reload.styles).to eq("paper" => "letter", "font" => "lora")
    expect(second.styles).to eq("paper" => "letter", "font" => "lora")
  end
end
