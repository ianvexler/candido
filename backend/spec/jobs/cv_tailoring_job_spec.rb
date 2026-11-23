require "rails_helper"

RSpec.describe CvTailoringJob do
  let(:user) { create(:user) }
  let(:curriculum) { create(:curriculum, user: user) }
  let(:job) { create(:job_board_entry, user: user) }
  let!(:section) { curriculum.curriculum_sections.create!(title: "Work", section_type: "experience", content: "<p>Led a team</p>") }
  let(:tailoring) { create(:cv_tailoring, user: user, curriculum: curriculum, job_board_entry: job) }
  let(:output) do
    {
      "fit" => "strong", "summary" => "Good match.", "requirements" => [], "gaps" => [],
      "suggestions" => [
        { "section_id" => section.id, "kind" => "rewrite", "field" => "content", "quote" => "Led a team",
          "replacement" => "Led a team of five", "reason" => "Adds scope" }
      ]
    }
  end
  let(:reviewer) { instance_double(CvTailorings::Reviewer) }

  before { allow(CvTailorings::Reviewer).to receive(:new).and_return(reviewer) }

  it "stores the report and valid suggestions" do
    allow(reviewer).to receive(:call).and_return({ output: output, used_posting: true })

    described_class.perform_now(tailoring.id)

    tailoring.reload
    expect(tailoring.status).to eq("succeeded")
    expect(tailoring.used_posting).to be(true)
    expect(tailoring.report["fit"]).to eq("strong")
    expect(tailoring.suggestions.count).to eq(1)
    expect(tailoring.suggestions.first.quote).to eq("Led a team")
  end

  it "keeps only missing sections the CV doesn't have, counting hidden sections" do
    curriculum.curriculum_sections.create!(title: "Uni", section_type: "Education", hidden: true, position: 1)
    missing = [ { "section" => "Education", "reason" => "Add your degree" }, { "section" => "Skills", "reason" => "List your tools" } ]
    allow(reviewer).to receive(:call).and_return({ output: output.merge("missing_sections" => missing), used_posting: false })

    described_class.perform_now(tailoring.id)

    expect(tailoring.reload.report["missing_sections"]).to eq([ { "section" => "Skills", "reason" => "List your tools" } ])
  end

  it "fails with the reviewer's message" do
    allow(reviewer).to receive(:call).and_raise(CvTailorings::ReviewError.new("The CV reviewer is busy. Try again in a minute."))

    described_class.perform_now(tailoring.id)

    expect(tailoring.reload).to have_attributes(status: "failed", error_message: "The CV reviewer is busy. Try again in a minute.")
  end

  it "fails with the stale message and re-raises unexpected errors" do
    allow(reviewer).to receive(:call).and_raise(RuntimeError, "boom")

    expect { described_class.perform_now(tailoring.id) }.to raise_error(RuntimeError)

    expect(tailoring.reload).to have_attributes(status: "failed", error_message: CvTailoring::STALE_MESSAGE)
  end

  it "does nothing for a run already claimed" do
    tailoring.update!(status: "processing")
    expect(reviewer).not_to receive(:call)

    described_class.perform_now(tailoring.id)

    expect(tailoring.reload.status).to eq("processing")
  end

  it "fails when the job was removed" do
    tailoring.update!(job_board_entry: nil)
    expect(reviewer).not_to receive(:call)

    described_class.perform_now(tailoring.id)

    expect(tailoring.reload).to have_attributes(status: "failed", error_message: "This job was removed from your board.")
  end

  it "keeps the review when a section is removed while it runs" do
    other = curriculum.curriculum_sections.create!(title: "Skills", section_type: "skills", content: "<p>Ruby</p>")
    output["suggestions"] << { "section_id" => other.id, "kind" => "note", "field" => "content", "quote" => "Ruby",
                               "replacement" => "", "reason" => "Name the Ruby version" }
    allow(reviewer).to receive(:call) do
      other.destroy!
      { output: output, used_posting: false }
    end

    described_class.perform_now(tailoring.id)

    tailoring.reload
    expect(tailoring.status).to eq("succeeded")
    expect(tailoring.suggestions.pluck(:curriculum_section_id)).to eq([ section.id ])
  end

  it "fails when the CV was deleted" do
    tailoring
    curriculum.destroy!
    expect(reviewer).not_to receive(:call)

    described_class.perform_now(tailoring.id)

    expect(tailoring.reload).to have_attributes(status: "failed", error_message: "This CV was deleted.", curriculum_id: nil)
  end

  it "gives the reviewer a heartbeat that keeps the run from going stale" do
    allow(reviewer).to receive(:call) do |heartbeat:, **|
      CvTailoring.where(id: tailoring.id).update_all(updated_at: 9.minutes.ago)
      heartbeat.call
      expect(CvTailoring.stale.where(id: tailoring.id)).to be_empty
      { output: output, used_posting: false }
    end

    described_class.perform_now(tailoring.id)

    expect(tailoring.reload.status).to eq("succeeded")
  end

  it "drops a late result for an expired run" do
    allow(reviewer).to receive(:call) do
      CvTailoring.where(id: tailoring.id).update_all(status: "failed", error_message: CvTailoring::STALE_MESSAGE)
      { output: output, used_posting: false }
    end

    described_class.perform_now(tailoring.id)

    expect(tailoring.reload.status).to eq("failed")
    expect(tailoring.suggestions.count).to eq(0)
  end

  it "passes earlier rejected quotes as declined" do
    earlier = create(:cv_tailoring, user: user, curriculum: curriculum, job_board_entry: job, status: "succeeded")
    create(:cv_tailoring_suggestion, cv_tailoring: earlier, curriculum_section: section, quote: "Old quote", status: "rejected")
    create(:cv_tailoring_suggestion, cv_tailoring: earlier, curriculum_section: section, quote: "Kept", status: "accepted")
    create(:cv_tailoring_suggestion, cv_tailoring: earlier, curriculum_section: section, quote: "Never looked at", status: "superseded")
    allow(reviewer).to receive(:call).and_return({ output: {}, used_posting: false })

    described_class.perform_now(tailoring.id)

    expect(reviewer).to have_received(:call).with(hash_including(declined_quotes: [ "Old quote" ]))
  end
end
