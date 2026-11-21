require "rails_helper"

RSpec.describe CvTailorings::Reviewer do
  # Stands in for Anthropic::Client: records every request and returns canned replies in order.
  class ReviewerFakeClient
    Block = Struct.new(:type, :text, :content, keyword_init: true)
    Reply = Struct.new(:stop_reason, :content, keyword_init: true)
    Result = Struct.new(:type, keyword_init: true)

    attr_reader :calls

    def initialize(replies: [], error: nil)
      @replies = replies.dup
      @error = error
      @calls = []
    end

    def params = @calls.last

    def beta = self
    def messages = self

    def create(**params)
      @calls << Marshal.load(Marshal.dump(params.except(:messages))).merge(messages: params[:messages].dup)
      raise @error if @error

      @replies.size > 1 ? @replies.shift : @replies.first
    end

    def self.reply(text, stop_reason: :end_turn, extra: [])
      Reply.new(stop_reason: stop_reason, content: [ Block.new(type: :thinking) ] + extra + [ Block.new(type: :text, text: text) ])
    end

    def self.fetch_block(result_type)
      Block.new(type: :web_fetch_tool_result, content: Result.new(type: result_type))
    end
  end

  let(:output) do
    { "fit" => "partial", "summary" => "Good.", "requirements" => [], "gaps" => [], "suggestions" => [] }
  end
  let(:tag) { Struct.new(:name).new("Remote") }
  let(:job) do
    Struct.new(:title, :company, :location, :description, :url, :job_board_tags, keyword_init: true).new(
      title: "Backend Engineer", company: "Acme", location: "Lisbon", description: "Build APIs.",
      url: "", job_board_tags: [ tag ]
    )
  end
  let(:cv_text) { "[section 7] Experience\nBuilt APIs" }
  let(:client) { ReviewerFakeClient.new(replies: [ ReviewerFakeClient.reply(output.to_json) ]) }

  def review(using: client, declined_quotes: [])
    described_class.new(client: using).call(job: job, cv_text: cv_text, declined_quotes: declined_quotes)
  end

  def user_text(params = client.params) = params[:messages].first[:content]

  def api_error(klass)
    klass.new(url: URI("https://api.anthropic.com/v1/messages"), status: 429, headers: {}, body: nil, request: nil, response: nil)
  end

  it "sends the job and CV with structured output, medium effort and fallbacks" do
    review

    params = client.params
    expect(params[:output_config][:effort]).to eq(:medium)
    expect(params[:output_config][:format_]).to eq(type: :json_schema, schema: described_class::SCHEMA)
    expect(params[:betas]).to include("server-side-fallback-2026-07-01")
    expect(params[:fallbacks]).to eq(:default)
    expect(params[:max_tokens]).to eq(16_000)
    expect(params[:system_]).to eq(described_class::SYSTEM_PROMPT)
    text = user_text
    expect(text).to include("Backend Engineer", "Acme", "Remote", "[section 7] Experience\nBuilt APIs")
  end

  it "wraps the description and CV in tags" do
    review

    expect(user_text).to include("<job_description>\nBuild APIs.\n</job_description>", "<cv>\n[section 7] Experience\nBuilt APIs\n</cv>")
    expect(described_class::SYSTEM_PROMPT).to include("<job_description>", "plus 40 characters")
  end

  it "leaves out fallbacks for a model that doesn't support them" do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("CV_TAILOR_MODEL", anything).and_return("claude-haiku-5-5")

    review

    expect(client.params[:model]).to eq("claude-haiku-5-5")
    expect(client.params).not_to have_key(:fallbacks)
    expect(client.params).not_to have_key(:betas)
  end

  it "uses a schema that forbids extra properties on every object" do
    objects = []
    walk = lambda do |node|
      next unless node.is_a?(Hash)
      objects << node if node[:type] == "object"
      node.each_value { |value| value.is_a?(Array) ? value.each { |v| walk.call(v) } : walk.call(value) }
    end
    walk.call(described_class::SCHEMA)

    expect(objects.size).to eq(3)
    expect(objects).to all(include(additionalProperties: false))
    objects.each { |object| expect(object[:required]).to match_array(object[:properties].keys.map(&:to_s)) }
  end

  it "adds web fetch restricted to the posting's domain" do
    job.url = "https://jobs.acme.com/123"

    review

    expect(client.params[:tools]).to eq([ {
      type: "web_fetch_20260209", name: "web_fetch", max_uses: 1, allowed_domains: [ "jobs.acme.com" ],
      citations: { enabled: false }, max_content_tokens: 20_000
    } ])
    expect(user_text).to include("https://jobs.acme.com/123")
  end

  [ "", "javascript:alert(1)", "not a url", nil ].each do |url|
    it "skips web fetch for the URL #{url.inspect}" do
      job.url = url

      review

      expect(client.params).not_to have_key(:tools)
    end
  end

  it "reports whether the posting was read" do
    job.url = "https://jobs.acme.com/123"
    read = ReviewerFakeClient.new(replies: [ ReviewerFakeClient.reply(output.to_json, extra: [ ReviewerFakeClient.fetch_block(:web_fetch_result) ]) ])
    failed = ReviewerFakeClient.new(replies: [ ReviewerFakeClient.reply(output.to_json, extra: [ ReviewerFakeClient.fetch_block(:web_fetch_tool_result_error) ]) ])

    expect(review(using: read)).to eq(output: output, used_posting: true)
    expect(review(using: failed)).to eq(output: output, used_posting: false)
    expect(review).to eq(output: output, used_posting: false)
  end

  it "continues after pause_turn" do
    job.url = "https://jobs.acme.com/123"
    first = ReviewerFakeClient.reply("", stop_reason: :pause_turn, extra: [ ReviewerFakeClient.fetch_block(:web_fetch_result) ])
    second = ReviewerFakeClient.reply(output.to_json)
    paused = ReviewerFakeClient.new(replies: [ first, second ])

    result = review(using: paused)

    expect(paused.calls.size).to eq(2)
    expect(paused.calls.last[:messages].last).to eq(role: "assistant", content: first.content)
    expect(paused.calls.last[:messages].size).to eq(2)
    expect(result).to eq(output: output, used_posting: true)
  end

  it "gives up after three pauses" do
    pause = ReviewerFakeClient.reply("", stop_reason: :pause_turn)
    stuck = ReviewerFakeClient.new(replies: [ pause ])

    expect { review(using: stuck) }.to raise_error(CvTailorings::ReviewError, "The CV reviewer is busy. Try again in a minute.")
    expect(stuck.calls.size).to eq(4)
  end

  {
    refusal: "We couldn't review this CV.",
    max_tokens: "This CV is too long to review in one go."
  }.each do |stop_reason, message|
    it "explains a #{stop_reason} stop" do
      stopped = ReviewerFakeClient.new(replies: [ ReviewerFakeClient.reply("{}", stop_reason: stop_reason) ])

      expect { review(using: stopped) }.to raise_error(CvTailorings::ReviewError, message)
    end
  end

  it "explains a reply that isn't JSON" do
    broken = ReviewerFakeClient.new(replies: [ ReviewerFakeClient.reply("not json") ])

    expect { review(using: broken) }.to raise_error(CvTailorings::ReviewError, "We couldn't review this CV.")
  end

  it "explains a reply that isn't a JSON object" do
    broken = ReviewerFakeClient.new(replies: [ ReviewerFakeClient.reply("[1]") ])

    expect { review(using: broken) }.to raise_error(CvTailorings::ReviewError, "We couldn't review this CV.")
  end

  [ Anthropic::Errors::RateLimitError, Anthropic::Errors::InternalServerError ].each do |klass|
    it "maps #{klass.name.demodulize} to the busy message" do
      busy = ReviewerFakeClient.new(error: api_error(klass))

      expect { review(using: busy) }.to raise_error(CvTailorings::ReviewError, "The CV reviewer is busy. Try again in a minute.")
    end
  end

  it "maps connection failures to the busy message" do
    offline = ReviewerFakeClient.new(error: Anthropic::Errors::APIConnectionError.new(url: URI("https://api.anthropic.com")))

    expect { review(using: offline) }.to raise_error(CvTailorings::ReviewError, "The CV reviewer is busy. Try again in a minute.")
  end

  it "reports other API errors generically and logs without the CV" do
    allow(Rails.logger).to receive(:error)
    bad = ReviewerFakeClient.new(error: api_error(Anthropic::Errors::AuthenticationError))

    expect { review(using: bad) }.to raise_error(CvTailorings::ReviewError, "We couldn't review this CV. Try again later.")
    expect(Rails.logger).to have_received(:error).with(a_string_including("AuthenticationError", "429")) do |line|
      expect(line).not_to include("Built APIs")
    end
  end

  it "passes declined quotes to the model" do
    review(declined_quotes: [ "Built APIs" ])

    expect(user_text).to match(/Already declined.*Built APIs/)
  end

  it "builds a client with the shared options" do
    allow(Anthropic::Client).to receive(:new).and_return(client)

    described_class.new

    expect(Anthropic::Client).to have_received(:new).with(**CvImports::Extractor::CLIENT_OPTIONS)
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
