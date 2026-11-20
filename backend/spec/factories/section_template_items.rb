FactoryBot.define do
  factory :section_template_item do
    section_template
    kind { "bullet" }
    sequence(:body) { |n| "Shipped feature #{n}" }
    sequence(:position) { |n| n - 1 }
    hidden { false }
  end
end
