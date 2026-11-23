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

  it "keeps one suggestion per piece of text, preferring a rewrite over a note" do
    note = suggestion("kind" => "note", "replacement" => "", "reason" => "Add how many users, if you know it")
    rewrite = suggestion("quote" => "Built APIs", "replacement" => "Built REST APIs")
    overlapping = suggestion("quote" => "APIs", "replacement" => "REST APIs")
    other_block = suggestion("quote" => "Led a team", "replacement" => "Led a team of five engineers")
    summary_note = suggestion("kind" => "note", "field" => "description", "quote" => "Backend engineer", "replacement" => "")

    kept = run([ note, rewrite, overlapping, other_block, summary_note ])[:suggestions]

    expect(kept.map { |s| [ s[:kind], s[:quote] ] })
      .to eq([ [ "rewrite", "Built APIs" ], [ "rewrite", "Led a team" ], [ "note", "Backend engineer" ] ])
    expect(kept.map { |s| s[:position] }).to eq([ 0, 1, 2 ])
  end

  describe "missing sections" do
    def missing(items, existing)
      described_class.call({ "missing_sections" => items }, sections, existing_sections: existing)[:report][:missing_sections]
    end

    it "keeps an essential section the CV has none of, with a trimmed reason" do
      result = missing([ { "section" => "Education", "reason" => "The role asks for a degree. " * 10 } ], [ [ "Experience", "Acme" ] ])

      expect(result.size).to eq(1)
      expect(result.first[:section]).to eq("Education")
      expect(result.first[:reason].length).to be <= described_class::MAX_GAP + 1
    end

    it "drops sections the CV already has, under any similar heading, even hidden ones" do
      items = [ { "section" => "Experience", "reason" => "x" }, { "section" => "Education", "reason" => "x" },
                { "section" => "Skills", "reason" => "x" } ]

      expect(missing(items, [ [ "Work history", "Acme" ], [ "Qualifications", "BSc" ], [ "custom", "Technical skills" ] ])).to be_empty
    end

    it "drops unknown sections, duplicates and blank reasons, and keeps at most two" do
      items = [ { "section" => "Hobbies", "reason" => "x" }, { "section" => "Education", "reason" => "" },
                { "section" => "Education", "reason" => "a" }, { "section" => "Education", "reason" => "b" },
                { "section" => "Skills", "reason" => "c" }, { "section" => "Experience", "reason" => "d" } ]

      expect(missing(items, []).map { |item| item[:section] }).to eq(%w[Education Skills])
    end

    it "doesn't take an employer's name or part of a word for a section" do
      items = [ { "section" => "Education", "reason" => "x" }, { "section" => "Skills", "reason" => "x" } ]
      existing = [ [ "Experience", "University of Leeds" ], [ "Experience", "Stack Overflow" ] ]

      expect(missing(items, existing).map { |item| item[:section] }).to eq(%w[Education Skills])
      expect(missing([ { "section" => "Experience", "reason" => "x" } ], [ [ "custom", "International awards" ] ]).size).to eq(1)
    end

    it "is empty when the model sends none" do
      expect(described_class.call({}, sections)[:report][:missing_sections]).to eq([])
    end
  end

  it "lets a rewrite replace every note it overlaps, and keeps the same word in another block" do
    blocks = [ "Built APIs", "Documented internal APIs" ]
    notes = %w[Built APIs].map { |quote| suggestion("kind" => "note", "quote" => quote, "replacement" => "") }
    rewrite = suggestion("quote" => "Built APIs", "replacement" => "Built REST APIs")
    elsewhere = suggestion("quote" => "Documented internal APIs", "replacement" => "Documented REST APIs")

    kept = described_class.call({ "suggestions" => [ *notes, rewrite, elsewhere ] },
                                [ { id: 1, heading: "", description: "", blocks: blocks } ])[:suggestions]

    expect(kept.map { |s| s[:quote] }).to eq([ "Built APIs", "Documented internal APIs" ])
    both = described_class.call({ "suggestions" => [ suggestion("kind" => "note", "quote" => "APIs", "replacement" => ""), elsewhere ] },
                                [ { id: 1, heading: "", description: "", blocks: blocks } ])[:suggestions]
    expect(both.size).to eq(2)
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
    blocks = Array.new(15) { |i| "Shipped feature #{i}." }
    many = Array.new(15) { |i| suggestion("quote" => blocks[i], "replacement" => "Launched feature #{i}.") }
    result = described_class.call(
      { "suggestions" => many, "requirements" => Array.new(10) { { "text" => "r", "covered" => "yes" } },
        "gaps" => Array.new(6) { "g" } },
      [ { id: 1, heading: "experience · Acme", description: "", blocks: blocks } ]
    )

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
