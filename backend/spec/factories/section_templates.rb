FactoryBot.define do
  factory :section_template do
    user
    title { "Software Engineer" }
    section_type { "Experience" }
    description { "Most recent engineering role" }
  end
end
