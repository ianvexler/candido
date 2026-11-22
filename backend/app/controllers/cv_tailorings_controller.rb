# Review a resume against a job: start a run (optionally on a fresh copy of
# the resume), poll for the latest one, and record decisions on suggestions.
class CvTailoringsController < ApplicationController
  before_action :require_authentication
  before_action -> { CvTailoring.expire_stale! }, only: %i[create create_for_job]

  def create_for_job
    # Missing or empty means the default, a review; to_s keeps a JSON false from counting as empty.
    review = params[:review].to_s.empty? || ActiveModel::Type::Boolean.new.cast(params[:review])
    ensure_available! if review
    job = JobBoardEntry.find_owned!(
      current_user, params[:job_board_entry_id],
      unauthorized_message: "You are not authorized to tailor a CV for this job board entry"
    )
    source = Curriculum.find_owned!(current_user, params.require(:curriculum_id))

    copy, cv_tailoring = ActiveRecord::Base.transaction do
      copy = source.duplicate_for_job!(job)
      job.use_cv_copy!(copy)
      [ copy, (start_run(copy, job) if review) ]
    end
    CvTailoringJob.perform_later(cv_tailoring.id) if cv_tailoring
    render_curriculum_with(copy, cv_tailoring)
  end

  def create
    ensure_available!
    curriculum = Curriculum.find_owned!(current_user, params[:curriculum_id])
    job = curriculum.job_board_entry
    raise ApiError.new("This job was removed from your board.", status: :unprocessable_content) if job.nil?

    cv_tailoring = curriculum.with_lock do
      latest = curriculum.latest_tailoring
      raise ApiError.new("A review is already running.", status: :conflict) if latest&.active?

      CvTailoringSuggestion.where(cv_tailoring_id: curriculum.cv_tailorings.select(:id), status: "pending")
        .update_all(status: "superseded", updated_at: Time.current)
      start_run(curriculum, job)
    end
    CvTailoringJob.perform_later(cv_tailoring.id)
    render json: { cv_tailoring: serialize(cv_tailoring, with: CvTailoringBlueprint) }, status: :created
  end

  def show
    curriculum = Curriculum.find_owned!(current_user, params[:curriculum_id])
    latest = curriculum.latest_tailoring&.expire_if_stale!
    render json: { cv_tailoring: latest && serialize(latest, with: CvTailoringBlueprint) }
  end

  def update_suggestion
    suggestion = CvTailoringSuggestion.find_owned!(current_user, params[:id])
    suggestion.resolve!(status: params[:status].to_s, replacement: params[:replacement])
    render json: { suggestion: serialize(suggestion, with: CvTailoringSuggestionBlueprint) }
  end

  private

  def ensure_available!
    unless CvTailorings::Reviewer.configured?
      raise ApiError.new("CV tailoring isn't available right now.", status: :service_unavailable)
    end
    return unless CvTailoring.limit_reached?(current_user)

    raise ApiError.new("You've tailored a lot of CVs today. Try again tomorrow.", status: :too_many_requests)
  end

  # Snapshots the job's title and company so the run still reads right if the job changes.
  def start_run(curriculum, job)
    current_user.cv_tailorings.create!(
      curriculum: curriculum, job_board_entry: job, job_title: job.title, company: job.company
    )
  end

  def render_curriculum_with(curriculum, cv_tailoring)
    curriculum = Curriculum.includes(:user, curriculum_sections: :section_template).find(curriculum.id)
    render json: {
      curriculum: serialize(curriculum, with: CurriculumBlueprint, view: :full),
      cv_tailoring: cv_tailoring && serialize(cv_tailoring, with: CvTailoringBlueprint)
    }, status: :created
  end
end
