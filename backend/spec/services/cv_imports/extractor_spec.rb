require "rails_helper"

RSpec.describe CvImports::Extractor do
  # Stands in for Anthropic::Client: records the request and returns a canned reply.
  class FakeClient
    Block = Struct.new(:type, :text, keyword_init: true)
    Reply = Struct.new(:stop_reason, :content, keyword_init: true)

    attr_reader :params

    def initialize(reply: nil, error: nil)
      @reply = reply
      @error = error
    end

    def beta = self
    def messages = self

    def create(**params)
      @params = params
      raise @error if @error

      @reply
    end

    def self.reply(text, stop_reason: :end_turn)
      Reply.new(stop_reason: stop_reason, content: [ Block.new(type: :thinking, text: nil), Block.new(type: :text, text: text) ])
    end
  end

  let(:output) { { "header" => { "name" => "Alex" }, "sections" => [] } }
  let(:client) { FakeClient.new(reply: FakeClient.reply(output.to_json)) }
  let(:pdf) { "%PDF-1.4 fake cv" }

  def extract(data: pdf, media_type: "application/pdf", using: client)
    described_class.new(client: using).call(data: data, media_type: media_type)
  end

  def api_error(klass)
    klass.new(url: URI("https://api.anthropic.com/v1/messages"), status: 429, headers: {}, body: nil, request: nil, response: nil)
  end

  it "sends a PDF as a document with structured output, low effort and fallbacks" do
    extract

    params = client.params
    document = params[:messages].first[:content].first
    expect(document).to eq(type: "document", source: { type: "base64", media_type: "application/pdf", data: Base64.strict_encode64(pdf) })
    expect(params[:fallbacks]).to eq(:default)
    expect(params[:betas]).to include("server-side-fallback-2026-07-01")
    expect(params[:output_config][:effort]).to eq(:low)
    expect(params[:output_config][:format_][:type]).to eq(:json_schema)
  end

  it "uses a schema that forbids extra properties on every object" do
    extract

    objects = []
    walk = lambda do |node|
      next unless node.is_a?(Hash)
      objects << node if node[:type] == "object"
      node.each_value { |value| value.is_a?(Array) ? value.each { |v| walk.call(v) } : walk.call(value) }
    end
    walk.call(client.params[:output_config][:format_][:schema])

    expect(objects.size).to be >= 4
    expect(objects).to all(include(additionalProperties: false))
    objects.each { |object| expect(object[:required]).to match_array(object[:properties].keys.map(&:to_s)) }
  end

  it "sends a Word file as extracted text" do
    allow(CvImports::DocxText).to receive(:call).and_return("Alex Rivera\nEngineer")

    extract(data: "docx-bytes", media_type: described_class::DOCX)

    content = client.params[:messages].first[:content]
    expect(content.map { |block| block[:type] }).to eq([ "text", "text" ])
    expect(content.first[:text]).to include("Alex Rivera\nEngineer")
  end

  it "returns the parsed reply" do
    expect(extract).to eq(output)
  end

  {
    refusal: "We couldn't read this CV.",
    max_tokens: "This CV is too long to read in one go."
  }.each do |stop_reason, message|
    it "explains a #{stop_reason} stop" do
      stopped = FakeClient.new(reply: FakeClient.reply("{}", stop_reason: stop_reason))

      expect { extract(using: stopped) }.to raise_error(CvImports::ExtractionError, message)
    end
  end

  it "explains a reply that isn't JSON" do
    broken = FakeClient.new(reply: FakeClient.reply("not json"))

    expect { extract(using: broken) }.to raise_error(CvImports::ExtractionError, "We couldn't read this CV.")
  end

  [ Anthropic::Errors::RateLimitError, Anthropic::Errors::InternalServerError ].each do |klass|
    it "asks to retry later on #{klass.name.demodulize}" do
      busy = FakeClient.new(error: api_error(klass))

      expect { extract(using: busy) }.to raise_error(CvImports::ExtractionError, "The CV reader is busy. Try again in a minute.")
    end
  end

  it "asks to retry later when the connection fails" do
    offline = FakeClient.new(error: Anthropic::Errors::APIConnectionError.new(url: URI("https://api.anthropic.com")))

    expect { extract(using: offline) }.to raise_error(CvImports::ExtractionError, "The CV reader is busy. Try again in a minute.")
  end

  it "reports other API errors generically" do
    bad = FakeClient.new(error: api_error(Anthropic::Errors::BadRequestError))

    expect { extract(using: bad) }.to raise_error(CvImports::ExtractionError, "We couldn't read this CV. Try again later.")
  end

  describe ".configured?" do
    it "depends on the API key" do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("ANTHROPIC_API_KEY").and_return("")
      expect(described_class.configured?).to be(false)

      allow(ENV).to receive(:[]).with("ANTHROPIC_API_KEY").and_return("sk-test")
      expect(described_class.configured?).to be(true)
    end
  end
end
