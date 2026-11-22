require "rails_helper"

RSpec.describe CvTailorings::Normalizer do
  let(:sections) do
    [ { id: 1, heading: "experience · Acme", description: "Backend engineer",
       blocks: [ "Built APIs", "Led a team of five" ] } ]
  end

  def suggestion(overrides = {})
    { "section_id" => 1, "field" => "content", "kind" => "rewrite", "quote" => "Built APIs",
      "replacement" => "Built REST APIs", "reason" => "More specific" }.merge(overrides)
  end

  def run(suggestions, extra = {})
    described_class.call({ "suggestions" => suggestions }.merge(extra), sections)
  end

  it "keeps a rewrite whose quote is in its section" do
    result = run([ suggestion("quote" => "Built  APIs"), suggestion("quote" => "Led a team") ])

    expect(result[:suggestions].map { |s| s[:position] }).to eq([ 0, 1 ])
    expect(result[:suggestions].first).to include(curriculum_section_id: 1, kind: "rewrite", field: "content")
  end

  it "drops suggestions for unknown sections" do
    expect(run([ suggestion("section_id" => 999_999) ])[:suggestions]).to be_empty
  end

  it "drops a rewrite whose quote isn't in the section" do
    expect(run([ suggestion("quote" => "Never written") ])[:suggestions]).to be_empty
  end

  it "description suggestions match the section description" do
    kept = suggestion("field" => "description", "quote" => "Backend engineer", "replacement" => "Backend dev")
    dropped = suggestion("field" => "description", "quote" => "Built APIs")

    expect(run([ kept, dropped ])[:suggestions].size).to eq(1)
  end

  it "notes keep no replacement" do
    result = run([ suggestion("kind" => "note", "replacement" => "x") ])
    expect(result[:suggestions].first[:replacement]).to be_nil

    expect(run([ suggestion("kind" => "note", "quote" => "nope") ])[:suggestions]).to be_empty
  end

  it "strips the bullet and summary labels from a quote" do
    bullet = suggestion("quote" => "- Built APIs")
    summary = suggestion("field" => "description", "quote" => "Summary: Backend engineer", "replacement" => "Backend dev")

    quotes = run([ bullet, summary ])[:suggestions].map { |s| s[:quote] }

    expect(quotes).to eq([ "Built APIs", "Backend engineer" ])
  end

  it "drops a replacement longer than the limit" do
    sections.first[:blocks] = [ "0123456789" ]
    long = run([ suggestion("quote" => "0123456789", "replacement" => "a" * 60) ])
    ok = run([ suggestion("quote" => "0123456789", "replacement" => "a" * 52) ])

    expect(long[:suggestions]).to be_empty
    expect(ok[:suggestions].size).to eq(1)
  end

  it "cuts long report text at a word boundary" do
    summary = ([ "word" ] * 60).join(" ")
    result = run([], "summary" => summary)

    expect(result[:report][:summary].length).to be <= 241
    expect(result[:report][:summary]).to end_with("…")
  end

  it "caps list lengths" do
    result = run(Array.new(15) { suggestion },
                 "requirements" => Array.new(10) { { "text" => "r", "covered" => "yes" } },
                 "gaps" => Array.new(6) { "g" })

    expect(result[:report][:requirements].size).to eq(8)
    expect(result[:report][:gaps].size).to eq(4)
    expect(result[:suggestions].size).to eq(12)
  end

  it "keeps HTML in replacement as literal text" do
    result = run([ suggestion("replacement" => "<script>x</script>", "quote" => "Led a team of five") ])

    expect(result[:suggestions].first[:replacement]).to eq("<script>x</script>")
  end

  it "unknown enum values fall back" do
    result = run([], "fit" => "great", "requirements" => [ { "text" => "r", "covered" => "maybe" } ])

    expect(result[:report][:fit]).to eq("partial")
    expect(result[:report][:requirements].first[:covered]).to eq("partly")
  end

  it "tolerates missing keys" do
    result = described_class.call({}, sections)

    expect(result[:report]).to include(fit: "partial", summary: "", requirements: [], gaps: [])
    expect(result[:suggestions]).to eq([])
  end
end
