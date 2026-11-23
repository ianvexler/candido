class CurriculumBlueprint < ApplicationBlueprint
  identifier :id
  fields :user_id, :title, :description, :layout, :styles, :created_at, :updated_at,
    :job_board_entry_id, :source_curriculum_id, :tailored_for

  field :section_count do |curriculum, _options|
    curriculum.curriculum_sections.size
  end

  field :cv_for_job do |curriculum, _options|
    job = curriculum.cv_for_job
    job && { id: job.id, company: job.company }
  end

  view :listed do
    # What a copy was made for, and how its review stands; nil for one of the user's own CVs.
    # Preload as CurriculumsController#index does when listing.
    field :tailoring do |curriculum, _options|
      next nil if curriculum.tailored_for.blank?

      job = curriculum.job_board_entry
      run = curriculum.latest_run_summary
      {
        job: job && { id: job.id, title: job.title, company: job.company, status: job.status },
        source_title: curriculum.source_curriculum&.title,
        fit: curriculum.latest_fit_tailoring&.read_attribute(:fit),
        review_status: run&.shown_status,
        pending_suggestions: run ? run.read_attribute(:pending_suggestions) : 0
      }
    end
  end

  view :full do
    field :header
    field :resolved_header do |curriculum, _options|
      curriculum.resolved_header
    end
    association :curriculum_sections, blueprint: CurriculumSectionBlueprint, name: :sections
  end
end
