FactoryBot.define do
  factory :cv_import do
    user
    filename { "cv.pdf" }
    media_type { "application/pdf" }
    status { "pending" }
    source_data { Base64.strict_encode64("%PDF-1.4 fake") }
  end
end
