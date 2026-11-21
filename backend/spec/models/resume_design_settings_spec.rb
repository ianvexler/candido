require "rails_helper"

RSpec.describe ResumeDesignSettings do
  it "keeps valid design keys, stringified" do
    expect(described_class.normalize!(font: "lora", size: "large", heading_style: "accent_bar"))
      .to eq("font" => "lora", "size" => "large", "heading_style" => "accent_bar")
  end

  it "accepts a hex accent and lowercases it" do
    expect(described_class.normalize!("accent" => "#1F4E79")).to eq("accent" => "#1f4e79")
  end

  {
    { accent: "red" } => /Accent/,
    { font: "comic_sans" } => /Font/,
    { unknown: 1 } => /unknown/
  }.each do |raw, message|
    it "rejects #{raw.inspect}" do
      expect { described_class.normalize!(raw) }.to raise_error(ApiError, message) { |error| expect(error.status).to eq(:unprocessable_content) }
    end
  end

  it "keeps fine-tune numbers on their step, from numbers or numeric strings" do
    expect(described_class.normalize!("body_size" => 11, "line_height" => "1.4", "margin_x" => 20.0))
      .to eq("body_size" => 11.0, "line_height" => 1.4, "margin_x" => 20.0)
  end

  {
    { body_size: 13 } => /Body size must be between 9 and 12/,
    { body_size: 10.3 } => /Body size must be in steps of 0.5/,
    { line_height: 1.33 } => /Line height must be in steps of 0.05/,
    { name_size: "big" } => /Name size must be a number/,
    { section_gap: { pt: 4 } } => /Section gap must be a number/,
    { margin_y: true } => /Margin y must be a number/
  }.each do |raw, message|
    it "rejects #{raw.inspect}" do
      expect { described_class.normalize!(raw) }.to raise_error(ApiError, message)
    end
  end

  it "has a default within range for every fine-tune value" do
    described_class::RANGES.each do |key, (min, max, _step)|
      expect(described_class::DEFAULTS[key]).to be_between(min, max)
    end
  end

  it "has a default for every key" do
    expect(described_class::DEFAULTS.keys).to match_array(described_class::KEYS)
  end
end
