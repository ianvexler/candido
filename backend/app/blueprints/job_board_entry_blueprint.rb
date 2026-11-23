class JobBoardEntryBlueprint < ApplicationBlueprint
  identifier :id
  fields :number, :title, :company, :location, :description, :salary, :url, :status,
    :created_at, :updated_at, :closing_date, :cv_text, :cv_key, :cv_filename,
    :cover_letter_text, :cover_letter_key, :cover_letter_filename

  association :job_board_tags, blueprint: JobBoardTagBlueprint

  # `fit` is deliberately the latest *succeeded* run's (last known fit), not the latest run's.
  # `review_status` and `pending_suggestions` are the latest run's.
  # Preload `cv_curriculum: %i[latest_fit_tailoring latest_run_summary]` when listing jobs.
  field :cv_curriculum do |entry, _options|
    copy = entry.cv_curriculum
    next nil if copy.nil?

    run = copy.latest_run_summary
    {
      id: copy.id, title: copy.title, updated_at: copy.updated_at,
      fit: copy.latest_fit_tailoring&.read_attribute(:fit),
      review_status: run&.shown_status,
      pending_suggestions: run ? run.read_attribute(:pending_suggestions) : 0
    }
  end
end
