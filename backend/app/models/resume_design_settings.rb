# The look of a resume: which keys a design may set and the values allowed.
# Stored in curriculums.styles (alongside "paper") and in saved designs.
module ResumeDesignSettings
  CHOICES = {
    "font" => %w[source_sans plex_sans source_serif lora],
    "size" => %w[medium small large],
    "spacing" => %w[normal compact relaxed],
    "heading_case" => %w[caps as_typed],
    "heading_rule" => %w[under bar none],
    # Older designs combined case and line in one setting; the client maps it
    # to heading_case and heading_rule when those aren't set.
    "heading_style" => %w[caps_rule bold accent_bar],
    "date_position" => %w[right below]
  }.freeze
  ACCENT = /\A#\h{6}\z/
  # Fine-tune values: [min, max, step]. Sizes and gaps are in points, margins
  # in millimetres. The size and spacing presets set these on the client;
  # a resume without them falls back to its preset's values.
  RANGES = {
    "body_size" => [ 9, 12, 0.5 ],
    "name_size" => [ 16, 30, 0.5 ],
    "heading_size" => [ 8, 14, 0.5 ],
    "title_size" => [ 10, 14, 0.5 ],
    "meta_size" => [ 8, 12, 0.5 ],
    "line_height" => [ 1.15, 1.6, 0.05 ],
    "section_gap" => [ 4, 28, 1 ],
    "heading_gap" => [ 0, 12, 0.5 ],
    "paragraph_gap" => [ 0, 8, 0.5 ],
    "margin_y" => [ 10, 25, 1 ],
    "margin_x" => [ 10, 25, 1 ]
  }.freeze
  KEYS = (CHOICES.keys + [ "accent" ] + RANGES.keys).freeze
  # The first choice of each key, the accent and these values match the
  # original Classic look (the medium size and normal spacing presets).
  DEFAULTS = CHOICES.transform_values(&:first).merge(
    "accent" => "#1a1a1a",
    "body_size" => 10.5, "name_size" => 22, "heading_size" => 9, "title_size" => 11.5, "meta_size" => 10.5,
    "line_height" => 1.35, "section_gap" => 14, "heading_gap" => 6, "paragraph_gap" => 3,
    "margin_y" => 16, "margin_x" => 18
  ).freeze

  module_function

  # Returns only the design keys given, stringified; raises a 422 ApiError otherwise.
  def normalize!(raw)
    raw = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw.to_h
    raw.each_with_object({}) do |(key, value), settings|
      key = key.to_s
      settings[key] = RANGES.key?(key) ? clean_number(key, value) : clean(key, value.to_s.strip)
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

  def clean_number(key, value)
    min, max, step = RANGES[key]
    number = Float(value, exception: false) if value.is_a?(Numeric) || value.is_a?(String)
    invalid!("#{key.humanize} must be a number") if number.nil? || !number.finite?
    invalid!("#{key.humanize} must be between #{min} and #{max}") unless number.between?(min, max)

    steps = ((number - min) / step).round
    invalid!("#{key.humanize} must be in steps of #{step}") unless (min + steps * step - number).abs < 1e-6

    (min + steps * step).round(2)
  end

  def invalid!(message)
    raise ApiError.new(message, status: :unprocessable_content)
  end
end
