FactoryBot.define do
  factory :cv_tailoring_suggestion do
    cv_tailoring
    curriculum_section do
      cv_tailoring.curriculum.curriculum_sections.create!(section_type: "experience", entries: [ { title: "Work", content: "<p>Led a team</p>" } ])
    end
    kind { "rewrite" }
    field { "content" }
    quote { "Led a team" }
    replacement { "Led a team of five engineers" }
    reason { "Quantifies the scope" }
    status { "pending" }
    position { 0 }
  end
end
