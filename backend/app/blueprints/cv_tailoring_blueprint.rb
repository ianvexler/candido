class CvTailoringBlueprint < ApplicationBlueprint
  identifier :id
  fields :status, :error_message, :job_title, :company, :job_board_entry_id, :used_posting, :report, :created_at

  association :suggestions, blueprint: CvTailoringSuggestionBlueprint
end
