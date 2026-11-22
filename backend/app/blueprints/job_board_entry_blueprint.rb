class JobBoardEntryBlueprint < ApplicationBlueprint
  identifier :id
  fields :number, :title, :company, :location, :description, :salary, :url, :status,
    :created_at, :updated_at, :closing_date, :cv_text, :cv_key, :cv_filename,
    :cover_letter_text, :cover_letter_key, :cover_letter_filename

  association :job_board_tags, blueprint: JobBoardTagBlueprint

  # Fit comes from the preloaded runs, so listing jobs costs no query per job.
  field :cv_curriculum do |entry, _options|
    copy = entry.cv_curriculum
    next nil if copy.nil?

    latest = copy.cv_tailorings.select { |run| run.status == "succeeded" }.max_by { |run| [ run.created_at, run.id ] }
    { id: copy.id, title: copy.title, updated_at: copy.updated_at, fit: latest&.report&.dig("fit") }
  end
end
