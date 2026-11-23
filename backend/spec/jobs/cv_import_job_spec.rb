require "rails_helper"

RSpec.describe CvImportJob do
  let(:cv_import) { create(:cv_import) }
  let(:extractor) { instance_double(CvImports::Extractor) }
  let(:output) do
    {
      "header" => { "name" => "Alex Rivera", "links" => [] },
      "sections" => [ { "section_type" => "Experience", "entries" => [ { "title" => "Acme", "blocks" => [ { "kind" => "bullet", "text" => "Shipped" } ] } ] } ]
    }
  end

  before { allow(CvImports::Extractor).to receive(:new).and_return(extractor) }

  it "stores the draft, marks it read, and forgets the file" do
    allow(extractor).to receive(:call).with(data: "%PDF-1.4 fake", media_type: "application/pdf").and_return(output)

    described_class.perform_now(cv_import.id)

    cv_import.reload
    expect(cv_import.status).to eq("succeeded")
    expect(cv_import.source_data).to be_nil
    expect(cv_import.result["sections"].first["entries"].first).to include("title" => "Acme", "content" => "<ul><li><p>Shipped</p></li></ul>")
    expect(cv_import.result["header"]["name"]).to eq("Alex Rivera")
  end

  it "records a readable failure and forgets the file" do
    allow(extractor).to receive(:call).and_raise(CvImports::ExtractionError, "The CV reader is busy. Try again in a minute.")

    described_class.perform_now(cv_import.id)

    expect(cv_import.reload).to have_attributes(
      status: "failed", error_message: "The CV reader is busy. Try again in a minute.", source_data: nil
    )
  end

  it "fails an import where nothing was found" do
    allow(extractor).to receive(:call).and_return("header" => {}, "sections" => [])

    described_class.perform_now(cv_import.id)

    expect(cv_import.reload).to have_attributes(status: "failed", error_message: "We couldn't find any sections in this file.")
  end

  it "marks unexpected errors as failed and re-raises them" do
    allow(extractor).to receive(:call).and_raise(RuntimeError, "boom")

    expect { described_class.perform_now(cv_import.id) }.to raise_error(RuntimeError, "boom")
    expect(cv_import.reload).to have_attributes(
      status: "failed", error_message: "Something went wrong reading this CV. Try again later.", source_data: nil
    )
  end

  it "doesn't overwrite an import that expired while it was being read" do
    allow(extractor).to receive(:call) do
      CvImport.where(id: cv_import.id).update_all(status: "failed", error_message: "expired", source_data: nil)
      output
    end

    described_class.perform_now(cv_import.id)

    expect(cv_import.reload).to have_attributes(status: "failed", error_message: "expired", result: nil)
  end

  it "skips an import that isn't pending" do
    done = create(:cv_import, status: "succeeded", source_data: nil)

    described_class.perform_now(done.id)

    expect(CvImports::Extractor).not_to have_received(:new)
  end
end
