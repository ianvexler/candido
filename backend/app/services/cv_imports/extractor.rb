module CvImports
  # Reads a CV with Claude and returns its contents in a fixed JSON shape.
  # This is the only place that knows which model or provider is used;
  # CvImports::Draft turns the reply into something the app can save.
  class Extractor
    PDF = "application/pdf".freeze
    DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document".freeze
    MAX_TOKENS = 16_000
    BETAS = [ "server-side-fallback-2026-07-01" ].freeze

    BUSY = "The CV reader is busy. Try again in a minute.".freeze
    UNREADABLE = "We couldn't read this CV.".freeze

    STRING = { type: "string" }.freeze

    def self.object(properties)
      { type: "object", properties: properties, required: properties.keys.map(&:to_s), additionalProperties: false }
    end

    SCHEMA = object(
      header: object(
        name: STRING, headline: STRING, email: STRING, phone: STRING, location: STRING,
        links: { type: "array", items: object(label: STRING, url: STRING) }
      ),
      sections: {
        type: "array",
        items: object(
          section_type: STRING, title: STRING, role: STRING, organization: STRING, location: STRING,
          start_month: STRING, end_month: STRING, current: { type: "boolean" }, summary: STRING,
          blocks: {
            type: "array",
            items: object(kind: { type: "string", enum: %w[bullet paragraph heading] }, text: STRING)
          }
        )
      }
    )

    SYSTEM_PROMPT = <<~PROMPT.freeze
      You read a person's CV and copy its contents into a structured resume.

      Rules:
      - Copy text faithfully. Never invent, embellish, or reword experience. Fix only obvious spacing or line-break artefacts.
      - header: the person's name, their headline or current title if the CV states one, and their contact details. links are URLs the CV lists (portfolio, GitHub, LinkedIn); use the visible label, or "" if none.
      - Make one section per job, per degree or course, and per project. Skills, summary/profile, languages, certifications, awards and similar each get their own section.
      - section_type is the CV's heading for that part, in title case (for example "Experience", "Education", "Skills", "Projects").
      - For jobs and education, title is the organisation or school name, role is the job title or degree, organization repeats the organisation or school, and location is where it was. For other sections, title is a short name for the section and role, organization and location are "".
      - start_month and end_month are "YYYY-MM". Use "" when the CV gives no date, and only the year's first month ("YYYY-01") when it gives a year alone. Set current to true when the entry is ongoing ("present", "now", "current"), with end_month "".
      - summary is a one-line description that sits under the title on the CV, if there is one; otherwise "".
      - blocks hold the body text in order: "bullet" for list items, "paragraph" for prose, "heading" for sub-headings inside a section. Don't repeat the title, role, dates or summary in blocks.
      - Use "" for anything the CV doesn't state. If the file isn't a CV, return an empty header and no sections.
    PROMPT

    def self.configured?
      ENV["ANTHROPIC_API_KEY"].present?
    end

    # Fails well inside the upload dialog's 3-minute wait, so the user never
    # abandons an import that later finishes (and is billed) out of sight.
    CLIENT_OPTIONS = { timeout: 150, max_retries: 1 }.freeze

    def initialize(client: Anthropic::Client.new(**CLIENT_OPTIONS))
      @client = client
    end

    # Returns the model's reply as a Hash matching SCHEMA.
    def call(data:, media_type:)
      message = @client.beta.messages.create(
        model: ENV.fetch("CV_IMPORT_MODEL", "claude-opus-5-5"),
        max_tokens: MAX_TOKENS,
        betas: BETAS,
        fallbacks: :default,
        output_config: { effort: :low, format_: { type: :json_schema, schema: SCHEMA } },
        system_: SYSTEM_PROMPT,
        messages: [ { role: "user", content: input_blocks(data, media_type) } ]
      )
      parse(message)
    rescue Anthropic::Errors::RateLimitError, Anthropic::Errors::InternalServerError, Anthropic::Errors::APIConnectionError => error
      log_api_error(error)
      raise ExtractionError, BUSY
    rescue Anthropic::Errors::BadRequestError => error
      log_api_error(error)
      raise ExtractionError, "We couldn't read this file. It may be password-protected or too long."
    rescue Anthropic::Errors::APIStatusError => error
      log_api_error(error)
      raise ExtractionError, "We couldn't read this CV. Try again later."
    end

    private

    # Enough to diagnose a bad key, model name or beta header; never the CV.
    def log_api_error(error)
      status = error.respond_to?(:status) ? error.status : nil
      headers = error.respond_to?(:headers) ? error.headers : nil
      request_id = headers.respond_to?(:[]) ? headers["request-id"] : nil
      Rails.logger.error("CV import: Claude API #{error.class.name.demodulize} status=#{status.inspect} request_id=#{request_id.inspect}")
    end

    def input_blocks(data, media_type)
      instruction = { type: "text", text: "Read this CV into the resume structure." }
      if media_type == DOCX
        [ { type: "text", text: "CV text:\n\n#{DocxText.call(data)}" }, instruction ]
      else
        [ { type: "document", source: { type: "base64", media_type: PDF, data: Base64.strict_encode64(data) } }, instruction ]
      end
    end

    def parse(message)
      case message.stop_reason
      when :refusal then raise ExtractionError, UNREADABLE
      when :max_tokens then raise ExtractionError, "This CV is too long to read in one go."
      end

      text = message.content.find { |block| block.type == :text }&.text
      JSON.parse(text.to_s)
    rescue JSON::ParserError
      raise ExtractionError, UNREADABLE
    end
  end
end
