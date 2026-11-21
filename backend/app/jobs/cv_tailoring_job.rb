# Reviews a resume against its job in the background and stores the report
# and suggested changes.
class CvTailoringJob < ApplicationJob
  queue_as :default

  JOB_REMOVED = "This job was removed from your board.".freeze

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
    sections = CvTailorings::CvText.call(curriculum)
    result = CvTailorings::Reviewer.new.call(
      job: job, cv_text: CvTailorings::CvText.render(sections), declined_quotes: declined_quotes(cv_tailoring)
    )
    normalized = CvTailorings::Normalizer.call(result[:output], sections)
    finish(cv_tailoring, status: "succeeded", report: normalized[:report], used_posting: result[:used_posting]) do
      normalized[:suggestions].each { |attributes| cv_tailoring.suggestions.create!(attributes) }
    end
  rescue CvTailorings::ReviewError => error
    finish(cv_tailoring, status: "failed", error_message: error.message) if cv_tailoring
  rescue StandardError
    finish(cv_tailoring, status: "failed", error_message: CvTailoring::STALE_MESSAGE) if cv_tailoring
    raise
  end

  private

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
