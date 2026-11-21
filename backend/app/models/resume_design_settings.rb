# The look of a resume: which keys a design may set and the values allowed.
# Stored in curriculums.styles (alongside "paper") and in saved designs.
module ResumeDesignSettings
  CHOICES = {
    "font" => %w[source_sans plex_sans source_serif lora],
    "size" => %w[medium small large],
    "spacing" => %w[normal compact relaxed],
    "heading_style" => %w[caps_rule bold accent_bar],
    "date_position" => %w[right below]
  }.freeze
  ACCENT = /\A#\h{6}\z/
  KEYS = (CHOICES.keys + [ "accent" ]).freeze
  # The first choice of each key, and the accent, match the original Classic look.
  DEFAULTS = CHOICES.transform_values(&:first).merge("accent" => "#1a1a1a").freeze

  module_function

  # Returns only the design keys given, stringified; raises a 422 ApiError otherwise.
  def normalize!(raw)
    raw = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw.to_h
    raw.each_with_object({}) do |(key, value), settings|
      key = key.to_s
      settings[key] = clean(key, value.to_s.strip)
    end
  end

  def clean(key, value)
    if key == "accent"
      return value.downcase if ACCENT.match?(value)

      invalid!("Accent must be a colour like #1a1a1a")
    elsif CHOICES.key?(key)
      return value if CHOICES[key].include?(value)

      invalid!("#{key.humanize} must be one of #{CHOICES[key].join(', ')}")
    else
      invalid!("Unknown design setting: #{key}")
    end
  end

  def invalid!(message)
    raise ApiError.new(message, status: :unprocessable_content)
  end
end
