FactoryBot.define do
  # A section with one entry, built from the given fields.
  factory :section_template do
    transient do
      title { "Software Engineer" }
      description { "Most recent engineering role" }
      content { "" }
      details { {} }
    end
    user
    section_type { "Experience" }
    entries { [ { title: title, description: description, content: content, **details } ] }
  end
end
