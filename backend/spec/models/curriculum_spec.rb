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
        section_template_id: first.id, entries: first.entries, hidden: false
      )

      first.update!(entries: [ first.entries.first.merge("content" => "<p>Changed in library</p>") ])
      expect(sections.first.reload.entries.first["content"]).to include("quietly")
    end

    it "rejects another user's template" do
      foreign = create(:section_template)

      expect { curriculum.import_section_templates!(foreign) }
        .to raise_error(ArgumentError, /belong to curriculum owner/)
      expect(curriculum.curriculum_sections).to be_empty
    end
  end

  describe "#duplicate_for_job!" do
    let(:job) { create(:job_board_entry, user: user, company: "Acme") }
    let(:source) do
      described_class.create!(user: user, title: "Main CV", layout: "two_column",
        header: { "name" => "Ada" }, styles: { "paper" => "letter" })
    end
    let(:template) { create(:section_template, user: user) }

    before do
      source.curriculum_sections.create!(section_type: "experience",
        entries: [
          { title: "Acme", role: "Engineer", start_date: "2022-03-01", content: "<p>Led</p>" },
          { title: "Globex", hidden: true }
        ], hidden: true, position: 0, placement: "main",
        section_template: template, synced_at: Time.zone.parse("2026-01-01"), styles: { "color" => "red" })
      source.curriculum_sections.create!(section_type: "skills", entries: [ { content: "<p>Ruby</p>" } ], position: 1,
        placement: "sidebar")
    end

    it "copies header, styles, layout and every section field" do
      copy = source.duplicate_for_job!(job)

      expect(copy).to have_attributes(title: "Main CV – Acme", tailored_for: "Acme", job_board_entry: job,
        source_curriculum: source, header: source.header, styles: source.styles, layout: "two_column", user_id: user.id)
      fields = %w[section_type entries hidden placement section_template_id synced_at styles]
      expect(copy.curriculum_sections.map { |s| s.attributes.slice(*fields) })
        .to eq(source.curriculum_sections.map { |s| s.attributes.slice(*fields) })
      expect(copy.curriculum_sections.map(&:id)).not_to eq(source.curriculum_sections.map(&:id))
      expect(copy.curriculum_sections.map(&:position)).to eq([ 0, 1 ])
    end

    it "leaves the source untouched" do
      updated_at = source.reload.updated_at

      source.duplicate_for_job!(job)

      expect(source.reload.curriculum_sections.count).to eq(2)
      expect(source.updated_at).to eq(updated_at)
    end

    it "nullifies the copy's link when the job is deleted" do
      copy = source.duplicate_for_job!(job)

      job.destroy!

      expect(copy.reload.job_board_entry_id).to be_nil
    end
  end

  describe "#latest_tailoring" do
    it "returns the most recent tailoring or nil" do
      expect(curriculum.latest_tailoring).to be_nil
      create(:cv_tailoring, curriculum: curriculum, user: user, created_at: 2.hours.ago)
      newest = create(:cv_tailoring, curriculum: curriculum, user: user)

      expect(curriculum.latest_tailoring).to eq(newest)
    end
  end
end

RSpec.describe Curriculum, "#merge_styles!" do
  it "keeps changes made by another request in the meantime" do
    curriculum = create(:curriculum, styles: { "paper" => "a4" })
    first = Curriculum.find(curriculum.id)
    second = Curriculum.find(curriculum.id)

    first.merge_styles!({ "paper" => "letter" })
    second.merge_styles!({ "font" => "lora" })

    expect(curriculum.reload.styles).to eq("paper" => "letter", "font" => "lora")
    expect(second.styles).to eq("paper" => "letter", "font" => "lora")
  end

  it "ignores a save older than the last one applied from the same page" do
    curriculum = create(:curriculum)

    curriculum.merge_styles!({ "accent" => "#111111" }, writer: "page-1", seq: 2)
    curriculum.merge_styles!({ "accent" => "#222222" }, writer: "page-1", seq: 1)

    expect(curriculum.reload.styles).to eq("accent" => "#111111")
  end

  it "applies a save from another page whatever its number" do
    curriculum = create(:curriculum)

    curriculum.merge_styles!({ "accent" => "#111111" }, writer: "page-1", seq: 5)
    curriculum.merge_styles!({ "accent" => "#222222" }, writer: "page-2", seq: 1)

    expect(curriculum.reload.styles).to eq("accent" => "#222222")
  end

  it "always applies saves that carry no ordering" do
    curriculum = create(:curriculum)

    curriculum.merge_styles!({ "accent" => "#111111" }, writer: "page-1", seq: 5)
    curriculum.merge_styles!({ "paper" => "letter" })

    expect(curriculum.reload.styles).to eq("accent" => "#111111", "paper" => "letter")
  end
end
