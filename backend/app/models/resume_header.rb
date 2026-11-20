# Name and contact details shown at the top of a resume.
#
# A user's profile holds every field. A resume's header holds only the fields
# it overrides; anything missing falls back to the profile.
module ResumeHeader
  TEXT_FIELDS = %w[name headline email phone location].freeze
  MAX_TEXT_LENGTH = 200
  MAX_LINKS = 10
  ALLOWED_SCHEMES = %w[http https mailto].freeze

  module_function

  # Cleans a full profile: every text field is present (possibly ""), links is an array.
  def normalize_profile(raw)
    raw = stringify(raw)
    TEXT_FIELDS.index_with { |field| clean_text(raw[field], field) }
      .merge("links" => clean_links(raw["links"]))
  end

  # Cleans resume overrides: blank text and missing/null links mean "use the profile".
  def normalize_overrides(raw)
    raw = stringify(raw)
    overrides = TEXT_FIELDS.each_with_object({}) do |field, result|
      value = clean_text(raw[field], field)
      result[field] = value if value.present?
    end
    overrides["links"] = clean_links(raw["links"]) unless raw["links"].nil?
    overrides
  end

  # The user's profile, with name and email defaulting to their account until set.
  def profile_for(user)
    stored = stringify(user.resume_profile)
    normalize_profile(stored).tap do |profile|
      profile["name"] = user.name.to_s if !stored.key?("name")
      profile["email"] = user.email.to_s if !stored.key?("email")
    end
  end

  def resolve(profile, overrides)
    profile.merge(stringify(overrides))
  end

  def stringify(raw)
    hash = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw.to_h
    hash.deep_stringify_keys
  end

  def clean_text(value, field)
    text = value.to_s.squish
    if text.length > MAX_TEXT_LENGTH
      raise ApiError.new("#{field.humanize} is too long (#{MAX_TEXT_LENGTH} characters max)", status: :unprocessable_content)
    end

    text
  end

  def clean_links(value)
    links = Array(value).map { |link| stringify(link) }
    if links.size > MAX_LINKS
      raise ApiError.new("A header can have at most #{MAX_LINKS} links", status: :unprocessable_content)
    end

    links.filter_map do |link|
      url = clean_text(link["url"], "link")
      next if url.blank?

      { "label" => clean_text(link["label"], "link label"), "url" => clean_url(url) }
    end
  end

  # Adds https:// to bare domains; rejects anything but http(s) and mailto.
  def clean_url(url)
    scheme = url[/\A([a-z][a-z0-9+.-]*):/i, 1]
    return "https://#{url}" if scheme.nil?
    return url if ALLOWED_SCHEMES.include?(scheme.downcase)

    raise ApiError.new("Links must start with http://, https:// or mailto:", status: :unprocessable_content)
  end
end
