# Reviews a resume against its job in the background and stores the report
# and suggested changes.
class CvTailoringJob < ApplicationJob
  queue_as :default

  JOB_REMOVED = "This job was removed from your board.".freeze
  CV_REMOVED = "This CV was deleted.".freeze

  def perform(cv_tailoring_id)
    # Claim the run in one statement so an expiry can't slip in between
    # checking and starting, and a duplicate run can't review it twice.
    claimed = CvTailoring.where(id: cv_tailoring_id, status: "pending")
      .update_all(status: "processing", updated_at: Time.current)
    return if claimed.zero?

    cv_tailoring = CvTailoring.find(cv_tailoring_id)
    job = cv_tailoring.job_board_entry
    return finish(cv_tailoring, status: "failed", error_message: JOB_REMOVED) if job.nil?

    curriculum = cv_tailoring.curriculum
    return finish(cv_tailoring, status: "failed", error_message: CV_REMOVED) if curriculum.nil?

    sections = CvTailorings::CvText.call(curriculum)
    result = CvTailorings::Reviewer.new.call(
      job: job, cv_text: CvTailorings::CvText.render(sections), declined_quotes: declined_quotes(cv_tailoring),
      heartbeat: -> { heartbeat(cv_tailoring) }
    )
    existing = curriculum.curriculum_sections.pluck(:section_type, :title)
    normalized = CvTailorings::Normalizer.call(result[:output], sections, existing_sections: existing)
    finish(cv_tailoring, status: "succeeded", report: normalized[:report], used_posting: result[:used_posting]) do
      # The user can keep editing during the review: skip sections removed meanwhile.
      remaining = CurriculumSection.where(id: normalized[:suggestions].pluck(:curriculum_section_id)).pluck(:id).to_set
      normalized[:suggestions].each do |attributes|
        cv_tailoring.suggestions.create!(attributes) if remaining.include?(attributes[:curriculum_section_id])
      end
    end
  rescue CvTailorings::ReviewError => error
    finish(cv_tailoring, status: "failed", error_message: error.message) if cv_tailoring
  rescue StandardError
    finish(cv_tailoring, status: "failed", error_message: CvTailoring::STALE_MESSAGE) if cv_tailoring
    raise
  end

  private

  # Marks the run as still working so CvTailoring.expire_stale! leaves it alone.
  def heartbeat(cv_tailoring)
    CvTailoring.where(id: cv_tailoring.id, status: "processing").update_all(updated_at: Time.current)
  end

  # Only passages the user turned down; suggestions closed by a re-run
  # ("superseded") may come back.
  def declined_quotes(cv_tailoring)
    CvTailoringSuggestion
      .joins(:cv_tailoring)
      .where(cv_tailorings: { curriculum_id: cv_tailoring.curriculum_id }, status: "rejected")
      .where.not(cv_tailoring_id: cv_tailoring.id)
      .distinct.pluck(:quote)
  end

  # Only a run still being reviewed is updated: if it expired meanwhile, the
  # user has already been told it failed, so a late result is dropped.
  def finish(cv_tailoring, **attributes)
    cv_tailoring.with_lock do
      next unless cv_tailoring.status == "processing"

      yield if block_given?
      cv_tailoring.update!(attributes)
    end
  end
end
