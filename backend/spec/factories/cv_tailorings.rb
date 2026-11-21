FactoryBot.define do
  factory :cv_tailoring do
    user
    curriculum { association :curriculum, user: user }
    job_title { "Software Engineer" }
    company { "Acme" }
    status { "pending" }
  end
end
