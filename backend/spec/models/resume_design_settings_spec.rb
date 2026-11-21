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

  it "has a default for every key" do
    expect(described_class::DEFAULTS.keys).to match_array(described_class::KEYS)
  end
end
