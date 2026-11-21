class JobBoardEntryBlueprint < ApplicationBlueprint
  identifier :id
  fields :number, :title, :company, :location, :description, :salary, :url, :status,
    :created_at, :updated_at, :closing_date, :cv_text, :cv_key, :cv_filename,
    :cover_letter_text, :cover_letter_key, :cover_letter_filename

  association :job_board_tags, blueprint: JobBoardTagBlueprint

  field :tailored_curriculums do |entry, _options|
    entry.tailored_curriculums.order(:id).map { |curriculum| curriculum.slice(:id, :title, :updated_at) }
  end
end
