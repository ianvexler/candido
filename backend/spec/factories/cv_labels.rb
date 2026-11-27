FactoryBot.define do
  factory :cv_label do
    user
    sequence(:name) { |n| "Purpose #{n}" }
  end
end
