FactoryBot.define do
  factory :resume_design do
    user
    sequence(:name) { |n| "Design #{n}" }
    settings { { "font" => "lora", "accent" => "#1f4e79" } }
  end
end
